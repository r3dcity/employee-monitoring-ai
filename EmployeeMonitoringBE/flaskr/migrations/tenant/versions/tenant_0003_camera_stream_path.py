"""Configurable RTSP path per camera (it used to be hard-coded to "/stream2", TP-Link Tapo only).

Revision ID: tenant_0003
Revises: tenant_0002
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0003"
down_revision = "tenant_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("video_cameras", sa.Column("stream_path", sa.String(), nullable=True))
    # Existing cameras keep working with the path that was hard-coded before
    op.execute("UPDATE video_cameras SET stream_path = '/stream2' WHERE stream_path IS NULL")


def downgrade():
    op.drop_column("video_cameras", "stream_path")
