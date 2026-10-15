"""Camera worker pipeline with a fake camera and a fake detector."""
import json
import time

import numpy as np
import pytest

from flaskr.services.streaming.hub import EventBus, FrameHub
from flaskr.services.streaming.tracking import Detection
from tests.test_api import add_tenant_rows, camera


class FakeCapture:
    def __init__(self, fail_after=None):
        self.reads = 0
        self.fail_after = fail_after

    def isOpened(self):
        return True

    def read(self):
        self.reads += 1
        if self.fail_after is not None and self.reads > self.fail_after:
            return False, None
        time.sleep(0.01)
        return True, np.zeros((48, 64, 3), dtype=np.uint8)

    def release(self):
        pass


class PersonDetector:
    """Always sees one person standing in the left half of the image."""

    def detect(self, frame):
        return [Detection("1", "Person", (0.1, 0.2, 0.3, 0.9))]


class FakeVision:
    def __init__(self, capture_factory=FakeCapture):
        self.capture_factory = capture_factory
        self.opened = 0

    def open_capture(self, url):
        self.opened += 1
        return self.capture_factory()

    encode_jpeg = staticmethod(lambda frame: b"\xff\xd8fake-jpeg")
    draw = staticmethod(lambda frame, *args: frame)

    def make_detector(self):
        return PersonDetector()

    def make_face_recognizer(self, known_faces):
        raise AssertionError("no face rules in these tests")


