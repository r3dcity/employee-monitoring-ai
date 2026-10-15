from alembic import context

import flaskr.entities  # noqa: F401  (registers every tenant model on the metadata)
from flaskr.entities.BaseEntity import Entity

# The connection is always provided by flaskr.migrations.runner
connection = context.config.attributes["connection"]
context.configure(connection=connection, target_metadata=Entity.metadata)

with context.begin_transaction():
    context.run_migrations()
