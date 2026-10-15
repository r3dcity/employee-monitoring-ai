from alembic import context

import flaskr.entities.auth_db  # noqa: F401  (registers every auth model on the metadata)
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity

# The connection is always provided by flaskr.migrations.runner
connection = context.config.attributes["connection"]
context.configure(connection=connection, target_metadata=AuthBaseEntity.metadata)

with context.begin_transaction():
    context.run_migrations()
