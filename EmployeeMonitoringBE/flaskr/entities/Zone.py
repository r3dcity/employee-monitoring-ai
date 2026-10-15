import json

from flaskr.entities.BaseEntity import Entity, mapped_column, Mapped
from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import relationship
from typing import List


class Zone(Entity):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    # Path to the mask image
    mask: Mapped[str] = mapped_column()
    # Polygon as JSON [{"x": 0..1, "y": 0..1}, ...], normalized to the frame size
    points: Mapped[str] = mapped_column(Text, nullable=True)

    video_camera_id: Mapped[int] = mapped_column(ForeignKey("video_cameras.id"))
    blacklist: Mapped[List["Blacklist"]] = relationship()

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "video_camera_id": self.video_camera_id,
            "points": json.loads(self.points) if self.points else [],
        }
