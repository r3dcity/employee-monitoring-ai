import uuid
from sqlalchemy import Uuid
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity
from flaskr.entities.BaseEntity import  mapped_column, Mapped

class Permission(AuthBaseEntity):
    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(nullable=False, unique=True)