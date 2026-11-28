## Search & Directory (Nour)

All routes need a login token (`Authorization: Bearer <token>`). Missing or invalid token: `401`.
Every logged-in user can use them. They only read data. Pending sign-ups are never shown. Experts and filters skip people who left.

| Method | Path | Who | What it does |
|---|---|---|---|
| GET | `/api/directory` | logged in | Search. Query: `q` (matches name, email, role or a skill; max 80 chars), `department`, `role`, `skill`, `status` (`Active`, `OnLeave`, `Left`; people who left are hidden unless asked for), `sort` (`name`, `department`, `seniority`), `page` (from 1), `limit` (1-50, default 10). Returns `{ "total", "page", "limit", "totalPages", "sort", "results": [...] }`. Bad options: `400 VALIDATION_ERROR`. A page past the end: `400 PAGE_OUT_OF_RANGE`. |
| GET | `/api/directory/filters` | logged in | The values for the search page's drop-downs: `{ "departments", "roles", "skills", "statuses", "people" }`. |
| GET | `/api/directory/experts` | logged in | Expert finder. Query: `skills` (1-10, comma separated, required), `department`, `available=true` (only Active people). Ranks people by how many of the skills they have and lists the ones each is missing. Returns `{ "skills", "count", "fullMatches", "skillsNobodyHas", "results": [...] }`. No skills: `400 VALIDATION_ERROR`. |
| GET | `/api/directory/path` | logged in | Reporting path finder. Query: `from`, `to` (employee ids, both required). Returns `{ "connected", "relationship", "sharedManager", ... }`, for example "Closest shared manager: Layla Hassan" or "Hana Mostafa is above Ahmed Tarek in the reporting line". Same person twice: `400 SAME_EMPLOYEE`. Unknown employee: `404 EMPLOYEE_NOT_FOUND`. |
| GET | `/api/directory/:id` | logged in | Profile view: the employee with department, role, `managerChain` (up to the top) and `team` (direct reports). Unknown: `404 EMPLOYEE_NOT_FOUND`. |

Ids may only contain `A-Za-z0-9-` (up to 40 chars); anything else is `400 VALIDATION_ERROR`.
