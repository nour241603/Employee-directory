#!/usr/bin/env bash
# Shared settings and helper functions for every infra script (like Lab 8's _lib.sh).
# The scripts load it with:  source infra/_lib.sh
# Run every script from the project folder in Git Bash.

set -euo pipefail

# ---------- Where the commands go ----------
# Floci (Lab 7): the "floci" profile + the Floci address. For real AWS later, set
# AWS_PROFILE to your real profile and run:  export AWS_ENDPOINT_URL=  (empty)
export AWS_PROFILE="${AWS_PROFILE:-floci}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL-http://localhost:4566}"
export AWS_PAGER=""
export MSYS_NO_PATHCONV=1   # stops Git Bash on Windows from rewriting paths like /api/health

ACCOUNT_ID="${ACCOUNT_ID:-}"   # read from AWS in check_floci (Floci: 000000000000)

# ---------- Names (change them here only) ----------
EMPLOYEES_TABLE=Employees
DEPARTMENTS_TABLE=Departments
ROLES_TABLE=Roles

EMPLOYEES_FN=empdir-employees-api        # Jana
ORGANIZATION_FN=empdir-organization-api  # Nouran
DIRECTORY_FN=empdir-directory-api        # Nour

EMPLOYEES_ROLE=empdir-employees-role
ORGANIZATION_ROLE=empdir-organization-role
DIRECTORY_ROLE=empdir-directory-role

API_NAME=empdir-http-api                 # Nour
BUCKET=empdir-web                        # Nour
WEBSITE_ORIGIN="${WEBSITE_ORIGIN:-http://localhost:4566}"

RUNTIME=nodejs24.x
ZIP=backend/lambda.zip

# ---------- Small helpers ----------
say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32mOK\033[0m %s\n' "$*"; }
skip() { printf '   -- %s\n' "$*"; }
die()  { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# Always work from the project folder, wherever the script was started.
# INFRA is this folder's name (works whether the repo calls it infra/ or infre/).
INFRA="$(basename "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$(dirname "${BASH_SOURCE[0]}")/.."

AUTH_SECRET_NAME=empdir/auth-secret      # Jana (Secrets Manager)

# ---------- AWS CLI: installed, or Amazon's official image through Docker ----------
# Floci accepts any keys. Use them when the "floci" profile was never set up.
if ! { command -v aws >/dev/null 2>&1 && aws configure list-profiles 2>/dev/null | grep -qx "$AWS_PROFILE"; }; then
  unset AWS_PROFILE
  export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}" AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
fi
if ! command -v aws >/dev/null 2>&1; then
  command -v docker >/dev/null 2>&1 || { echo "Neither the AWS CLI nor Docker was found." >&2; exit 1; }
  PROJECT_HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
  # Inside the container "localhost" is the container itself; Docker Desktop's name for this PC is host.docker.internal.
  aws() {
    docker run --rm -i \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION -e AWS_DEFAULT_REGION -e AWS_PAGER= \
      -e AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL/localhost/host.docker.internal}" \
      -v "$PROJECT_HOST_DIR:/aws" -w /aws amazon/aws-cli "$@"
  }
fi

table_arn() { echo "arn:aws:dynamodb:${AWS_REGION}:${ACCOUNT_ID}:table/$1"; }
fn_arn()    { echo "arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:$1"; }
role_arn()  { echo "arn:aws:iam::${ACCOUNT_ID}:role/$1"; }

check_floci() {
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) ||
    die "Cannot reach AWS/Floci. Start Docker Desktop, then: docker compose -f $INFRA/floci/docker-compose.yml up -d"
}

# ---------- DynamoDB ----------
ensure_table() {   # ensure_table <name>
  local name=$1
  if aws dynamodb describe-table --table-name "$name" >/dev/null 2>&1; then
    skip "table $name already exists"
  else
    aws dynamodb create-table --table-name "$name" \
      --attribute-definitions AttributeName=id,AttributeType=S \
      --key-schema AttributeName=id,KeyType=HASH \
      --billing-mode PAY_PER_REQUEST >/dev/null
    aws dynamodb wait table-exists --table-name "$name"
    ok "table $name created"
  fi
}

# ---------- IAM ----------
ensure_role() {   # ensure_role <role> <policy-name> <policy-file>
  local role=$1 policy=$2 file=$3
  if aws iam get-role --role-name "$role" >/dev/null 2>&1; then
    skip "role $role already exists"
  else
    aws iam create-role --role-name "$role" \
      --assume-role-policy-document file://$INFRA/iam/trust-policy.json >/dev/null
    ok "role $role created"
  fi

  local arn="arn:aws:iam::${ACCOUNT_ID}:policy/${policy}"
  if aws iam get-policy --policy-arn "$arn" >/dev/null 2>&1; then
    # Policy exists: publish the file as the new default version, so edits are applied.
    local old
    old=$(aws iam list-policy-versions --policy-arn "$arn" \
      --query "Versions[?IsDefaultVersion==\`false\`].VersionId" --output text)
    for v in $old; do aws iam delete-policy-version --policy-arn "$arn" --version-id "$v" >/dev/null; done
    aws iam create-policy-version --policy-arn "$arn" \
      --policy-document "file://$file" --set-as-default >/dev/null
    skip "policy $policy updated from $file"
  else
    aws iam create-policy --policy-name "$policy" --policy-document "file://$file" >/dev/null
    ok "policy $policy created"
  fi
  aws iam attach-role-policy --role-name "$role" --policy-arn "$arn"
  ok "policy $policy attached to $role"
}

