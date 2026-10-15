import os

import click

from flaskr.db import get_users_db
from flaskr.entities.auth_db.Role import Role
from flaskr.entities.auth_db.User import User
from flaskr.entities.auth_db.Tenant import Tenant
from flaskr.services.AuthService import hash_password
from flaskr.seed import seed_roles_and_permissions


@click.command("seed")
@click.option("--admin-email", default=lambda: os.getenv("SEED_ADMIN_EMAIL"), help="Optional first admin account")
@click.option("--admin-password", default=lambda: os.getenv("SEED_ADMIN_PASSWORD"))
@click.option("--organization", default=lambda: os.getenv("SEED_ORGANIZATION", "Default organization"))
def seed_command(admin_email, admin_password, organization):
    """Seed roles and permissions, and optionally a verified admin user.

    Usage: flask --app flaskr seed [--admin-email ... --admin-password ...]
    """
    db = get_users_db()
    seed_roles_and_permissions(db)
    click.echo("Roles and permissions are up to date.")

    if not admin_email:
        return
    if not admin_password:
        raise click.UsageError("--admin-password is required together with --admin-email")
    if db.query(User).filter_by(email=admin_email).first():
        click.echo(f"User {admin_email} already exists.")
        return

    tenant = db.query(Tenant).filter_by(name=organization).first() or Tenant(name=organization)
    db.add(tenant)
    db.flush()
    admin = User(email=admin_email, password=hash_password(admin_password), is_verified=True, tenant_id=tenant.id)
    admin.roles.append(db.query(Role).filter_by(name="ADMIN").one())
    db.add(admin)
    db.commit()
    click.echo(f"Created admin {admin_email} in organization '{organization}'.")
