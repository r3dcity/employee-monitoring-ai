"""Schema migrations for the users database and every tenant database.

There are two Alembic script directories:
  - migrations/users:  the central database (users, tenants, roles, permissions)
  - migrations/tenant: the per-organization databases (cameras, employees, alerts, ...)

`upgrade_database` brings one database to the latest revision:
  - brand new database      -> create_all() and stamp "head"
  - created before Alembic  -> stamp the baseline revision, then upgrade
  - already under Alembic   -> upgrade
"""
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect

MIGRATIONS_DIR = Path(__file__).parent

# Revision describing the schema as it was before migrations were introduced (thesis-v1),
# and a table that only exists in such a database.
BASELINES = {
    "users": ("users_0001", "users"),
    "tenant": ("tenant_0001", "video_cameras"),
}


def alembic_config(kind, connection=None):
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR / kind))
    config.attributes["connection"] = connection
    return config


def current_revision(connection):
    return MigrationContext.configure(connection).get_current_revision()


def upgrade_database(engine, kind, metadata):
    baseline_revision, baseline_table = BASELINES[kind]
    with engine.begin() as connection:
        config = alembic_config(kind, connection)
        if current_revision(connection) is None:
            if baseline_table not in inspect(connection).get_table_names():
                metadata.create_all(connection)
                command.stamp(config, "head")
                return
            command.stamp(config, baseline_revision)
        command.upgrade(config, "head")
