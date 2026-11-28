#!/usr/bin/env bash
# OWNER: Nouran — Organization Structure service on AWS
# AWS services: DynamoDB (Departments + Roles tables), IAM (empdir-organization-role),
#               Lambda (empdir-organization-api), CloudWatch Logs (14-day log retention)
# Needs the API from infra/api-gateway.sh to connect the routes.
#
#   bash $INFRA/organization-service.sh
source "$(dirname "$0")/_lib.sh"
check_floci

say "Organization 1/4  DynamoDB: Departments and Roles tables"
ensure_table "$DEPARTMENTS_TABLE"
ensure_table "$ROLES_TABLE"

say "Organization 2/4  IAM: least-privilege role"
ensure_role "$ORGANIZATION_ROLE" empdir-organization-access $INFRA/iam/organization-policy.json

say "Organization 3/4  Lambda: $ORGANIZATION_FN"
deploy_function "$ORGANIZATION_FN" "$ORGANIZATION_ROLE" organization

say "Organization 4/4  CloudWatch Logs: log group with 14-day retention"
LOG_GROUP="/aws/lambda/$ORGANIZATION_FN"
aws logs create-log-group --log-group-name "$LOG_GROUP" >/dev/null 2>&1 \
  && ok "log group $LOG_GROUP created" || skip "log group $LOG_GROUP already exists"
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 14
ok "logs kept for 14 days"

say "Organization: connect the Organization Structure routes to API Gateway"
mapfile -t ROUTES < <(with_options \
  "GET /api/departments" \
  "POST /api/departments" \
  "PUT /api/departments/{id}" \
  "DELETE /api/departments/{id}" \
  "GET /api/roles" \
  "POST /api/roles" \
  "DELETE /api/roles/{id}" \
  "PUT /api/employees/{id}/role" \
  "GET /api/org-chart")
attach_routes "$ORGANIZATION_FN" "${ROUTES[@]}"

say "Organization: done"
