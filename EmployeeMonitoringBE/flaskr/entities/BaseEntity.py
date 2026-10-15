from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Mapped/mapped_column are re-exported for the entity modules
__all__ = ["Entity", "Mapped", "mapped_column"]


class Entity(DeclarativeBase):
    __abstract__ = True
