// One log line per request: time, method and path only.
// Never log the body or headers, so personal data and tokens stay out of CloudWatch.
function logger(req, res, next) {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
}

module.exports = logger;