# ---------- Lambda ----------
build_zip() {
  say "Building the Lambda package ($ZIP)"
  [ -s backend/lambda.js ] || die "backend/lambda.js is missing or empty (is it still named lamda.js?). The handler is lambda.handler."
  rm -f "$ZIP"
  (cd backend && npm install --no-audit --no-fund --loglevel=error && npm run zip --silent)
  [ -f "$ZIP" ] || die "$ZIP was not created"
  ok "$ZIP ready"
}

# The login signing key lives in Secrets Manager (created by jana-employees.sh).
# Missing key (Jana's part not deployed on this laptop yet): the function is still created,
# login just answers "not configured" until Jana's script runs and this script runs again.
auth_secret() {
  aws secretsmanager get-secret-value --secret-id "$AUTH_SECRET_NAME" \
    --query SecretString --output text 2>/dev/null || {
    printf '   \033[33mWARNING\033[0m login key %s not found (Jana'"'"'s part). Login stays off until Jana'"'"'s services exist; then run this again.\n' "$AUTH_SECRET_NAME" >&2
    echo ""
  }
}

lambda_env() {   # lambda_env <service-name>  -> JSON for --environment
  printf '{"Variables":{"NODE_ENV":"production","SERVICE_NAME":"%s","EMPLOYEES_TABLE":"%s","DEPARTMENTS_TABLE":"%s","ROLES_TABLE":"%s","CORS_ORIGINS":"%s","AUTH_SECRET":"%s"}}' \
    "$1" "$EMPLOYEES_TABLE" "$DEPARTMENTS_TABLE" "$ROLES_TABLE" "$WEBSITE_ORIGIN" "$(auth_secret)"
}

deploy_function() {   # deploy_function <function> <role> <service-name>
  local fn=$1 role=$2 service=$3
  [ -f "$ZIP" ] || build_zip
  if aws lambda get-function --function-name "$fn" >/dev/null 2>&1; then
    aws lambda update-function-code --function-name "$fn" --zip-file "fileb://$ZIP" >/dev/null
    aws lambda wait function-updated-v2 --function-name "$fn" 2>/dev/null || true
    aws lambda update-function-configuration --function-name "$fn" \
      --environment "$(lambda_env "$service")" --timeout 10 --memory-size 256 >/dev/null
    aws lambda wait function-updated-v2 --function-name "$fn" 2>/dev/null || true
    ok "function $fn updated"
  else
    aws lambda create-function --function-name "$fn" \
      --runtime "$RUNTIME" --handler lambda.handler \
      --role "$(role_arn "$role")" \
      --zip-file "fileb://$ZIP" --timeout 10 --memory-size 256 \
      --environment "$(lambda_env "$service")" >/dev/null
    aws lambda wait function-active-v2 --function-name "$fn" 2>/dev/null || true
    ok "function $fn created"
  fi
}

# ---------- API Gateway (HTTP API) ----------
api_id() {
  aws apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text
}

require_api() {
  API_ID=$(api_id)
  [ -n "$API_ID" ] && [ "$API_ID" != "None" ] || die "API $API_NAME not found. Run: bash $INFRA/nour-api-gateway.sh"
  # Path-style address on localhost: works on every network (the *.localhost.floci.io names
  # are blocked by some routers/DNS), and it is the same origin as the S3 website.
  API_URL="${API_URL_OVERRIDE:-${AWS_ENDPOINT_URL:-http://localhost:4566}/_aws/execute-api/${API_ID}/\$default}"
}

# Connects a function to the API: one integration, its routes, and permission to call it.
attach_routes() {   # attach_routes <function> <route> [<route> ...]
  local fn=$1; shift
  # Nour's API not on this laptop yet: create the service anyway and skip only the routes.
  API_ID=$(api_id)
  if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
    printf '   \033[33mWARNING\033[0m API %s not found (Nour'"'"'s part): routes for %s skipped. Run Nour'"'"'s API Gateway, then run this again.\n' "$API_NAME" "$fn"
    return 0
  fi
  require_api

  local uri; uri=$(fn_arn "$fn")
  local integration
  integration=$(aws apigatewayv2 get-integrations --api-id "$API_ID" \
    --query "Items[?IntegrationUri=='${uri}'].IntegrationId | [0]" --output text)
  if [ -z "$integration" ] || [ "$integration" = "None" ]; then
    integration=$(aws apigatewayv2 create-integration --api-id "$API_ID" \
      --integration-type AWS_PROXY --payload-format-version 2.0 \
      --integration-uri "$uri" --query IntegrationId --output text)
    ok "integration for $fn created ($integration)"
  else
    skip "integration for $fn already exists ($integration)"
  fi

  local existing; existing=$(aws apigatewayv2 get-routes --api-id "$API_ID" --query "Items[].RouteKey" --output text | tr '\t' '\n')
  local route
  for route in "$@"; do
    if grep -qxF "$route" <<<"$existing"; then
      skip "route $route"
    else
      aws apigatewayv2 create-route --api-id "$API_ID" --route-key "$route" \
        --target "integrations/$integration" >/dev/null
      ok "route $route"
    fi
  done

  aws lambda add-permission --function-name "$fn" --statement-id apigw-invoke \
    --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${AWS_REGION}:${ACCOUNT_ID}:${API_ID}/*" >/dev/null 2>&1 \
    && ok "API Gateway may call $fn" || skip "permission for $fn already exists"
}

# Adds the matching OPTIONS route for every path, so the browser's CORS check reaches Express.
with_options() {   # with_options <route> ...  -> prints the routes plus OPTIONS for each path
  local route path
  declare -A seen=()
  for route in "$@"; do
    echo "$route"
    path=${route#* }
    if [ -z "${seen[$path]:-}" ]; then seen[$path]=1; echo "OPTIONS $path"; fi
  done
}
