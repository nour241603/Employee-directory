// Shared error format for every service:
// { "error": { "code": "SOME_CODE", "message": "Readable message", "details": [...] } }

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sendError(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

function notFound(req, res) {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
  console.error(err);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong on the server.');
}

module.exports = { AppError, sendError, notFound, errorHandler };
