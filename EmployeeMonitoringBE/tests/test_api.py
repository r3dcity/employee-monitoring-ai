import json
from datetime import datetime, timedelta

import flaskr.db as db_module
from flask import g
from flaskr.entities.Alert import Alert, AlertLevel, AlertStatus, AlertType
from flaskr.entities.Employee import Employee
from flaskr.entities.VideoCamera import VideoCamera
from flaskr.entities.Zone import Zone
from flaskr.entities.Blacklist import Blacklist


def add_tenant_rows(app, tenant_id, *rows):
    with app.test_request_context():
        g.tenant_id = tenant_id
        db = db_module.get_tenant_db()
        for row in rows:
            db.add(row)
        db.commit()


def camera(name="Gate"):
    return VideoCamera(ip="10.0.0.2", port="554", username="u", password="secret", name=name,
                       location="Entrance", status=VideoCamera.CameraStatus.INACTIVE)


def rule_payload(**overrides):
    payload = {
        "description": "Person at the gate",
        "priority": "high",
        "conditions_json": json.dumps({"conditions": [{"type": "object_detected", "object_name": "Person"}],
                                       "logic": "and"}),
        "location": {"cameras": [1]},
    }
    payload.update(overrides)
    return payload


def test_rule_logic_key_is_normalized(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera())

    response = client.post("/alert-rules/", headers=headers, json=rule_payload())
    assert response.status_code == 201

    rule = client.get("/alert-rules/", headers=headers).get_json()[0]
    assert rule["conditions_json"]["logical_operator"] == "AND"
    assert "logic" not in rule["conditions_json"]
    assert rule["cameras"] == [1]


def test_rule_validation_errors_are_400(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera())

    assert client.post("/alert-rules/", headers=headers, json={"description": "x"}).status_code == 400
    assert client.post("/alert-rules/", headers=headers,
                       json=rule_payload(conditions_json="{not json")).status_code == 400
    assert client.post("/alert-rules/", headers=headers,
                       json=rule_payload(location={"cameras": [99]})).status_code == 400


def test_rule_update_validates_conditions(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera())
    client.post("/alert-rules/", headers=headers, json=rule_payload())

    assert client.put("/alert-rules/1", headers=headers, json={"conditions_json": {"oops": 1}}).status_code == 400
    assert client.put("/alert-rules/1", headers=headers, json={"priority": "low"}).status_code == 200


def test_camera_list_does_not_expose_password(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera())

    cameras = client.get("/video-cameras/", headers=headers).get_json()["cameras"]
    assert "password" not in cameras[0]


def test_camera_status_is_scoped_per_tenant(app, client, make_user):
    from flaskr.routes import VideoCameraRouter

    _, tenant_a, headers_a = make_user("admin-a@example.com")
    _, tenant_b, headers_b = make_user("admin-b@example.com")
    add_tenant_rows(app, tenant_a, camera("Main camera"))
    add_tenant_rows(app, tenant_b, camera("Main camera"))

    # Tenant A is streaming its "Main camera"; tenant B's camera with the same name is not
    key = VideoCameraRouter.stream_key(tenant_a, "Main camera")
    VideoCameraRouter.active_cameras[key] = {"running": True, "filters": [], "generation": 1}
    try:
        status_a = client.get("/video-cameras/", headers=headers_a).get_json()["cameras"][0]["status"]
        status_b = client.get("/video-cameras/", headers=headers_b).get_json()["cameras"][0]["status"]
    finally:
        VideoCameraRouter.active_cameras.pop(key)
    assert (status_a, status_b) == ("active", "inactive")


def test_stream_requires_valid_token(client):
    assert client.get("/video-cameras/Gate/stream").status_code == 401
    assert client.get("/video-cameras/Gate/stream?token=garbage").status_code == 401


def test_alerts_are_newest_first_and_paginated(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    now = datetime.now()
    add_tenant_rows(app, tenant_id, *[
        Alert(type=AlertType.PERSON_DETECTED, level=AlertLevel.LOW, status=AlertStatus.ACTIVE,
              explanation=f"alert {i}", timestamp=now - timedelta(minutes=10 - i))
        for i in range(3)
    ])

    alerts = client.get("/alerts/", headers=headers).get_json()["alerts"]
    assert [a["explanation"] for a in alerts] == ["alert 2", "alert 1", "alert 0"]

    page = client.get("/alerts/?limit=1&offset=1", headers=headers).get_json()["alerts"]
    assert [a["explanation"] for a in page] == ["alert 1"]


def test_blacklist_delete(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera(),
                    Employee(firstName="Ana", lastName="Pop", phoneNumber="1", role="r", department="d"))
    add_tenant_rows(app, tenant_id, Zone(name="Storage", mask="m.png", video_camera_id=1))
    add_tenant_rows(app, tenant_id, Blacklist(employee_id=1, zone_id=1))

    response = client.delete("/blacklist/", headers=headers, json={"employees": [1], "zone_id": 1})
    assert response.status_code == 200
    # Deleting again: the employee is no longer blacklisted in that zone
    response = client.delete("/blacklist/", headers=headers, json={"employees": [1], "zone_id": 1})
    assert response.status_code == 400


def test_zone_delete_cleans_up_references(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera(),
                    Employee(firstName="Ana", lastName="Pop", phoneNumber="1", role="r", department="d"))
    add_tenant_rows(app, tenant_id, Zone(name="Storage", mask="m.png", video_camera_id=1))
    add_tenant_rows(app, tenant_id, Blacklist(employee_id=1, zone_id=1))

    assert client.delete("/zone/", headers=headers, json={"zone_id": 1}).status_code == 200
    assert client.delete("/zone/", headers=headers, json={"zone_id": 1}).status_code == 404


def test_zone_create_on_inactive_camera_is_409(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera())
    response = client.post("/zone/", headers=headers, json={
        "zone_name": "Door", "camera_id": 1, "camera_name": "Gate",
        "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}],
    })
    assert response.status_code == 409


def test_zone_list_filters_by_camera(app, client, make_user):
    _, tenant_id, headers = make_user("admin@example.com")
    add_tenant_rows(app, tenant_id, camera("Gate"), camera("Yard"))
    add_tenant_rows(app, tenant_id,
                    Zone(name="Door", mask="a.png", video_camera_id=1,
                         points=json.dumps([{"x": 0.1, "y": 0.1}, {"x": 0.5, "y": 0.1}, {"x": 0.5, "y": 0.5}])),
                    Zone(name="Fence", mask="b.png", video_camera_id=2))

    zones = client.get("/zone/?camera_id=1", headers=headers).get_json()["zones"]
    assert [z["name"] for z in zones] == ["Door"]
    assert zones[0]["points"][1] == {"x": 0.5, "y": 0.1}
    assert len(client.get("/zone/", headers=headers).get_json()["zones"]) == 2
