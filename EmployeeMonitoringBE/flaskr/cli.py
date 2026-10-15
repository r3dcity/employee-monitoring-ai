import click
from flask.cli import with_appcontext
from alembic import command
from flask import current_app

from flaskr.db import get_users_db, setup_tenant_db, session_factory_registry
from flaskr.entities.auth_db.Tenant import Tenant
from flaskr.migrations.runner import alembic_config


@click.command("migrate")
@with_appcontext
def migrate_command():
    """Upgrade the users database and every tenant database to the latest schema.

    The users database is upgraded when the app starts; tenant databases are upgraded
    here (or lazily on their first request).
    """
    tenant_ids = [tenant_id for (tenant_id,) in get_users_db().query(Tenant.id).all()]
    for tenant_id in tenant_ids:
        session_factory_registry.pop(tenant_id, None)
        setup_tenant_db(tenant_id)
        click.echo(f"Tenant {tenant_id}: up to date")
    click.echo(f"Migrated {len(tenant_ids)} tenant database(s).")


@click.command("make-migration")
@with_appcontext
@click.argument("kind", type=click.Choice(["tenant", "users"]))
@click.option("-m", "--message", required=True)
def make_migration_command(kind, message):
    """Create an empty migration script for the users or the tenant databases."""
    script = command.revision(alembic_config(kind), message=message)
    current_app.logger.info("Created %s", script.path)
    click.echo(f"Created {script.path}")
