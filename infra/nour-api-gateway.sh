#!/usr/bin/env bash
# OWNER: Nour — API Gateway (HTTP API): the one public address for all three services.
# Run this BEFORE the three service scripts, so they can add their routes to it.
#
#   bash $INFRA/nour-api-gateway.sh
source "$(dirname "$0")/_lib.sh"
check_floci

say "Nour  API Gateway: $API_NAME"
API_ID=$(api_id)
if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
  skip "API $API_NAME already exists ($API_ID)"
else
  API_ID=$(aws apigatewayv2 create-api --name "$API_NAME" \
    --protocol-type HTTP --query ApiId --output text)
  ok "API $API_NAME created ($API_ID)"
fi

# '$default' stage + auto-deploy: no extra word in the URL, every change goes live at once.
if aws apigatewayv2 get-stages --api-id "$API_ID" --query "Items[].StageName" --output text | grep -q '\$default'; then
  skip "stage \$default already exists"
else
  aws apigatewayv2 create-stage --api-id "$API_ID" --stage-name '$default' --auto-deploy >/dev/null
  ok "stage \$default created (auto-deploy)"
fi

echo
echo "   API URL: http://${API_ID}.execute-api.localhost.floci.io:4566"
