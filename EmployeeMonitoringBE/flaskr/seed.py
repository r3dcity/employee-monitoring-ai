"""Idempotent seeding of the roles and permissions stored in the users database."""
from flaskr.entities.auth_db.Permission import Permission
from flaskr.entities.auth_db.Role import Role

SECURITY_PERMISSIONS = [
    "READ_ALERT_RULES", "READ_ALERTS", "GET_ALERTS", "GET_PERSONS_DETECTED",
    "READ_VIDEO_STREAM", "READ_VIDEO_CAMERA",
]

ADMIN_PERMISSIONS = SECURITY_PERMISSIONS + [
    "MANAGE_ALERTS", "MANAGE_ALERT_RULES", "CREATE_ALERT_RULES", "UPDATE_ALERT_RULES",
    "DELETE_ALERT_RULES", "CREATE_BLACKLIST", "DELETE_BLACKLIST", "CREATE_EMPLOYEE",
    "DELETE_EMPLOYEE", "CREATE_VIDEO_CAMERA", "CREATE_ZONE", "DELETE_ZONE",
]

ROLE_PERMISSIONS = {
    "ADMIN": ADMIN_PERMISSIONS,
    "SECURITY": SECURITY_PERMISSIONS,
    "SUPERADMIN": ADMIN_PERMISSIONS + ["CREATE_TENANT"],
}


def seed_roles_and_permissions(db):
    """Create missing roles/permissions and link them. Existing rows are left untouched."""
    permissions = {p.name: p for p in db.query(Permission).all()}
    for names in ROLE_PERMISSIONS.values():
        for name in names:
            if name not in permissions:
                permissions[name] = Permission(name=name)
                db.add(permissions[name])

    for role_name, names in ROLE_PERMISSIONS.items():
        role = db.query(Role).filter_by(name=role_name).first()
        if role is None:
            role = Role(name=role_name)
            db.add(role)
        for name in names:
            if permissions[name] not in role.permissions:
                role.permissions.append(permissions[name])
    db.commit()
