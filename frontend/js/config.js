// Picks the API address from where the page was loaded.
// Paste your Floci API Gateway URL below after deployment (no slash at the end).
const LOCAL_API = 'http://localhost:3000';
const FLOCI_API = 'http://REPLACE-ME.execute-api.localhost.floci.io:4566';

const API_BASE_URL = window.location.port === '4566' ? FLOCI_API : LOCAL_API;
