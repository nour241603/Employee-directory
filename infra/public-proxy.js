// Safety filter for the public link (Cloudflare tunnel).
//
// The tunnel points here instead of straight at Floci, so the internet can reach ONLY:
//   - the website:  GET/HEAD /empdir-web/...                   (read-only S3 files)
//   - our API:      /_aws/execute-api/<api-id>/$default/api/... (API Gateway -> our Lambdas)
// Everything else (the Floci console, the AWS service endpoints, S3 writes) gets 404.
// "/" redirects to the website.
//
// Run: node infra/public-proxy.js      (Public-Link.cmd starts it for you)
const http = require('http');

const PORT = Number(process.env.PUBLIC_PROXY_PORT || 8088);
const FLOCI_HOST = process.env.FLOCI_HOST || 'localhost';
const FLOCI_PORT = Number(process.env.FLOCI_PORT || 4566);
const FLOCI_HOST_HEADER = process.env.FLOCI_HOST_HEADER || `${FLOCI_HOST}:${FLOCI_PORT}`;
const BIND = process.env.PUBLIC_PROXY_BIND || '127.0.0.1';

const WEBSITE = /^\/empdir-web\/[A-Za-z0-9._\-\/]*$/;
const API = /^\/_aws\/execute-api\/[A-Za-z0-9]+\/\$default\/api(\/[^?#]*)?$/;
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

function allowed(method, path) {
  if (path.includes('..')) return false;
  if (WEBSITE.test(path)) return method === 'GET' || method === 'HEAD';
  if (API.test(path)) return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method);
  return false;
}

const server = http.createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') &&
      (path === '/' || path === '/empdir-web' || path === '/empdir-web/')) {
    res.writeHead(302, { Location: '/empdir-web/index.html' }).end();
    return;
  }
  if (!allowed(req.method, path)) {
    console.log(`${new Date().toISOString()} BLOCKED ${req.method} ${req.url}`);
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }

  const headers = { ...req.headers, host: FLOCI_HOST_HEADER };
  for (const h of HOP_BY_HOP) delete headers[h];

  // Website files: forward only the file path (no query string, no credentials),
  // so S3 extras like ?acl or ?policy can never be requested through the link.
  let upstreamPath = req.url;
  if (WEBSITE.test(path)) {
    upstreamPath = new URL(req.url, 'http://x').pathname;
    delete headers.authorization;
  }

  const upstream = http.request(
    { host: FLOCI_HOST, port: FLOCI_PORT, method: req.method, path: upstreamPath, headers },
    (up) => {
      const out = { ...up.headers };
      for (const h of HOP_BY_HOP) delete out[h];
      res.writeHead(up.statusCode, out);
      up.pipe(res);
    });
  upstream.on('error', (err) => {
    console.log(`${new Date().toISOString()} FLOCI UNREACHABLE ${err.code}`);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Floci is not reachable. Is Docker running and the app deployed?');
  });
  req.pipe(upstream);
});

server.listen(PORT, BIND, () => {
  console.log(`Public filter on http://localhost:${PORT} -> Floci ${FLOCI_HOST}:${FLOCI_PORT}`);
  console.log('Allowed: GET /empdir-web/...  and  /_aws/execute-api/<id>/$default/api/...  (everything else: 404)');
});
