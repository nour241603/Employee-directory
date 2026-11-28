# Cloud deployment on Floci (Labs 7 and 8)

The same Express app runs as **three Lambda functions, one per student**. API Gateway sends
each student's routes to their own function, and each function has its own least-privilege IAM role.

```
Browser ──> S3 website (empdir-web)
   │
   └──> API Gateway HTTP API (empdir-http-api)
          ├─ /api/employees/*            ──> Lambda empdir-employees-api    (Jana)   ──> DynamoDB Employees
          ├─ /api/departments, /roles,
          │  /org-chart, /employees/{id}/role ──> Lambda empdir-organization-api (Nouran) ──> DynamoDB Departments, Roles
          └─ /api/directory/*, /health   ──> Lambda empdir-directory-api    (Nour)   ──> reads all three tables
   Login signing key: Secrets Manager empdir/auth-secret  ·  Logs: CloudWatch Logs
```

## AWS services per student

| Student | Script | AWS services in their own service |
|---|---|---|
| Jana | `employees-service.sh` | DynamoDB `Employees`, Secrets Manager `empdir/auth-secret`, IAM `empdir-employees-role`, Lambda `empdir-employees-api` |
| Nouran | `organization-service.sh` | DynamoDB `Departments` + `Roles`, IAM `empdir-organization-role`, Lambda `empdir-organization-api`, CloudWatch Logs (14-day retention) |
| Nour | `api-gateway.sh`, `directory-service.sh`, `website.sh` | API Gateway `empdir-http-api`, IAM `empdir-directory-role` (read-only), Lambda `empdir-directory-api`, S3 website `empdir-web` |

Shared: `_lib.sh` (names + helpers), `deploy.sh` (runs everything), `seed-data.sh`, `check.sh`.

## Least privilege (`iam/`)

| Role | May do | May not do |
|---|---|---|
| employees | Get/Put/Delete/Scan on `Employees`; Get/Scan on `Departments`, `Roles` | change departments or roles, touch any other table |
| organization | Get/Put/Delete/Scan on `Departments`, `Roles`; Get/Scan/Put on `Employees` (to set a role) | delete employees |
| directory | Get/Scan on all three tables | write anything |

Each role may write only its own function's logs. Floci stores these permissions; real AWS enforces them.

## Run it

Git Bash, in the project folder, with Docker Desktop running:

```bash
docker compose -f infra/floci/docker-compose.yml up -d
export AWS_PROFILE=floci

bash infra/deploy.sh          # everything, in order, then the checks
```

Or one part at a time (in this order the first time):

```bash
bash infra/api-gateway.sh
bash infra/employees-service.sh
bash infra/organization-service.sh
bash infra/directory-service.sh
bash infra/seed-data.sh
bash infra/website.sh
bash infra/check.sh
```

Every script is safe to run again: what exists is kept or updated. After a code change, run the
owner's script again (it rebuilds nothing else); delete `backend/lambda.zip` first to force a fresh package.

Open the website: `http://localhost:4566/empdir-web/index.html`.
Demo login (from the sample data): any sample email, password `password123`. HR: `salma.nabil@example.com`.

## Evidence for the report

```bash
aws apigatewayv2 get-apis --query "Items[].[Name,ApiId,ProtocolType]" --output table
aws apigatewayv2 get-routes --api-id <API_ID> --query "Items[].RouteKey" --output table
aws lambda list-functions --query "Functions[].[FunctionName,Runtime,Role]" --output table
aws dynamodb list-tables
aws iam list-roles --query "Roles[?starts_with(RoleName,'empdir')].RoleName"
aws secretsmanager list-secrets --query "SecretList[].Name"
aws s3 ls s3://empdir-web --recursive
aws logs describe-log-groups --query "logGroups[].[logGroupName,retentionInDays]" --output table
bash infra/check.sh            # PASS/FAIL list: screenshot it
```

Also screenshot the Floci console (`http://localhost:4500`) and the website showing
"API online: lambda (production)".

## Requirements on the code

- The Lambda handler is `lambda.handler` (`backend/lambda.js`).
- The table names come from `EMPLOYEES_TABLE`, `DEPARTMENTS_TABLE`, `ROLES_TABLE` (see `backend/db/dynamo.js`).
- `AUTH_SECRET` and `CORS_ORIGINS` are set on each function by the scripts; nothing secret is in Git.
