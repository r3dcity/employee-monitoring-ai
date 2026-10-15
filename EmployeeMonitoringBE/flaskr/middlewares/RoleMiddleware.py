from functools import wraps
from flaskr.middlewares.AuthMiddleware import auth_required


def role_required(role_name):
    def decorator(f):
        @auth_required
        @wraps(f)
        def decorated_function(current_user, *args, **kwargs):
            if any(role_name == role.name for role in current_user.roles):
                return f(current_user, *args, **kwargs)

            return {"message": "Forbidden"}, 403
        return decorated_function
    return decorator
