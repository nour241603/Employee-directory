#!/usr/bin/env bash
# Fills the three tables with sample data (3 departments, 5 roles, 8 employees).
# Safe to run again: it overwrites the sample items and keeps everything else.
#
#   bash $INFRA/seed-data.sh
source "$(dirname "$0")/_lib.sh"
check_floci

say "Sample data"
(cd backend && [ -d node_modules ] || npm install --no-audit --no-fund --loglevel=error)
(cd backend && DYNAMODB_ENDPOINT="${AWS_ENDPOINT_URL}" node scripts/setup-local-db.js)

for t in "$EMPLOYEES_TABLE" "$DEPARTMENTS_TABLE" "$ROLES_TABLE"; do
  echo "   $t: $(aws dynamodb scan --table-name "$t" --select COUNT --query Count --output text) item(s)"
done
