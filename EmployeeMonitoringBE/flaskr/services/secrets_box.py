"""Encryption at rest for camera passwords.

With CAMERA_SECRET_KEY set (a Fernet key: `python -c "from cryptography.fernet import Fernet;
print(Fernet.generate_key().decode())"`) new passwords are stored encrypted with an "enc:"
prefix. Values without the prefix (older rows, or no key configured) are plain text, so
existing databases keep working and are encrypted the next time a camera is saved.
"""
from flask import current_app

PREFIX = "enc:"


def _fernet():
    key = current_app.config.get("CAMERA_SECRET_KEY")
    if not key:
        return None
    from cryptography.fernet import Fernet
    return Fernet(key)


def encrypt(value):
    fernet = _fernet()
    if value is None or fernet is None:
        return value
    return PREFIX + fernet.encrypt(value.encode()).decode()


def decrypt(value):
    if not value or not value.startswith(PREFIX):
        return value
    fernet = _fernet()
    if fernet is None:
        raise RuntimeError("CAMERA_SECRET_KEY is required to read encrypted camera passwords")
    return fernet.decrypt(value[len(PREFIX):].encode()).decode()
