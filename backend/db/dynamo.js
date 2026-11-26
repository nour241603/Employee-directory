// Shared DynamoDB client used by every service.
// No keys in the code: on Lambda the IAM role gives permission,
// on your PC the "floci" AWS profile does.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const config = { region: process.env.AWS_REGION || 'us-east-1' };

// On your PC, point the client at Floci. On Lambda this stays empty.
if (process.env.DYNAMODB_ENDPOINT && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  config.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient(config), {
  marshallOptions: { removeUndefinedValues: true }
});

const TABLES = {
  employees: process.env.EMPLOYEES_TABLE || 'Employees',
  departments: process.env.DEPARTMENTS_TABLE || 'Departments',
  roles: process.env.ROLES_TABLE || 'Roles'
};

// Reads every item of a table (DynamoDB returns at most 1 MB per page).
async function scanAll(tableName) {
  const items = [];
  let lastKey;
  do {
    const result = await db.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey }));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

module.exports = { db, TABLES, scanAll };
