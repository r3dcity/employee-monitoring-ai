from flaskr.entities.BaseEntity import Entity, mapped_column, Mapped
from sqlalchemy.orm import relationship
from datetime import datetime
from typing import List
from sqlalchemy import DateTime
from flaskr.entities.alert_system.RuleCameraLink import RuleCameraLink
from flaskr.entities.alert_system.RuleZoneLink import RuleZoneLink
from enum import Enum
import json

class Priority(Enum):
        LOW = "low"
        MEDIUM = "medium"
        HIGH = "high"

class AlertRule(Entity):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    description: Mapped[str] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(default=False)
    priority: Mapped[Priority] = mapped_column()
    cooldown_seconds: Mapped[int] = mapped_column(default=0)  # Default: no cooldown

    conditions_json: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    camera_links: Mapped[List["RuleCameraLink"]] = relationship(cascade="all, delete-orphan")
    zone_links: Mapped[List["RuleZoneLink"]] = relationship(cascade="all, delete-orphan")

    def to_dict(self):
        """Converts the AlertRule object to a dictionary."""
        try:
            conditions = json.loads(self.conditions_json)
        except json.JSONDecodeError:
            conditions = None

        return {
            "id": self.id,
            "description": self.description,
            "is_active": self.is_active,
            "priority": self.priority.value if self.priority else None,
            "conditions_json": conditions,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "cameras": [link.camera_id for link in self.camera_links],
            "zones": [link.zone_id for link in self.zone_links],
            "cooldown_seconds": self.cooldown_seconds
        }
