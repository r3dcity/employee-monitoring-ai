"""Test fixtures.

The heavy ML/video dependencies (OpenCV, dlib/face_recognition, ultralytics) are replaced
with stubs so the API, auth and tenancy logic can be tested on any machine. Every test
gets fresh SQLite databases (one for users, one file per tenant) in a temp directory.
"""
import io
import sys
import types
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import numpy as np
import pytest


def _install_stub(name, **attrs):
    if name in sys.modules:
        return
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module


_install_stub("cv2")
_install_stub("ultralytics", YOLO=object)
_install_stub(
    "face_recognition",
    load_image_file=lambda path: np.zeros((4, 4, 3)),
    face_encodings=lambda image, *args, **kwargs: [np.zeros(128)],
)

from flaskr import create_app  # noqa: E402
import flaskr.db as db_module  # noqa: E402
from flaskr.entities.auth_db.Role import Role  # noqa: E402
from flaskr.entities.auth_db.Tenant import Tenant  # noqa: E402
from flaskr.entities.auth_db.User import User  # noqa: E402
from flaskr.seed import seed_roles_and_permissions  # noqa: E402
from flaskr.services.AuthService import create_access_token, hash_password  # noqa: E402

JWT_SECRET = "test-secret-that-is-at-least-32-bytes-long"


@pytest.fixture
def app(tmp_path):
    db_module.engine_registry.clear()
    db_module.session_factory_registry.clear()
    static = tmp_path / "static"
    app = create_app({
        "TESTING": True,
        "JWT_SECRET": JWT_SECRET,
        "JWT_EXPIRES_MINUTES": 30,
        "USERS_DATABASE_URL": f"sqlite:///{(tmp_path / 'users.db').as_posix()}",
        "GENERAL_DATABASE_URL": f"sqlite:///{tmp_path.as_posix()}",
        "ALERTS_SCREENSHOTS_PATH": str(static / "alert_screenshots"),
        "PROFILE_PICTURES_PATH": str(static / "profile_pictures"),
        "MASK_ZONES_PATH": str(static / "mask_zones"),
        "PPE_PICTURES_PATH": str(static / "ppe_pictures"),
    })
    with app.app_context():
        seed_roles_and_permissions(db_module.get_users_db())
    yield app
    for engine in db_module.engine_registry.values():
        engine.dispose()
    db_module.engine_registry.clear()
    db_module.session_factory_registry.clear()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def make_user(app):
    """Create a verified user and return (user_id, tenant_id, auth headers)."""
    def _make_user(email, role="ADMIN", organization=None, tenant_id=None, verified=True, password="password123"):
        with app.app_context():
            db = db_module.get_users_db()
            if tenant_id is None:
                tenant = Tenant(name=organization or f"org-{uuid.uuid4().hex[:8]}")
                db.add(tenant)
                db.flush()
                tenant_id = tenant.id
            user = User(email=email, password=hash_password(password), phoneNumber="0712345678",
                        tenant_id=tenant_id, is_verified=verified)
            user.roles.append(db.query(Role).filter_by(name=role).one())
            db.add(user)
            db.commit()
            token = create_access_token(user)
            return user.id, tenant_id, {"Authorization": f"Bearer {token}"}
    return _make_user


@pytest.fixture
def expired_headers(app, make_user):
    user_id, _, _ = make_user("expired@example.com")
    token = jwt.encode({"user_id": str(user_id), "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
                       JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def picture():
    def _picture(name="face.png"):
        return (io.BytesIO(b"fake image bytes"), name)
    return _picture
