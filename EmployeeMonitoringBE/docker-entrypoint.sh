#!/bin/sh
set -e

# Roles/permissions (+ optional first admin from SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD)
flask --app flaskr seed
# Bring every tenant database to the latest schema
flask --app flaskr migrate

exec "$@"
