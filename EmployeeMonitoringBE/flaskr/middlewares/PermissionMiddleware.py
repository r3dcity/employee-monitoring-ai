from functools import wraps
from flaskr.middlewares.AuthMiddleware import auth_required


def has_permission(user, permission_name):
    return any(permission.name == permission_name
               for role in user.roles
               for permission in role.permissions)


def permission_required(permission_name):
    def decorator(f):
        @auth_required
        @wraps(f)
        def decorated_function(current_user, *args, **kwargs):
            if not has_permission(current_user, permission_name):
                return {"message": "Forbidden"}, 403
            return f(current_user, *args, **kwargs)
        return decorated_function
    return decorator
