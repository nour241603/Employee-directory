#!/usr/bin/env bash
# OWNER: Nour — Search & Directory service on AWS
# AWS services: IAM (empdir-directory-role, read-only), Lambda (empdir-directory-api),
#               API Gateway (api-gateway.sh), S3 website (website.sh)
#
#   bash $INFRA/directory-service.sh
source "$(dirname "$0")/_lib.sh"
check_floci

say "Directory 1/2  IAM: read-only role (the directory never changes data)"
ensure_role "$DIRECTORY_ROLE" empdir-directory-access $INFRA/iam/directory-policy.json

say "Directory 2/2  Lambda: $DIRECTORY_FN"
deploy_function "$DIRECTORY_FN" "$DIRECTORY_ROLE" directory

say "Directory: connect the Search & Directory routes to API Gateway"
mapfile -t ROUTES < <(with_options \
  "GET /api/health" \
  "GET /api/directory" \
  "GET /api/directory/filters" \
  "GET /api/directory/experts" \
  "GET /api/directory/path" \
  "GET /api/directory/{id}")
attach_routes "$DIRECTORY_FN" "${ROUTES[@]}"

say "Directory: done"