def wait_for(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


@pytest.fixture
def live_app(app):
    supervisor = app.extensions["streams"]
    supervisor.toolkit = FakeVision()
    supervisor.settings.detect_fps = 20
    return app


def create_rule(client, headers, **location):
    response = client.post("/alert-rules/", headers=headers, json={
        "description": "Person on camera", "priority": "high", "is_active": True, "cooldown_seconds": 60,
        "conditions_json": {"conditions": [{"type": "object_detected", "object_name": "Person"}]},
        "location": location,
    })
    assert response.status_code == 201, response.get_json()


def test_worker_raises_alert_without_any_viewer(live_app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(live_app, tenant_id, camera())
    create_rule(client, headers, cameras=[1])
    supervisor = live_app.extensions["streams"]
    events = supervisor.bus.subscribe(tenant_id)

    supervisor.ensure(tenant_id, 1)

    alert_event = None
    deadline = time.monotonic() + 5
    while alert_event is None and time.monotonic() < deadline:
        event = events.get(timeout=0.5)
        if event and event["type"] == "alert":
            alert_event = event
    assert alert_event is not None, "no alert was raised"
    assert alert_event["data"]["camera_name"] == "Gate"

    alerts = client.get("/alerts/", headers=headers).get_json()["alerts"]
    assert len(alerts) == 1                                  # cooldown: one alert, not one per frame
    assert alerts[0]["alert_rule_id"] == 1 and alerts[0]["level"] == "high"
    screenshot = client.get(f"/alerts/screenshot/{alerts[0]['id']}", headers=headers)
    assert screenshot.data == b"\xff\xd8fake-jpeg"


def test_rule_on_zone_only_fires_for_people_inside_it(live_app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(live_app, tenant_id, camera())
    right_half = [{"x": 0.5, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0.5, "y": 1}]
    assert client.post("/zone/", headers=headers, json={"zone_name": "Right", "camera_id": 1,
                                                         "points": right_half}).status_code == 201
    create_rule(client, headers, zones=[1])
    supervisor = live_app.extensions["streams"]
    events = supervisor.bus.subscribe(tenant_id)
    supervisor.ensure(tenant_id, 1)

    # The person stands in the left half: detections flow, but no alert
    seen_detection = False
    deadline = time.monotonic() + 1.5
    while time.monotonic() < deadline:
        event = events.get(timeout=0.2)
        assert not (event and event["type"] == "alert")
        seen_detection = seen_detection or bool(event and event["type"] == "detections")
    assert seen_detection


def test_mjpeg_viewers_get_frames_and_reload_picks_up_new_rules(live_app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(live_app, tenant_id, camera())
    supervisor = live_app.extensions["streams"]
    worker = supervisor.ensure(tenant_id, 1)
    assert worker.setup.engine.rules == []

    supervisor.hub.add_viewer(worker.key)
    seq, jpeg = supervisor.hub.wait_next(worker.key, 0, timeout=5)
    assert jpeg == b"\xff\xd8fake-jpeg"

    create_rule(client, headers, cameras=[1])  # the rule router notifies the supervisor
    assert wait_for(lambda: len(worker.setup.engine.rules) == 1)


def test_reader_reconnects_after_stream_drops(live_app, make_user):
    _, tenant_id, _ = make_user("admin@example.com")
    add_tenant_rows(live_app, tenant_id, camera())
    supervisor = live_app.extensions["streams"]
    supervisor.toolkit = FakeVision(capture_factory=lambda: FakeCapture(fail_after=3))
    supervisor.ensure(tenant_id, 1)
    assert wait_for(lambda: supervisor.toolkit.opened >= 2, timeout=5)


def test_dead_worker_is_restarted(live_app, make_user):
    _, tenant_id, _ = make_user("admin@example.com")
    add_tenant_rows(live_app, tenant_id, camera())
    supervisor = live_app.extensions["streams"]
    first = supervisor.ensure(tenant_id, 1)
    first.stop()
    supervisor.restart_dead_workers()
    second = supervisor.ensure(tenant_id, 1)
    assert second is not first and second.is_alive()


def test_event_bus_is_per_tenant_and_drops_for_slow_consumers():
    bus = EventBus()
    a, b = bus.subscribe("a"), bus.subscribe("b")
    bus.publish("a", "alert", {"x": 1})
    assert a.get(timeout=0.1)["data"] == {"x": 1}
    assert b.get(timeout=0.05) is None
    for i in range(500):
        bus.publish("a", "detections", {"i": i})  # never blocks
    assert a.queue.qsize() == a.queue.maxsize


def test_frame_hub_waits_for_new_frames():
    hub = FrameHub()
    assert hub.wait_next("k", 0, timeout=0.05) == (0, None)
    hub.publish("k", b"1")
    seq, jpeg = hub.wait_next("k", 0, timeout=0.05)
    assert jpeg == b"1"
    assert hub.wait_next("k", seq, timeout=0.05) == (seq, None)


def test_camera_password_is_encrypted_at_rest(app, client, make_user):
    from cryptography.fernet import Fernet
    from flask import g
    import flaskr.db as db_module
    from flaskr.entities.VideoCamera import VideoCamera
    from flaskr.services.streaming.setup import camera_source_url

    app.config["CAMERA_SECRET_KEY"] = Fernet.generate_key().decode()
    _, tenant_id, headers = make_user("admin@example.com")
    client.post("/video-cameras/", headers=headers, json={
        "ip": "10.0.0.9", "port": "554", "username": "admin", "password": "p@ss/word", "name": "Dock",
        "location": "North", "stream_path": "/live"})
    with app.test_request_context():
        g.tenant_id = tenant_id
        stored = db_module.get_tenant_db().get(VideoCamera, 1)
        assert stored.password.startswith("enc:") and "p@ss" not in stored.password
        assert camera_source_url(stored) == "rtsp://admin:p%40ss%2Fword@10.0.0.9:554/live"


def test_conditions_json_stays_compatible(app, client, make_user):
    """Rules saved by the frontend as a JSON string are still read by the engine."""
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera())
    client.post("/alert-rules/", headers=headers, json={
        "description": "x", "priority": 2, "is_active": True, "location": {"cameras": [1]},
        "conditions_json": json.dumps({"conditions": [{"type": "ppe_missing", "ppe_type": "vest"}], "logic": "AND"})})
    worker = app.extensions["streams"].ensure(tenant_id, 1)
    assert worker.setup.engine.required_classes() == {"NO-Safety Vest", "Person"}
