// Builds the Express app and exports it (no app.listen), so it runs
// both on your PC (server.js) and on AWS Lambda (lambda.js).
const express = require('express');
const cors = require('cors');

const logger = require('./middleware/logger');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(logger);
app.use(express.json());

app.get('/api/health', (req, res) => {
  const runtime = process.env.AWS_LAMBDA_FUNCTION_NAME ? 'lambda' : 'pc';
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    runtime
  });
});

// Each service is mounted only once its routes file exports a router, so the app
// still starts while a teammate's service is unfinished (it just answers 404).
function mount(path, file, owner) {
  const router = require(file);
  if (typeof router === 'function') app.use(path, router);
  else console.warn(`${file} (${owner}) is not ready yet; its routes are skipped.`);
}

mount('/api/employees', './routes/employees', 'Jana');
mount('/api', './routes/organization', 'Nouran');
mount('/api/directory', './routes/directory', 'Nour');

app.use(notFound);
app.use(errorHandler);

module.exports = app;
