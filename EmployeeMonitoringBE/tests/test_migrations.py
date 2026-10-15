from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from flaskr.entities.BaseEntity import Entity
from flaskr.migrations.runner import upgrade_database
import flaskr.entities  # noqa: F401


def revision(engine):
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def sqlite_engine(tmp_path, name):
    return create_engine(f"sqlite:///{(tmp_path / name).as_posix()}")


def test_new_tenant_database_is_created_at_head(tmp_path):
    engine = sqlite_engine(tmp_path, "new.db")
    upgrade_database(engine, "tenant", Entity.metadata)
    assert revision(engine) == "tenant_0003"
    assert "points" in {c["name"] for c in inspect(engine).get_columns("zones")}
    engine.dispose()


def test_pre_alembic_tenant_database_is_upgraded(tmp_path):
    """A database created by the thesis version (no alembic_version table, no zones.points)."""
    engine = sqlite_engine(tmp_path, "thesis.db")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE video_cameras (id INTEGER PRIMARY KEY, name TEXT)"))
        connection.execute(text("CREATE TABLE zones (id INTEGER PRIMARY KEY, name TEXT, mask TEXT, video_camera_id INTEGER)"))
        connection.execute(text("INSERT INTO zones (name, mask, video_camera_id) VALUES ('Door', 'z1.png', 1)"))

    upgrade_database(engine, "tenant", Entity.metadata)
    upgrade_database(engine, "tenant", Entity.metadata)  # running twice is a no-op

    assert revision(engine) == "tenant_0003"
    assert "points" in {c["name"] for c in inspect(engine).get_columns("zones")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM zones")).scalar() == "Door"
    engine.dispose()
