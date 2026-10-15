import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import current_app as app


def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())


def check_password(password, hashed_password):
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password)


def create_access_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        "roles": [role.name for role in user.roles],
        "iat": now,
        "exp": now + timedelta(minutes=app.config["JWT_EXPIRES_MINUTES"]),
    }
    return jwt.encode(payload, app.config["JWT_SECRET"], algorithm="HS256")


TICKET_TTL_SECONDS = 60


def create_ticket(user, scope, **claims):
    """Short-lived, single-purpose token for URLs that cannot carry an Authorization header
    (<img>/<video> sources, EventSource, WebRTC signalling). Unlike the session token it is
    useless after a minute and only valid for `scope`."""
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "scope": scope,
        "iat": now,
        "exp": now + timedelta(seconds=TICKET_TTL_SECONDS),
        **claims,
    }
    return jwt.encode(payload, app.config["JWT_SECRET"], algorithm="HS256")


def decode_ticket(ticket, scope):
    """Return the ticket claims, raising TokenError if it is invalid, expired or for another scope."""
    if not ticket:
        raise TokenError("Ticket is missing")
    try:
        claims = jwt.decode(ticket, app.config["JWT_SECRET"], algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise TokenError("Ticket expired")
    except jwt.InvalidTokenError:
        raise TokenError("Invalid ticket")
    if claims.get("scope") != scope:
        raise TokenError("Invalid ticket")
    return claims


class TokenError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


def decode_access_token(token):
    """Return the token's user id as a UUID, raising TokenError when the token is unusable."""
    if not token:
        raise TokenError("Token is missing")
    try:
        data = jwt.decode(token, app.config["JWT_SECRET"], algorithms=["HS256"])
        if "scope" in data:
            raise TokenError("Invalid token")  # a ticket is not a session token
        return uuid.UUID(data["user_id"])
    except jwt.ExpiredSignatureError:
        raise TokenError("Token expired")
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        raise TokenError("Invalid token")
