from flask import Blueprint, request, current_app as app
from flaskr.db import get_users_db
from flaskr.entities.auth_db.Role import Role
from flaskr.entities.auth_db.Permission import Permission
from flaskr.entities.auth_db.RolePermission import RolePermission
from flaskr.middlewares.RoleMiddleware import role_required


bp = Blueprint("admin", __name__, url_prefix="/admin")

@bp.route("/roles", methods=["POST"])
@role_required("SUPERADMIN")
def create_role(current_user):
    """
        Request body:
        {
            "role": "name",
            "permissions": ["permission1", "permission2"]
        }
        """
    try:
        
        data = request.get_json()
        db = get_users_db()

        if data == None:
            return {"message": "No data provided"}, 400
        if "role" not in data:
            return {"message": "Role name is required"}, 400
        if "permissions" not in data:
            return {"message": "Permissions are required"}, 400

        if db.query(Role).filter_by(name=data["role"]).first():
            return {"message": "Role already exists"}, 400
        role = Role(name=data["role"])
        db.add(role)

        permissions_created = []
        for name in data["permissions"]:
            permission = db.query(Permission).filter_by(name=name).first()
            if permission is None:
                permission = Permission(name=name)
                db.add(permission)
            permissions_created.append(permission)
        
        db.flush()
        for permission in permissions_created:
            role_permission = RolePermission(role_id=role.id, permission_id=permission.id)
            db.add(role_permission)
        
        db.commit()
        return {"message": "Role created successfully"}, 201
    except Exception as e:
        app.logger.error(e)
        return {"message": "An error occured"}, 500 
    
@bp.route("/permissions", methods=["POST"])
@role_required("SUPERADMIN")
def create_permissions(current_user):
    """
        Request body:
        {
            "roles": ["existing role1", "existing role2"]
            "permissions": ["new permission 1", "new permission 2"]
        }    
    """
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or "roles" not in data or "permissions" not in data:
            return {"message": "Roles and permissions are required"}, 400
        db = get_users_db()

        roles = []
        for role_name in data["roles"]:
            role = db.query(Role).filter_by(name=role_name).first()
            if role == None:
                return {"message": f"Role {role_name} does not exist"}, 400
            else:
                roles.append(role)

        permissions_created = []
        for name in data["permissions"]:
            permission = db.query(Permission).filter_by(name=name).first()
            if permission == None:
                permission = Permission(name=name)
                db.add(permission)
            permissions_created.append(permission)
        db.flush()

        for permission in permissions_created:
            for role in roles:
                role_permission = db.query(RolePermission).filter_by(role_id=role.id, permission_id=permission.id).first()
                if role_permission != None:
                    continue
                role_permission = RolePermission(role_id=role.id, permission_id=permission.id)
                db.add(role_permission)
        
        db.commit()
        return {"message": "Permissions created successfully","role": [role.name for role in roles], "permissions": [p.name for p in permissions_created]}, 201
    except Exception as e:
        app.logger.error(e)
        return {"message": "An error occured"}, 500