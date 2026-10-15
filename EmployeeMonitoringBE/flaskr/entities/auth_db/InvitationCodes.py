from datetime import datetime, timedelta
import uuid
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy import DateTime, ForeignKey
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity

class InvitationCodes(AuthBaseEntity):
    __tablename__ = "invitation_codes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column( nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    expires_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now() + timedelta(days=1))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Relationship to User
    user: Mapped["User"] = relationship(back_populates="invitation_codes")