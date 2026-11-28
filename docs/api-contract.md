# API contract - Employee Directory (Group 13)

Shared file: each service owner documents their own endpoints here.
Base URL locally: `http://localhost:3000`. On Floci: the API Gateway URL from `infra/README.md`.

Every response is JSON. Errors always look like:

```json
{ "error": { "code": "SOME_CODE", "message": "Readable message", "details": [] } }
```

## Employee Management (Jana)

All routes need a login token except `POST /api/employees/login`.
Send it as `Authorization: Bearer <token>`. Missing or invalid token: `401`.
A valid token with the wrong role: `403`.

| Method | Path | Who | What it does |
|---|---|---|---|
| POST | `/api/employees/login` | anyone | Body: `{ "email", "password" }`. Returns `{ "token", "user" }`. Wrong email or password: `401 LOGIN_FAILED` (same message both ways). A user who left: `401 ACCOUNT_INACTIVE`. |
| POST | `/api/employees/signup` | anyone | Body: `{ "name", "email", "password", "phone"?, "skills"? }`. Password: 8-72 chars with a letter and a number. Creates a **Pending** account (always `EMPLOYEE`; any other fields are ignored). `201`. Email already used or pending: `409 EMAIL_TAKEN`. A pending account cannot log in (`401 ACCOUNT_PENDING`) and is hidden from every list, search and the org chart. |
| GET | `/api/employees/signups` | HR | Pending sign-ups, oldest first. |
| POST | `/api/employees/:id/approve` | HR | Body: `{ "departmentId"?, "roleId"? }`. Makes the account Active; reports to the department head when the manager rules allow. Not pending: `409 NOT_PENDING`. |
| POST | `/api/employees/:id/reject` | HR | Removes the pending request, so the email can be used again. |
| GET | `/api/employees` | logged in | Lists all employees (without `passwordHash`). |
| POST | `/api/employees` | HR | Registers an employee. With no `managerId`, the department head is assigned automatically when the rules allow. `201` created. Duplicate email: `409 EMAIL_TAKEN`. Unknown department/role: `404`. |
| GET | `/api/employees/:id` | logged in | One employee. `404 EMPLOYEE_NOT_FOUND`. |
| PATCH | `/api/employees/:id` | self or HR | Self may change `phone`, `skills` only. HR may also change `name`, `email`, `departmentId`. Other fields (`status`, `accessRole`, timestamps): `403 FIELD_NOT_EDITABLE`. Someone else's record: `404`. A department move re-routes the reporting line. |
| PATCH | `/api/employees/:id/status` | HR | Body: `{ "status": "Active"\|"OnLeave"\|"Left", "reassignTo"?: id }`. Active <-> OnLeave -> Left (final). Leaving needs the team handed over first (`409 HAS_DIRECT_REPORTS` with the team listed). |
| DELETE | `/api/employees/:id` | HR | Only after leaving: `409 NOT_OFFBOARDED` otherwise. |
| PUT | `/api/employees/:id/manager` | HR | Body: `{ "managerId": id \| null }`. Manager rules: no self, no loops, Active only, same department or company-level, higher role level, max 8 reports. |
| POST | `/api/employees/:id/reassign-team` | HR | Body: `{ "newManagerId" }`. Moves the whole team, all-or-nothing. |
| GET | `/api/employees/:id/team` | logged in | Direct reports of a manager. |
| POST | `/api/employees/:id/promote` | HR | Body: `{ "roleId", "reason" }`. New role must rank above the current one (`409 NOT_A_PROMOTION`) and not reach the manager's level (`409 WOULD_PASS_MANAGER`). Records who/when/why in `promotionHistory`. |
| GET | `/api/employees/:id/promotions` | self or HR | The promotion trail, oldest first. |

Request bodies must be JSON (`415` otherwise). Field rules: name 2-80 chars,
valid email, phone 7-20 digits, up to 20 skills of 1-40 chars, ids `A-Za-z0-9-` up to 40 chars.

## Organization Structure (Nouran)

(to be filled by Nouran)

## Search & Directory (Nour)

(to be filled by Nour)
