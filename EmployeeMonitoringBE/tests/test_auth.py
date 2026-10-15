import jwt

from tests.conftest import JWT_SECRET


def test_missing_token_is_401(client):
    assert client.get("/employees/").status_code == 401


def test_malformed_authorization_header_is_401(client):
    assert client.get("/employees/", headers={"Authorization": "Bearer"}).status_code == 401
    assert client.get("/employees/", headers={"Authorization": "garbage"}).status_code == 401


def test_invalid_signature_is_401(client, make_user):
    user_id, _, _ = make_user("admin@example.com")
    forged = jwt.encode({"user_id": str(user_id)}, "another-secret-that-is-32-bytes-long", algorithm="HS256")
    response = client.get("/employees/", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_expired_token_is_401(client, expired_headers):
    response = client.get("/employees/", headers=expired_headers)
    assert response.status_code == 401
    assert response.get_json()["message"] == "Token expired"


def test_missing_permission_is_403(client, make_user):
    _, _, headers = make_user("guard@example.com", role="SECURITY")
    assert client.get("/employees/", headers=headers).status_code == 403


def test_login_issues_expiring_token(client, make_user):
    make_user("admin@example.com")
    response = client.post("/users/login", json={"email": "admin@example.com", "password": "password123"})
    assert response.status_code == 200
    payload = jwt.decode(response.get_json()["token"], JWT_SECRET, algorithms=["HS256"])
    assert "exp" in payload


def test_login_rejects_unverified_user(client, make_user):
    make_user("new@example.com", verified=False)
    response = client.post("/users/login", json={"email": "new@example.com", "password": "password123"})
    assert response.status_code == 403


def test_login_rejects_wrong_password(client, make_user):
    make_user("admin@example.com")
    response = client.post("/users/login", json={"email": "admin@example.com", "password": "nope"})
    assert response.status_code == 400


def test_refresh_returns_new_token(client, make_user):
    _, _, headers = make_user("admin@example.com")
    response = client.post("/users/refresh", headers=headers)
    assert response.status_code == 200
    assert response.get_json()["token"]


def test_refresh_rejects_expired_token(client, expired_headers):
    assert client.post("/users/refresh", headers=expired_headers).status_code == 401
