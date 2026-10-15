from functools import wraps
from flask import request, g
from flaskr.db import get_users_db
from flaskr.entities.auth_db.User import User
from flaskr.services.AuthService import decode_access_token, TokenError


def get_bearer_token():
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip() or None


def authenticate(token):
    """Resolve a token to a user and bind its tenant to the request.

    Returns (user, None) on success or (None, (body, status)) on failure.
    """
    try:
        user_id = decode_access_token(token)
    except TokenError as e:
        return None, ({"message": e.message}, 401)

    user = get_users_db().get(User, user_id)
    if user is None:
        return None, ({"message": "Invalid token"}, 401)

    # Set the tenant database such that it will query that specific one
    g.tenant_id = user.tenant_id
    return user, None


def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user, error = authenticate(get_bearer_token())
        if error:
            return error
        return f(user, *args, **kwargs)
    return decorated
