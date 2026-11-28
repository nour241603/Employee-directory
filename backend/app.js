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

// The three services, one per student.
app.use('/api/employees', require('./routes/employees'));   // Employee Management (Jana)
app.use('/api', require('./routes/organization'));          // Organization Structure (Nouran)
app.use('/api/directory', require('./routes/directory'));   // Search & Directory (Nour)

app.use(notFound);
app.use(errorHandler);

module.exports = app;
