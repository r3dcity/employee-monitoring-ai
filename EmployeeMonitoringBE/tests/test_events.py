import json
import threading

from flaskr.services.streaming.media_relay import path_name, parse_path_name
from tests.test_api import add_tenant_rows, camera


def read_events(response, count):
    """Read `count` SSE events (skipping comments) from a streaming test response."""
    events, buffer = [], ""
    for chunk in response.response:
        buffer += chunk.decode() if isinstance(chunk, bytes) else chunk
        while "\n\n" in buffer:
            block, buffer = buffer.split("\n\n", 1)
            fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line and not line.startswith(":"))
            if "event" in fields:
                events.append((fields["event"], json.loads(fields["data"])))
                if len(events) == count:
                    return events
    return events


def test_events_stream_delivers_tenant_alerts_and_filters_detections(app, client, make_user):
    _, tenant_a, headers_a = make_user("admin-a@example.com")
    _, tenant_b, _ = make_user("admin-b@example.com")
    url = client.post("/events/ticket", headers=headers_a).get_json()["url"]
    response = client.get(url + "&cameras=1", buffered=False)
    assert response.status_code == 200
    assert response.mimetype == "text/event-stream"

    bus = app.extensions["streams"].bus

    def publish():
        bus.publish(tenant_b, "alert", {"id": 99})                              # other tenant
        bus.publish(tenant_a, "detections", {"camera_id": 2, "objects": []})    # not subscribed
        bus.publish(tenant_a, "detections", {"camera_id": 1, "objects": []})
        bus.publish(tenant_a, "alert", {"id": 1})

    threading.Timer(0.3, publish).start()
    events = read_events(response, 2)
    response.close()
    assert events == [("detections", {"camera_id": 1, "objects": []}), ("alert", {"id": 1})]


def test_events_stream_requires_events_ticket(client, make_user):
    _, _, headers = make_user("admin@example.com")
    assert client.get("/events/stream").status_code == 401
    session_token = headers["Authorization"].split()[1]
    assert client.get(f"/events/stream?ticket={session_token}").status_code == 401


def test_path_names_round_trip():
    tenant = "1b6166ec-8f32-450b-958b-64654071b5b7"
    assert parse_path_name(path_name(tenant, 12)) == (tenant, 12)
    assert parse_path_name("something-else") is None


def test_media_auth(app, client, make_user):
    app.config.update(MEDIA_INTERNAL_USER="internal", MEDIA_INTERNAL_PASSWORD="s3cret")
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera("Gate"), camera("Yard"))
    app.config["MEDIAMTX_API_URL"] = "http://mediamtx:9997"
    webrtc = client.get("/video-cameras/1/playback", headers=headers).get_json()["webrtc"]
    ticket = webrtc.split("ticket=")[1]

    def auth(**body):
        return client.post("/internal/media-auth", json=body).status_code

    assert auth(user="internal", password="s3cret", action="read", path="anything") == 200
    assert auth(user="internal", password="wrong", action="read", path="anything") == 401
    assert auth(action="read", path=path_name(tenant_id, 1), query=f"ticket={ticket}") == 200
    assert auth(action="read", path=path_name(tenant_id, 2), query=f"ticket={ticket}") == 401   # other camera
    assert auth(action="publish", path=path_name(tenant_id, 1), query=f"ticket={ticket}") == 401
    assert auth(action="read", path=path_name(tenant_id, 1), query="ticket=garbage") == 401
