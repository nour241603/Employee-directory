# Nour - files to add (Search & Directory)

All files were tested against the project code on Nouran's laptop: every test gives the expected answer.

| File in this folder | Put it at (in the project) | What it is |
|---|---|---|
| `tests/directory.http` | `tests/directory.http` (new file) | 18 tests D1-D18 for your three functions and the profile view, plus a no-token (401) test |
| `tests/integration.http` | `tests/integration.http` (new file) | I1-I8: one flow through all three services (department -> employee -> manager -> role -> search -> experts -> org chart -> delete blocked) |
| `backend/events/directory-search.json` | `backend/events/directory-search.json` (replace the empty file) | Lambda test event for `empdir-directory-api` |
| `api-contract-section.md` | `docs/api-contract.md` | Replace the lines `## Search & Directory (Nour)` and `(to be filled by Nour)` with this whole text |

## Where each file goes in VS Code

```
Employee-directory/
├─ backend/
│  └─ events/directory-search.json    REPLACE the empty file
├─ tests/
│  ├─ directory.http                  NEW
│  └─ integration.http                NEW
└─ docs/api-contract.md               EDIT: replace "## Search & Directory (Nour)" and
                                      "(to be filled by Nour)" with all of api-contract-section.md
```

## Run the tests
1. Install the **REST Client** extension in VS Code.
2. Fresh sample data: in `backend`, run `npm run setup-db`, then `npm run dev`.
3. Open a `.http` file and click **Send Request** above each block, top to bottom (the login first). Run `integration.http` on fresh data too.
4. Against Floci instead: change the `@baseUrl` line to `http://localhost:4566/_aws/execute-api/<API-ID>/$default`.

## Use the Lambda test event
Log in, copy the token into the file in place of `REPLACE-WITH-A-REAL-LOGIN-TOKEN`, then:
```bash
aws lambda invoke --function-name empdir-directory-api --payload fileb://backend/events/directory-search.json out.json --endpoint-url http://localhost:4566
```
Real token: 200 with Karim Said found. Without a real token: 401, which proves the login check. Put the placeholder back before committing (never commit a real token).

## Commit from your own branch
```bash
git checkout main
git pull origin main
git checkout -b nour-tests
git add tests/directory.http tests/integration.http backend/events/directory-search.json docs/api-contract.md
git commit -m "Directory: tests, integration flow, Lambda test event and API contract"
git push -u origin nour-tests
```
Then open a pull request on GitHub and merge it.
