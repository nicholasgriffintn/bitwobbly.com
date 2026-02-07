#!/bin/bash
set -e

echo "Initializing Superset..."

superset db upgrade

superset fab create-admin \
    --username "${SUPERSET_ADMIN_USERNAME}" \
    --firstname Admin \
    --lastname User \
    --email "${SUPERSET_ADMIN_EMAIL}" \
    --password "${SUPERSET_ADMIN_PASSWORD}"

superset init

superset set-database-uri \
    --database_name "Trino R2" \
    --uri "trino://trino@dashboard-trino:8080/r2"

echo "Superset initialization complete!"
