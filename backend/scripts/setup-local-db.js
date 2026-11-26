// Creates the three DynamoDB tables on Floci and fills them with sample data.
// Run from the backend folder:  npm run setup-db
// Safe to run again: existing tables are kept, sample items are overwritten.
//
// Every sample employee can log in with the demo password "password123"
// (stored as a bcrypt hash, never in plain text). Access roles:
// HR department = HR, anyone with a team = MANAGER, the rest = EMPLOYEE.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { CreateTableCommand, DescribeTableCommand, waitUntilTableExists } = require('@aws-sdk/client-dynamodb');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { db, TABLES } = require('../db/dynamo');

const DEMO_PASSWORD = 'password123';

async function ensureTable(name) {
  try {
    await db.send(new DescribeTableCommand({ TableName: name }));
    console.log(`Table ${name} already exists`);
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') throw error;
    await db.send(new CreateTableCommand({
      TableName: name,
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST'
    }));
    await waitUntilTableExists({ client: db, maxWaitTime: 30 }, { TableName: name });
    console.log(`Table ${name} created`);
  }
}

const now = new Date().toISOString();

const departments = [
  { id: 'DEP-eng', name: 'Engineering', description: 'Builds and runs the company software', headId: 'EMP-001' },
  { id: 'DEP-hr', name: 'Human Resources', description: 'Hiring, onboarding and staff records', headId: 'EMP-004' },
  { id: 'DEP-sales', name: 'Sales', description: 'Customer accounts and new business', headId: 'EMP-006' }
];

const roles = [
  { id: 'ROL-ceo', title: 'Chief Executive', level: 10 },
  { id: 'ROL-head', title: 'Head of Department', level: 8 },
  { id: 'ROL-lead', title: 'Team Lead', level: 6 },
  { id: 'ROL-senior', title: 'Senior Specialist', level: 4 },
  { id: 'ROL-junior', title: 'Junior Specialist', level: 2 }
];

const employees = [
  { id: 'EMP-000', name: 'Layla Hassan', email: 'layla.hassan@example.com', phone: '+20 100 000 0000', skills: ['leadership', 'strategy'], departmentId: null, roleId: 'ROL-ceo', managerId: null, accessRole: 'MANAGER' },
  { id: 'EMP-001', name: 'Omar Farouk', email: 'omar.farouk@example.com', phone: '+20 100 000 0001', skills: ['node.js', 'aws', 'leadership'], departmentId: 'DEP-eng', roleId: 'ROL-head', managerId: 'EMP-000', accessRole: 'MANAGER' },
  { id: 'EMP-002', name: 'Mona Adel', email: 'mona.adel@example.com', phone: '+20 100 000 0002', skills: ['javascript', 'react', 'sql'], departmentId: 'DEP-eng', roleId: 'ROL-lead', managerId: 'EMP-001', accessRole: 'MANAGER' },
  { id: 'EMP-003', name: 'Karim Said', email: 'karim.said@example.com', phone: '+20 100 000 0003', skills: ['sql', 'python', 'aws'], departmentId: 'DEP-eng', roleId: 'ROL-junior', managerId: 'EMP-002', accessRole: 'EMPLOYEE' },
  { id: 'EMP-004', name: 'Salma Nabil', email: 'salma.nabil@example.com', phone: '+20 100 000 0004', skills: ['recruiting', 'communication'], departmentId: 'DEP-hr', roleId: 'ROL-head', managerId: 'EMP-000', accessRole: 'HR' },
  { id: 'EMP-005', name: 'Youssef Ali', email: 'youssef.ali@example.com', phone: '+20 100 000 0005', skills: ['excel', 'communication'], departmentId: 'DEP-hr', roleId: 'ROL-senior', managerId: 'EMP-004', accessRole: 'HR' },
  { id: 'EMP-006', name: 'Hana Mostafa', email: 'hana.mostafa@example.com', phone: '+20 100 000 0006', skills: ['negotiation', 'excel', 'crm'], departmentId: 'DEP-sales', roleId: 'ROL-head', managerId: 'EMP-000', accessRole: 'MANAGER' },
  { id: 'EMP-007', name: 'Ahmed Tarek', email: 'ahmed.tarek@example.com', phone: '+20 100 000 0007', skills: ['crm', 'communication'], departmentId: 'DEP-sales', roleId: 'ROL-junior', managerId: 'EMP-006', accessRole: 'EMPLOYEE' }
];

async function main() {
  for (const table of Object.values(TABLES)) await ensureTable(table);

  for (const d of departments) await db.send(new PutCommand({ TableName: TABLES.departments, Item: { ...d, createdAt: now } }));
  for (const r of roles) await db.send(new PutCommand({ TableName: TABLES.roles, Item: { ...r, createdAt: now } }));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const e of employees) {
    await db.send(new PutCommand({
      TableName: TABLES.employees,
      Item: {
        ...e,
        status: 'Active',
        passwordHash,
        promotionHistory: [],
        createdAt: now,
        updatedAt: now
      }
    }));
  }
  console.log(`Sample data: ${departments.length} departments, ${roles.length} roles, ${employees.length} employees`);
  console.log(`Demo login password for every sample employee: ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error('Setup failed:', error.message);
  console.error('Is Floci running? docker compose -f infra/floci/docker-compose.yml up -d');
  process.exit(1);
});
