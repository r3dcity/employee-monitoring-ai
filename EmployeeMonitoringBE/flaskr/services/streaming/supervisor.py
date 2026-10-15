"""Starts, restarts and stops the camera workers of every tenant."""
import logging
import threading

from flask import g

from flaskr.db import get_tenant_db, get_users_db
from flaskr.entities.VideoCamera import VideoCamera
from flaskr.entities.auth_db.Tenant import Tenant
from flaskr.services.streaming import vision
from flaskr.services.streaming.hub import EventBus, FrameHub
from flaskr.services.streaming.setup import load_camera_setup, save_alert
from flaskr.services.streaming.worker import CameraWorker, WorkerSettings

log = logging.getLogger(__name__)


class VisionToolkit:
    """Real implementations of what CameraWorker needs; tests pass a fake instead."""

    def __init__(self, model_path):
        self.model_path = model_path

    open_capture = staticmethod(vision.open_capture)
    encode_jpeg = staticmethod(vision.encode_jpeg)
    draw = staticmethod(vision.draw_overlays)

    def make_detector(self):
        return vision.YoloDetector(self.model_path)

    def make_face_recognizer(self, known_faces):
        return vision.FaceRecognizer(known_faces)


class StreamSupervisor:
    def __init__(self, app, relay=None, toolkit=None, settings=None, watchdog_interval=10):
        self.app = app
        self.relay = relay
        self.toolkit = toolkit or VisionToolkit(app.config["PPE_MODEL_PATH"])
        self.settings = settings or WorkerSettings(
            detect_fps=app.config["DETECT_FPS"],
            face_fps=app.config["FACE_FPS"],
            stream_fps=app.config["STREAM_FPS"],
            detect_always=app.config["DETECT_ALWAYS"],
        )
        self.hub = FrameHub()
        self.bus = EventBus()
        self.watchdog_interval = watchdog_interval
        self._workers = {}
        self._lock = threading.RLock()
        self._stopping = threading.Event()

    # ---- boot --------------------------------------------------------------------------------
    def start_background(self):
        """Start workers for every existing camera, then keep them alive."""
        threading.Thread(target=self._run, name="stream-supervisor", daemon=True).start()

    def _run(self):
        try:
            self.start_all()
        except Exception:
            log.exception("Could not start camera workers")
        while not self._stopping.wait(self.watchdog_interval):
            self.restart_dead_workers()

    def start_all(self):
        with self.app.app_context():
            tenant_ids = [tenant_id for (tenant_id,) in get_users_db().query(Tenant.id).all()]
        for tenant_id in tenant_ids:
            for camera_id in self._camera_ids(tenant_id):
                self.ensure(tenant_id, camera_id)

    def _camera_ids(self, tenant_id):
        with self.app.app_context():
            g.tenant_id = tenant_id
            return [camera_id for (camera_id,) in get_tenant_db().query(VideoCamera.id).all()]

    # ---- per camera --------------------------------------------------------------------------
    def _key(self, tenant_id, camera_id):
        return f"{tenant_id}:{camera_id}"

    def ensure(self, tenant_id, camera_id):
        """Start the camera's worker unless it is already running."""
        key = self._key(tenant_id, camera_id)
        with self._lock:
            worker = self._workers.get(key)
            if worker is not None and worker.is_alive():
                return worker
            if worker is not None:
                worker.stop(timeout=1)
            worker = CameraWorker(
                self.app, tenant_id, camera_id, hub=self.hub, bus=self.bus, vision=self.toolkit,
                load_setup=lambda app, t, c: load_camera_setup(app, t, c, self.relay, vision.load_face_encoding),
                save_alert=save_alert, settings=self.settings,
            )
            try:
                worker.start()
            except LookupError:
                return None
            except Exception:
                log.exception("Could not start worker for camera %s", key)
                return None
            self._workers[key] = worker
            return worker

    def stop(self, tenant_id, camera_id):
        with self._lock:
            worker = self._workers.pop(self._key(tenant_id, camera_id), None)
        if worker is not None:
            worker.stop()
        if self.relay is not None:
            try:
                self.relay.unregister_camera(tenant_id, camera_id)
            except Exception as e:
                log.warning("Could not remove camera %s from MediaMTX: %s", camera_id, e)

    def restart(self, tenant_id, camera_id):
        """Use after the camera's address or credentials changed."""
        self.stop(tenant_id, camera_id)
        return self.ensure(tenant_id, camera_id)

    def notify_changed(self, tenant_id, camera_id=None):
        """Rules, zones, employees or blacklists changed: workers reload their setup."""
        with self._lock:
            workers = [w for w in self._workers.values()
                       if str(w.tenant_id) == str(tenant_id) and (camera_id is None or w.camera_id == camera_id)]
        for worker in workers:
            worker.request_reload()

    def restart_dead_workers(self):
        with self._lock:
            dead = [w for w in self._workers.values() if not w.is_alive()]
        for worker in dead:
            log.warning("Restarting camera worker %s (%s)", worker.key, worker.last_error)
            self.ensure(worker.tenant_id, worker.camera_id)

    def status(self, tenant_id, camera_id):
        worker = self._workers.get(self._key(tenant_id, camera_id))
        if worker is None:
            return {"status": "stopped", "error": None}
        return {"status": worker.status, "error": worker.last_error}

    def shutdown(self):
        self._stopping.set()
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        for worker in workers:
            worker.stop(timeout=2)
