# Employee Directory & Org Chart (Group 13)

Introduction to Cloud Computing (25CSCI37H): a serverless web application deployed on **Floci**
(the AWS emulator): Lambda, API Gateway, DynamoDB, S3, IAM, Secrets Manager and CloudWatch Logs.

HR manages employees, departments and roles, and the system checks the company rules on every change.
Every employee can search the directory, find experts by skill, see how two people are connected and
view a live organization chart.

## Team and services

| Student | Service | Main files |
|---|---|---|
| Jana Mostafa | Employee Management: onboarding and sign-up approval, status workflow, manager rules, promotions, login and password change | `backend/*/employees*`, `middleware/auth.js`, `frontend/employees.html`, `login.html`, `signup.html`, `change-password.html` |
| Nouran Khaled | Organization Structure: departments, roles and role rules, org chart | `backend/*/organization*`, `frontend/organization.html` |
| Nour Ahmed | Search & Directory: search, expert finder, reporting path, profile | `backend/*/directory*`, `frontend/index.html` |

## Run it (Windows)

Needs Docker Desktop, Git for Windows (Git Bash) and Node.js.

1. Double-click **`Start-Floci.cmd`**. It starts Floci in Docker, deploys everything with
   `infra/deploy.sh` and opens the website at `http://localhost:4566/empdir-web/index.html`.
2. Optional public link: download `cloudflared-windows-amd64.exe` to Downloads, then double-click
   **`Public-Link.cmd`** and open the `https://....trycloudflare.com` address it prints.
   Only the website and the API are reachable through it.
3. Redeploy one service after a change: `Deploy-Employees.cmd`, `Deploy-Organization.cmd` or
   `Deploy-Directory.cmd`.

Demo login: any sample employee e-mail with the password `password123`
(HR: `salma.nabil@example.com`). Floci keeps its data in memory, so run `Start-Floci.cmd` again after a restart.

Run without the cloud (local API on port 3000):

```bash
cd backend
cp .env.example .env
npm install
npm run setup-db
npm run dev
```

## Folders

| Folder | What is in it |
|---|---|
| `backend/` | Express API: `routes/` → `controllers/` (input checks) → `services/` (business rules) → `db/dynamo.js` |
| `frontend/` | HTML, CSS and JavaScript pages |
| `infra/` | One deploy script per service, IAM policies, safety filter for the public link (see `infra/README.md`) |
| `tests/` | `employees.http`, `organization.http`, `directory.http`, `integration.http` (VS Code REST Client) |
| `docs/api-contract.md` | Every endpoint, written by its owner |
