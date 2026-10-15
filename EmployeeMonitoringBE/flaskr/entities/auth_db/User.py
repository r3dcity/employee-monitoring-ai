import uuid
from typing import List
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity
from flaskr.entities.auth_db.Tenant import Tenant
from flaskr.entities.auth_db.EmailCodes import EmailCodes
from flaskr.entities.auth_db.InvitationCodes import InvitationCodes
from flaskr.entities.auth_db.Role import Role
from flaskr.entities.auth_db.RoleUser import RoleUser
from sqlalchemy import LargeBinary

class User(AuthBaseEntity):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(nullable=False, unique=True)
    password: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    phoneNumber: Mapped[str] = mapped_column(nullable=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    is_verified: Mapped[bool] = mapped_column(default=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship(back_populates="users")
    email_codes: Mapped[List["EmailCodes"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    invitation_codes: Mapped[List["InvitationCodes"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    # Many-to-many relationship with Role
    roles: Mapped[List["Role"]] = relationship(secondary="roles_users")