// Runs the SAME Express app on AWS Lambda (handler = lambda.handler).
const serverless = require('serverless-http');
const app = require('./app');

module.exports.handler = serverless(app);
