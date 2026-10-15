"""Store zone polygons as normalized points.

Revision ID: tenant_0002
Revises: tenant_0001
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0002"
down_revision = "tenant_0001"
branch_labels = None
depends_on = None


def upgrade():
    # The column may already exist if the database was upgraded by the pre-Alembic helper
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("zones")}
    if "points" not in columns:
        op.add_column("zones", sa.Column("points", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("zones", "points")
