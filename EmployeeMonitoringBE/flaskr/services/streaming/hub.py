"""In-process fan-out for live data.

- EventBus: alerts, detections and camera status changes, per tenant (consumed by the SSE
  endpoint). Slow consumers lose events instead of blocking the camera workers.
- FrameHub: the latest annotated JPEG per camera for MJPEG viewers. Viewers wait on a
  condition variable for the next frame instead of polling, and workers only encode JPEGs
  while somebody is watching.

Both live in the API process, which is why gunicorn runs a single process (with threads).
Moving them to Redis pub/sub would allow several processes.
"""
import itertools
import queue
import threading
import time


class Subscription:
    def __init__(self, tenant_id, maxsize=200):
        self.tenant_id = tenant_id
        self.queue = queue.Queue(maxsize=maxsize)

    def get(self, timeout):
        try:
            return self.queue.get(timeout=timeout)
        except queue.Empty:
            return None


class EventBus:
    def __init__(self):
        self._lock = threading.Lock()
        self._subscriptions = set()
        self._ids = itertools.count(1)

    def subscribe(self, tenant_id):
        sub = Subscription(str(tenant_id))
        with self._lock:
            self._subscriptions.add(sub)
        return sub

    def unsubscribe(self, sub):
        with self._lock:
            self._subscriptions.discard(sub)

    def publish(self, tenant_id, event_type, data):
        event = {"id": next(self._ids), "type": event_type, "data": data, "time": time.time()}
        with self._lock:
            targets = [s for s in self._subscriptions if s.tenant_id == str(tenant_id)]
        for sub in targets:
            try:
                sub.queue.put_nowait(event)
            except queue.Full:
                pass  # the browser is not keeping up; it will catch up with the next events
        return event


class FrameHub:
    def __init__(self):
        self._lock = threading.Condition()
        self._frames = {}    # key -> (seq, jpeg bytes)
        self._viewers = {}   # key -> count

    def viewers(self, key):
        with self._lock:
            return self._viewers.get(key, 0)

    def add_viewer(self, key):
        with self._lock:
            self._viewers[key] = self._viewers.get(key, 0) + 1

    def remove_viewer(self, key):
        with self._lock:
            self._viewers[key] = max(0, self._viewers.get(key, 0) - 1)

    def publish(self, key, jpeg):
        with self._lock:
            seq = self._frames.get(key, (0, None))[0] + 1
            self._frames[key] = (seq, jpeg)
            self._lock.notify_all()

    def clear(self, key):
        with self._lock:
            self._frames.pop(key, None)
            self._lock.notify_all()

    def wait_next(self, key, last_seq, timeout=5.0):
        """Block until a frame newer than last_seq exists. Returns (seq, jpeg) or (last_seq, None)."""
        deadline = time.monotonic() + timeout
        with self._lock:
            while True:
                seq, jpeg = self._frames.get(key, (0, None))
                if jpeg is not None and seq != last_seq:
                    return seq, jpeg
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return last_seq, None
                self._lock.wait(remaining)
