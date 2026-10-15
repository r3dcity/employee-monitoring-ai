"""One background worker per camera.

Two threads:
  reader     keeps exactly one connection to the camera (or to the MediaMTX relay), always
             holds only the most recent frame (old frames are dropped, so latency cannot pile
             up), and reconnects with exponential backoff.
  processor  runs object detection / face recognition at a fixed, configurable rate, updates
             the TrackState, evaluates the rules, saves alerts and publishes events. When MJPEG
             viewers are connected it also draws overlays and encodes JPEGs at the stream rate.

Workers run whether or not somebody is watching, so alerts are raised 24/7. They are started,
restarted and stopped by the StreamSupervisor.
"""
import logging
import threading
import time
from dataclasses import dataclass, field

from flask import g

from flaskr.services.rule_system.RuleInference import RuleInference
from flaskr.services.streaming.tracking import Face, FaceDwell, FrameContext, TrackState

log = logging.getLogger(__name__)


@dataclass
class WorkerSettings:
    detect_fps: float = 5.0        # object detection rate
    face_fps: float = 1.0          # face recognition rate (much more expensive)
    stream_fps: float = 12.0       # MJPEG frame rate while somebody watches
    detect_always: bool = True     # also detect without rules, so viewers see boxes
    track_ttl: float = 2.0
    max_backoff: float = 30.0


@dataclass
class CameraSetup:
    """Everything a worker loads from the tenant database (reloaded when it changes)."""
    camera_id: int
    name: str
    source_url: str
    engine: RuleInference
    zones: dict = field(default_factory=dict)            # zone_id -> normalized polygon
    known_faces: dict = field(default_factory=dict)      # employee_id -> encoding
    employee_names: dict = field(default_factory=dict)   # employee_id -> "First Last"
    blacklist: dict = field(default_factory=dict)        # zone_id -> {employee ids}


