from sqlalchemy import ForeignKey
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity
from sqlalchemy.orm import Mapped, mapped_column
import uuid

class RolePermission(AuthBaseEntity):
    __tablename__ = "roles_permissions"
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    permission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("permissions.id"), primary_key=True)