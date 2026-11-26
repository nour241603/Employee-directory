#!/usr/bin/env bash
# Tests the deployed system through API Gateway (like Lab 7's checker) and prints PASS/FAIL.
# Read-only except one test employee it creates and then offboards.
#
#   bash $INFRA/check.sh
source "$(dirname "$0")/_lib.sh"
set +e
check_floci
require_api

PASS=0; FAIL=0
pass() { printf '   \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '   \033[31mFAIL\033[0m  %s  (%s)\n' "$1" "$2"; FAIL=$((FAIL + 1)); }

TOKEN=""
# expect <name> <expected-status> <method> <path> [json-body]   (sends the login token if we have one)
expect() {
  local name=$1 want=$2 method=$3 path=$4 body=${5:-}
  local args=(-s -o /tmp/empdir-body.json -w '%{http_code}' -X "$method" "$API_URL$path")
  [ -n "$TOKEN" ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  local got; got=$(curl "${args[@]}")
  if [ "$got" = "$want" ]; then pass "$name"; else fail "$name" "expected $want, got $got: $(head -c 160 /tmp/empdir-body.json)"; fi
}

say "Infrastructure"
for fn in "$EMPLOYEES_FN" "$ORGANIZATION_FN" "$DIRECTORY_FN"; do
  state=$(aws lambda get-function --function-name "$fn" --query Configuration.State --output text 2>/dev/null)
  [ "$state" = "Active" ] && pass "Lambda $fn is Active" || fail "Lambda $fn" "state: ${state:-missing}"
done
for t in "$EMPLOYEES_TABLE" "$DEPARTMENTS_TABLE" "$ROLES_TABLE"; do
  aws dynamodb describe-table --table-name "$t" >/dev/null 2>&1 && pass "DynamoDB table $t" || fail "DynamoDB table $t" "missing"
done
routes=$(aws apigatewayv2 get-routes --api-id "$API_ID" --query "length(Items)" --output text)
[ "${routes:-0}" -ge 30 ] && pass "API Gateway has $routes routes" || fail "API Gateway routes" "only ${routes:-0}"

say "Login (Jana's function, signing key from Secrets Manager)"
expect "Health check (directory function)"            200 GET  /api/health
grep -q '"runtime":"lambda"' /tmp/empdir-body.json && pass "Health says it runs on Lambda" || fail "Health runtime" "$(cat /tmp/empdir-body.json)"
expect "No token -> 401"                              401 GET  /api/employees
expect "Wrong password -> 401"                        401 POST /api/employees/login '{"email":"salma.nabil@example.com","password":"wrong"}'
expect "HR login (Salma, demo password)"              200 POST /api/employees/login '{"email":"salma.nabil@example.com","password":"password123"}'
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' /tmp/empdir-body.json)
[ -n "$TOKEN" ] && pass "Got a login token" || fail "Login token" "no token in the answer; did seed-data.sh run?"

say "Each service through API Gateway (logged in as HR)"
expect "Jana: list employees"                         200 GET  /api/employees
expect "Jana: invalid employee rejected"              400 POST /api/employees '{"name":"N","email":"bad"}'
expect "Jana: circular reporting blocked"             409 PUT  /api/employees/EMP-001/manager '{"managerId":"EMP-003"}'
expect "Nouran: list departments"                     200 GET  /api/departments
expect "Nouran: department with staff not deleted"    409 DELETE /api/departments/DEP-eng
expect "Nouran: org chart"                            200 GET  /api/org-chart
expect "Nour: directory search"                       200 GET  "/api/directory?q=omar"
expect "Nour: expert finder"                          200 GET  "/api/directory/experts?skills=sql,aws"
expect "Nour: reporting path"                         200 GET  "/api/directory/path?from=EMP-003&to=EMP-005"
expect "Unknown route stopped by API Gateway"         404 GET  /api/nothing-here

say "Services working together"
email="check.$(date +%s)@example.com"
code=$(curl -s -o /tmp/empdir-body.json -w '%{http_code}' -X POST "$API_URL/api/employees" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Cloud Check\",\"email\":\"$email\",\"departmentId\":\"DEP-hr\",\"roleId\":\"ROL-junior\",\"skills\":[\"cloudcheck\"]}")
id=$(sed -n 's/.*"id":"\(EMP-[^"]*\)".*/\1/p' /tmp/empdir-body.json)
if [ "$code" = "201" ] && [ -n "$id" ]; then
  pass "Jana's function registered $id (auto manager: department head)"
  expect "Nour's function finds the new employee"     200 GET "/api/directory/experts?skills=cloudcheck"
  grep -q "$id" /tmp/empdir-body.json && pass "New employee appears in the expert finder" || fail "Expert finder" "employee missing"
  expect "Nouran's function shows them in the chart" 200 GET "/api/org-chart?departmentId=DEP-hr"
  grep -q "$id" /tmp/empdir-body.json && pass "New employee appears in the org chart" || fail "Org chart" "employee missing"
  expect "Offboard the test employee"                200 PATCH "/api/employees/$id/status" '{"status":"Left"}'
else
  fail "Register test employee" "got $code: $(head -c 160 /tmp/empdir-body.json)"
fi

say "CORS (only our website may call the API from a browser)"
allow=$(curl -s -o /dev/null -D - -X OPTIONS "$API_URL/api/employees" \
  -H "Origin: $WEBSITE_ORIGIN" -H 'Access-Control-Request-Method: POST' | tr -d '\r' | grep -i '^access-control-allow-origin:')
[ -n "$allow" ] && pass "Website origin allowed ($WEBSITE_ORIGIN)" || fail "CORS for website" "no Access-Control-Allow-Origin header"
other=$(curl -s -o /dev/null -D - -X OPTIONS "$API_URL/api/employees" \
  -H 'Origin: http://evil.example' -H 'Access-Control-Request-Method: POST' | tr -d '\r' | grep -i '^access-control-allow-origin:')
[ -z "$other" ] && pass "Other websites are not allowed" || fail "CORS for other sites" "$other"

say "Website on S3"
for f in index.html employees.html organization.html js/config.js js/api.js css/style.css; do
  aws s3 ls "s3://$BUCKET/$f" >/dev/null 2>&1 && pass "s3://$BUCKET/$f" || fail "s3://$BUCKET/$f" "not uploaded"
done
aws s3 cp "s3://$BUCKET/js/config.js" - 2>/dev/null | grep -q "$API_ID" \
  && pass "Uploaded config.js points at this API" || fail "Uploaded config.js" "does not contain $API_ID; run bash $INFRA/nour-website.sh"

echo
printf 'Result: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n' "$PASS" "$FAIL"
echo "Website: ${WEBSITE_ORIGIN}/${BUCKET}/index.html"
echo "API:     $API_URL"
[ "$FAIL" -eq 0 ]
