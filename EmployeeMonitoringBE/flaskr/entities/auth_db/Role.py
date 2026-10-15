import uuid
from typing import List
from sqlalchemy import String
from sqlalchemy import Uuid
from sqlalchemy.orm import relationship
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity
from flaskr.entities.BaseEntity import  mapped_column, Mapped
from flaskr.entities.auth_db.Permission import Permission
from flaskr.entities.auth_db.RolePermission import RolePermission

class Role(AuthBaseEntity):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(nullable=False, unique=True)

    # Relationships
    permissions: Mapped[List["Permission"]] = relationship(secondary="roles_permissions")