class CameraWorker:
    def __init__(self, app, tenant_id, camera_id, *, hub, bus, vision, load_setup, save_alert,
                 settings=None):
        self.app = app
        self.tenant_id = tenant_id
        self.camera_id = camera_id
        self.key = f"{tenant_id}:{camera_id}"
        self.hub = hub
        self.bus = bus
        self.vision = vision
        self.load_setup = load_setup      # (app, tenant_id, camera_id) -> CameraSetup | None
        self.save_alert = save_alert      # (app, tenant_id, TriggeredAlert, jpeg) -> dict
        self.settings = settings or WorkerSettings()

        self.status = "starting"
        self.last_error = None
        self.setup = None
        self._stop = threading.Event()
        self._reload = threading.Event()
        self._frame_lock = threading.Lock()
        self._frame = None
        self._frame_seq = 0
        self._threads = []

    # ---- lifecycle ---------------------------------------------------------------------------
    def start(self):
        self.setup = self.load_setup(self.app, self.tenant_id, self.camera_id)
        if self.setup is None:
            raise LookupError(f"Camera {self.camera_id} not found")
        self._threads = [
            threading.Thread(target=self._guard, args=(self._read_loop,), name=f"reader-{self.key}", daemon=True),
            threading.Thread(target=self._guard, args=(self._process_loop,), name=f"processor-{self.key}", daemon=True),
        ]
        for thread in self._threads:
            thread.start()

    def stop(self, timeout=5):
        self._stop.set()
        for thread in self._threads:
            thread.join(timeout)
        self.hub.clear(self.key)

    def request_reload(self):
        self._reload.set()

    def is_alive(self):
        return bool(self._threads) and all(t.is_alive() for t in self._threads)

    def _guard(self, loop):
        try:
            loop()
        except Exception as e:  # a crashed thread is restarted by the supervisor
            self.last_error = str(e)
            self._set_status("error")
            log.exception("Camera worker %s crashed", self.key)
            self._stop.set()

    def _set_status(self, status):
        if status != self.status:
            self.status = status
            self.bus.publish(self.tenant_id, "camera_status", {"camera_id": self.camera_id, "status": status})

    # ---- reader ------------------------------------------------------------------------------
    def _read_loop(self):
        backoff = 1.0
        while not self._stop.is_set():
            self._set_status("connecting")
            capture = self.vision.open_capture(self.setup.source_url)
            if not capture.isOpened():
                capture.release()
                self.last_error = "Could not open the stream"
                self._set_status("offline")
                self._stop.wait(backoff)
                backoff = min(backoff * 2, self.settings.max_backoff)
                continue

            backoff = 1.0
            self._set_status("live")
            source = self.setup.source_url
            while not self._stop.is_set() and source == self.setup.source_url:
                ok, frame = capture.read()
                if not ok:
                    self.last_error = "Stream interrupted"
                    break
                with self._frame_lock:
                    self._frame = frame
                    self._frame_seq += 1
            capture.release()

    def latest_frame(self):
        with self._frame_lock:
            return self._frame, self._frame_seq

    # ---- processor ---------------------------------------------------------------------------
    def _process_loop(self):
        s = self.settings
        tracks = TrackState(ttl=s.track_ttl)
        face_dwell = FaceDwell()
        detector = recognizer = None
        detector_failed = False
        visible, faces = [], []
        last_seq = 0
        last_detect = last_face = last_stream = 0.0

        def configure():
            nonlocal recognizer
            tracks.set_zones(self.setup.zones)
            recognizer = None
            if self.setup.engine.needs_faces():
                recognizer = self.vision.make_face_recognizer(self.setup.known_faces)

        configure()
        while not self._stop.is_set():
            if self._reload.is_set():
                self._reload.clear()
                new_setup = self.load_setup(self.app, self.tenant_id, self.camera_id)
                if new_setup is None:      # camera deleted
                    self._stop.set()
                    return
                self.setup = new_setup
                configure()

            frame, seq = self.latest_frame()
            if frame is None or seq == last_seq:
                self._stop.wait(0.01)
                continue
            last_seq = seq
            now = time.time()

            wants_detection = s.detect_always or bool(self.setup.engine.required_classes())
            if wants_detection and detector is None and not detector_failed:
                try:
                    detector = self.vision.make_detector()
                except Exception as e:
                    detector_failed = True
                    self.last_error = f"Object detector unavailable: {e}"
                    log.error("Camera %s: %s", self.key, self.last_error)

            if detector is not None and wants_detection and now - last_detect >= 1 / s.detect_fps:
                last_detect = now
                visible, exits = tracks.update(detector.detect(frame), now)

                if recognizer is not None and now - last_face >= 1 / s.face_fps:
                    last_face = now
                    faces = self._recognize(recognizer, frame, visible, tracks, face_dwell, now)

                context = FrameContext(
                    timestamp=now, camera_id=self.camera_id, objects=visible, exits=exits,
                    faces=faces, face_recognition_active=recognizer is not None,
                    blacklist=self.setup.blacklist,
                )
                for triggered in self.setup.engine.infer(context):
                    self._raise_alert(triggered, frame, visible, faces)
                self._publish_detections(visible, faces, now)

            if self.hub.viewers(self.key) > 0 and now - last_stream >= 1 / s.stream_fps:
                last_stream = now
                annotated = self.vision.draw(frame, visible, faces, self.setup.employee_names, self.setup.zones)
                jpeg = self.vision.encode_jpeg(annotated)
                if jpeg:
                    self.hub.publish(self.key, jpeg)

    def _recognize(self, recognizer, frame, visible, tracks, face_dwell, now):
        found = recognizer.recognize(frame)
        face_dwell.update([employee_id for employee_id, _ in found if employee_id is not None], now)
        faces = []
        for employee_id, bbox in found:
            # A face is in the zones of the person whose box contains it (zones are on the floor)
            cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
            owner = next((t for t in visible if t.class_name.lower() == "person"
                          and t.bbox[0] <= cx <= t.bbox[2] and t.bbox[1] <= cy <= t.bbox[3]), None)
            zones = set(owner.zones) if owner else tracks.zones_containing(bbox)
            faces.append(Face(employee_id, bbox, zones, face_dwell.dwell(employee_id, now) if employee_id else 0.0))
        return faces

    def _raise_alert(self, triggered, frame, visible, faces):
        try:
            annotated = self.vision.draw(frame, visible, faces, self.setup.employee_names, self.setup.zones)
            alert = self.save_alert(self.app, self.tenant_id, triggered, self.vision.encode_jpeg(annotated))
            self.bus.publish(self.tenant_id, "alert", alert)
        except Exception:
            log.exception("Camera %s: could not save alert for rule %s", self.key, triggered.rule_id)

    def _publish_detections(self, visible, faces, now):
        self.bus.publish(self.tenant_id, "detections", {
            "camera_id": self.camera_id,
            "timestamp": now,
            "objects": [{"id": t.track_id, "class": t.class_name, "bbox": t.bbox, "zones": sorted(t.zones)}
                        for t in visible],
            "faces": [{"employee_id": f.employee_id,
                       "name": self.setup.employee_names.get(f.employee_id, "Unknown"),
                       "bbox": f.bbox} for f in faces],
        })


def run_in_tenant(app, tenant_id, fn):
    """Run fn() inside an app context bound to a tenant database (for worker threads)."""
    with app.app_context():
        g.tenant_id = tenant_id
        return fn()
