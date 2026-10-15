"""Regression tests: one organization must never see or change another organization's data."""
from datetime import datetime, timedelta

import flaskr.db as db_module
from flaskr.entities.auth_db.InvitationCodes import InvitationCodes
from flaskr.ML.face_recognition import face_recognition_impl


def test_admin_cannot_delete_guard_of_other_tenant(client, make_user):
    _, _, headers_a = make_user("admin-a@example.com")
    _, tenant_b, _ = make_user("admin-b@example.com")
    guard_b, _, _ = make_user("guard-b@example.com", role="SECURITY", tenant_id=tenant_b)

    assert client.delete(f"/users/security/{guard_b}", headers=headers_a).status_code == 404
    assert client.get(f"/users/security/{guard_b}", headers=headers_a).status_code == 404


def test_admin_can_manage_own_guard(client, make_user):
    _, tenant_a, headers_a = make_user("admin-a@example.com")
    guard_a, _, _ = make_user("guard-a@example.com", role="SECURITY", tenant_id=tenant_a)

    assert client.get(f"/users/security/{guard_a}", headers=headers_a).status_code == 200
    assert client.delete(f"/users/security/{guard_a}", headers=headers_a).status_code == 200


def test_admin_cannot_delete_another_admin(client, make_user):
    _, tenant_a, headers_a = make_user("admin-a@example.com")
    other_admin, _, _ = make_user("admin-a2@example.com", tenant_id=tenant_a)
    assert client.delete(f"/users/security/{other_admin}", headers=headers_a).status_code == 404


def test_guard_list_only_contains_own_tenant(client, make_user):
    _, tenant_a, headers_a = make_user("admin-a@example.com")
    _, tenant_b, _ = make_user("admin-b@example.com")
    make_user("guard-a@example.com", role="SECURITY", tenant_id=tenant_a)
    make_user("guard-b@example.com", role="SECURITY", tenant_id=tenant_b)

    emails = [g["email"] for g in client.get("/users/security", headers=headers_a).get_json()]
    assert emails == ["guard-a@example.com"]


def test_invitation_flow_uses_server_generated_code(client, make_user):
    _, tenant_a, headers_a = make_user("admin-a@example.com", organization="Org A")
    response = client.post("/users/security/invitation", headers=headers_a)
    assert response.status_code == 201
    code = response.get_json()["code"]
    assert len(code) >= 24

    assert client.get(f"/users/whoinvitedme?code={code}").get_json()["organization"]["name"] == "Org A"

    response = client.post("/users/security/register", json={
        "email": "guard@example.com", "password": "password123", "phoneNumber": "0712345678",
        "invitationCode": code,
    })
    assert response.status_code == 201
    assert response.get_json()["user"]["tenant_id"] == str(tenant_a)

    # Codes are single use
    response = client.post("/users/security/register", json={
        "email": "guard2@example.com", "password": "password123", "phoneNumber": "0712345678",
        "invitationCode": code,
    })
    assert response.status_code == 400


def test_expired_invitation_is_rejected(app, client, make_user):
    admin_id, _, _ = make_user("admin-a@example.com")
    with app.app_context():
        db = db_module.get_users_db()
        db.add(InvitationCodes(code="old-code", user_id=admin_id, expires_at=datetime.now() - timedelta(minutes=1)))
        db.commit()

    assert client.get("/users/whoinvitedme?code=old-code").status_code == 400
    response = client.post("/users/security/register", json={
        "email": "guard@example.com", "password": "password123", "phoneNumber": "0712345678",
        "invitationCode": "old-code",
    })
    assert response.status_code == 400


def test_register_guard_without_code_is_400(client):
    response = client.post("/users/security/register", json={
        "email": "guard@example.com", "password": "password123", "phoneNumber": "0712345678",
    })
    assert response.status_code == 400


def test_profile_pictures_are_stored_per_tenant(app, client, make_user, picture, monkeypatch):
    monkeypatch.setattr(face_recognition_impl, "encode_picture", lambda path: [0.0] * 128)
    _, tenant_a, headers_a = make_user("admin-a@example.com")
    _, tenant_b, headers_b = make_user("admin-b@example.com")

    form = {"firstName": "Ana", "lastName": "Pop", "phoneNumber": "0712345678", "role": "Worker", "department": "Ops"}
    for headers, content in ((headers_a, b"tenant a"), (headers_b, b"tenant b")):
        import io
        response = client.post("/employees/", headers=headers, content_type="multipart/form-data",
                               data={**form, "profile-picture": (io.BytesIO(content), "face.png")})
        assert response.status_code == 201
        assert response.get_json()["employee"]["id"] == 1  # same id in both tenant databases

    assert client.get("/employees/1/profile-picture", headers=headers_a).data == b"tenant a"
    assert client.get("/employees/1/profile-picture", headers=headers_b).data == b"tenant b"


def test_employee_upload_rejects_non_images(client, make_user, picture):
    _, _, headers = make_user("admin-a@example.com")
    form = {"firstName": "Ana", "lastName": "Pop", "phoneNumber": "0712345678", "role": "Worker",
            "department": "Ops", "profile-picture": picture("script.exe")}
    response = client.post("/employees/", headers=headers, content_type="multipart/form-data", data=form)
    assert response.status_code == 400


def test_employee_without_detectable_face_is_400(client, make_user, picture, monkeypatch):
    def no_face(path):
        raise Exception("No face detected")
    monkeypatch.setattr(face_recognition_impl, "encode_picture", no_face)
    _, _, headers = make_user("admin-a@example.com")
    form = {"firstName": "Ana", "lastName": "Pop", "phoneNumber": "0712345678", "role": "Worker",
            "department": "Ops", "profile-picture": picture()}
    response = client.post("/employees/", headers=headers, content_type="multipart/form-data", data=form)
    assert response.status_code == 400
    assert "No face detected" in response.get_json()["message"]
    assert client.get("/employees/", headers=headers).get_json() == []


def test_delete_employee(client, make_user, picture, monkeypatch):
    monkeypatch.setattr(face_recognition_impl, "encode_picture", lambda path: [0.0] * 128)
    _, _, headers = make_user("admin-a@example.com")
    form = {"firstName": "Ana", "lastName": "Pop", "phoneNumber": "0712345678", "role": "Worker",
            "department": "Ops", "profile-picture": picture()}
    client.post("/employees/", headers=headers, content_type="multipart/form-data", data=form)

    assert client.delete("/employees/1", headers=headers).status_code == 200
    assert client.get("/employees/1", headers=headers).status_code == 404
