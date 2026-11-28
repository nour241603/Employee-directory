#!/usr/bin/env bash
# OWNER: Jana — Employee Management service on AWS
# AWS services: DynamoDB (Employees table), Secrets Manager (login signing key),
#               IAM (empdir-employees-role), Lambda (empdir-employees-api)
# Run api-gateway.sh first, so the routes have an API to join.
#
#   bash infra/employees-service.sh
source "$(dirname "$0")/_lib.sh"
check_floci

say "Employees 1/4  DynamoDB: Employees table"
ensure_table "$EMPLOYEES_TABLE"

say "Employees 2/4  Secrets Manager: login signing key ($AUTH_SECRET_NAME)"
# A random key made here, never typed by a person and never stored in Git.
if aws secretsmanager describe-secret --secret-id "$AUTH_SECRET_NAME" >/dev/null 2>&1; then
  skip "secret $AUTH_SECRET_NAME already exists (kept, so existing logins stay valid)"
else
  KEY=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  aws secretsmanager create-secret --name "$AUTH_SECRET_NAME" \
    --description "Signing key for Employee Directory login tokens" \
    --secret-string "$KEY" >/dev/null
  unset KEY
  ok "secret $AUTH_SECRET_NAME created"
fi

say "Employees 3/4  IAM: least-privilege role"
ensure_role "$EMPLOYEES_ROLE" empdir-employees-access "$INFRA/iam/employees-policy.json"

say "Employees 4/4  Lambda: $EMPLOYEES_FN"
deploy_function "$EMPLOYEES_FN" "$EMPLOYEES_ROLE" employees

say "Employees: connect the Employee Management routes to API Gateway"
mapfile -t ROUTES < <(with_options \
  "POST /api/employees/login" \
  "POST /api/employees/signup" \
  "GET /api/employees/signups" \
  "POST /api/employees/{id}/approve" \
  "POST /api/employees/{id}/reject" \
  "GET /api/employees" \
  "POST /api/employees" \
  "GET /api/employees/{id}" \
  "PATCH /api/employees/{id}" \
  "DELETE /api/employees/{id}" \
  "PATCH /api/employees/{id}/status" \
  "PUT /api/employees/{id}/manager" \
  "POST /api/employees/{id}/reassign-team" \
  "GET /api/employees/{id}/team" \
  "POST /api/employees/{id}/promote" \
  "GET /api/employees/{id}/promotions")
attach_routes "$EMPLOYEES_FN" "${ROUTES[@]}"

say "Employees: done"
