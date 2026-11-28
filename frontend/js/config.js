// Picks the API address from where the page was loaded.
//  - Opened from the S3 website in Floci (http://localhost:4566/empdir-web/...) or through the
//    public link (https://...trycloudflare.com/empdir-web/...): use the deployed API.
//  - Opened with Live Server / a local file while running `npm run dev`: use the local API.
// infra/website.sh fills in FLOCI_API in the uploaded copy; this file in Git stays as it is.
// FLOCI_API is a path on the same address as the website, so it works locally and publicly.
const LOCAL_API = 'http://localhost:3000';
const FLOCI_API = '/_aws/execute-api/REPLACE-WITH-API-ID/$default';

const API_BASE_URL = window.location.pathname.startsWith('/empdir-web/') ? FLOCI_API : LOCAL_API;
