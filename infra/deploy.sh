#!/usr/bin/env bash
# Deploys the whole application to Floci in the right order.
# Each step is one student's script, so each person can also run (and commit) their own part.
#
#   docker compose -f infra/floci/docker-compose.yml up -d
#   bash $INFRA/deploy.sh
source "$(dirname "$0")/_lib.sh"
check_floci

build_zip                              # shared: backend/lambda.zip for all three functions
bash $INFRA/nour-api-gateway.sh         # Nour:   the API the others connect to
bash $INFRA/jana-employees.sh           # Jana:   Employees table + role + function + routes
bash $INFRA/nouran-organization.sh      # Nouran: Departments/Roles tables + role + function + routes + logs
bash $INFRA/nour-directory.sh           # Nour:   read-only role + function + routes
bash $INFRA/seed-data.sh                # shared: sample data
bash $INFRA/nour-website.sh             # Nour:   website on S3
bash $INFRA/check.sh                    # shared: tests the deployed system
