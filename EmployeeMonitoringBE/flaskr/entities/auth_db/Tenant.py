from sqlalchemy.orm import  Mapped, mapped_column, relationship
from sqlalchemy import Uuid
import uuid
from typing import List
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity

class Tenant(AuthBaseEntity):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(nullable=False, unique=True)

    # Relationships
    users: Mapped[List["User"]] = relationship(back_populates="tenant")
