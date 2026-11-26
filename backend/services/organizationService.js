const { randomUUID } = require('crypto');
const { GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { db, TABLES, scanAll } = require('../db/dynamo');
const { AppError } = require('../middleware/errors');

// Loaded only when needed, because employeeService also uses this file.
const employees = () => require('./employeeService');

/* ---------- Departments ---------- */

async function listDepartments() {
  return scanAll(TABLES.departments);
}

async function getDepartment(id) {
  const result = await db.send(new GetCommand({ TableName: TABLES.departments, Key: { id } }));
  return result.Item || null;
}

async function getDepartmentOrFail(id) {
  const department = await getDepartment(id);
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', `Department ${id} does not exist.`);
  return department;
}

async function checkUniqueDepartmentName(name, exceptId) {
  const all = await listDepartments();
  const clash = all.find((d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== exceptId);
  if (clash) throw new AppError(409, 'DEPARTMENT_EXISTS', `A department called ${name} already exists.`);
}

// Rule: a department head must be an existing employee of that department.
async function checkHead(headId, departmentId) {
  if (!headId) return;
  const head = await employees().getEmployeeOrFail(headId);
  if (head.status !== 'Active') {
    throw new AppError(409, 'HEAD_NOT_ACTIVE', `${head.name} is not active and cannot head a department.`);
  }
  if (departmentId && head.departmentId !== departmentId) {
    throw new AppError(409, 'HEAD_NOT_IN_DEPARTMENT', `${head.name} is not a member of this department.`);
  }
}

// Departments with the number of employees in each.
async function listDepartmentsWithCounts() {
  const [departments, staff] = await Promise.all([listDepartments(), employees().listCurrentEmployees()]);
  return departments
    .map((d) => ({ ...d, employeeCount: staff.filter((e) => e.departmentId === d.id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createDepartment({ name, description }) {
  await checkUniqueDepartmentName(name);
  const department = {
    id: `DEP-${randomUUID().slice(0, 8)}`,
    name,
    description: description || '',
    headId: null,
    createdAt: new Date().toISOString()
  };
  await db.send(new PutCommand({ TableName: TABLES.departments, Item: department }));
  return department;
}

async function updateDepartment(id, changes) {
  const department = await getDepartmentOrFail(id);
  if (changes.name) await checkUniqueDepartmentName(changes.name, id);
  if (changes.headId !== undefined) await checkHead(changes.headId, id);

  const updated = { ...department, ...changes, updatedAt: new Date().toISOString() };
  await db.send(new PutCommand({ TableName: TABLES.departments, Item: updated }));
  return updated;
}

async function deleteDepartment(id) {
  const department = await getDepartmentOrFail(id);

  // Rule: a department that still has employees cannot be deleted.
  const staff = (await employees().listCurrentEmployees()).filter((e) => e.departmentId === id);
  if (staff.length > 0) {
    throw new AppError(409, 'DEPARTMENT_NOT_EMPTY',
      `${department.name} still has ${staff.length} employee(s). Move them first.`);
  }
  await db.send(new DeleteCommand({ TableName: TABLES.departments, Key: { id } }));
  return department;
}

/* ---------- Roles ---------- */

async function listRoles() {
  return scanAll(TABLES.roles);
}

async function getRole(id) {
  const result = await db.send(new GetCommand({ TableName: TABLES.roles, Key: { id } }));
  return result.Item || null;
}

async function getRoleOrFail(id) {
  const role = await getRole(id);
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', `Role ${id} does not exist.`);
  return role;
}

async function listRolesWithCounts() {
  const [roles, staff] = await Promise.all([listRoles(), employees().listCurrentEmployees()]);
  return roles
    .map((r) => ({ ...r, employeeCount: staff.filter((e) => e.roleId === r.id).length }))
    .sort((a, b) => b.level - a.level || a.title.localeCompare(b.title));
}

async function createRole({ title, level }) {
  const roles = await listRoles();
  if (roles.some((r) => r.title.toLowerCase() === title.toLowerCase())) {
    throw new AppError(409, 'ROLE_EXISTS', `A role called ${title} already exists.`);
  }
  const role = { id: `ROL-${randomUUID().slice(0, 8)}`, title, level, createdAt: new Date().toISOString() };
  await db.send(new PutCommand({ TableName: TABLES.roles, Item: role }));
  return role;
}

async function deleteRole(id) {
  const role = await getRoleOrFail(id);

  // Rule: a role that is still assigned cannot be deleted.
  const holders = (await employees().listCurrentEmployees()).filter((e) => e.roleId === id);
  if (holders.length > 0) {
    throw new AppError(409, 'ROLE_IN_USE', `${role.title} is assigned to ${holders.length} employee(s).`);
  }
  await db.send(new DeleteCommand({ TableName: TABLES.roles, Key: { id } }));
  return role;
}

// Rules: the new role must rank below the manager's role and above the roles of
// everyone who reports to this employee, so the reporting line stays consistent.
async function assignRole(employeeId, roleId) {
  const employee = await employees().getEmployeeOrFail(employeeId);
  if (employee.status === 'Left') {
    throw new AppError(409, 'EMPLOYEE_LEFT', `${employee.name} has left.`);
  }
  const role = await getRoleOrFail(roleId);
  const roles = await listRoles();
  const levelOf = new Map(roles.map((r) => [r.id, r]));

  if (employee.managerId) {
    const manager = await employees().getEmployee(employee.managerId);
    const managerRole = manager && levelOf.get(manager.roleId);
    if (managerRole && role.level >= managerRole.level) {
      throw new AppError(409, 'ROLE_ABOVE_MANAGER',
        `${role.title} must rank below the manager's role (${managerRole.title}).`);
    }
  }
  const team = await employees().getTeam(employeeId);
  const blocking = team.find((e) => levelOf.get(e.roleId) && levelOf.get(e.roleId).level >= role.level);
  if (blocking) {
    throw new AppError(409, 'ROLE_BELOW_TEAM',
      `${role.title} must rank above the roles of the team (${blocking.name} is ${levelOf.get(blocking.roleId).title}).`);
  }
  return employees().setRole(employeeId, roleId);
}

/* ---------- Org chart ---------- */

// Builds a tree: each node is an employee with the people who report to them.
async function buildOrgChart(departmentId) {
  if (departmentId) await getDepartmentOrFail(departmentId);

  const [staff, departments, roles] = await Promise.all([
    employees().listCurrentEmployees(), listDepartments(), listRoles()
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const roleTitle = new Map(roles.map((r) => [r.id, r.title]));

  const people = departmentId ? staff.filter((e) => e.departmentId === departmentId) : staff;
  const inChart = new Set(people.map((e) => e.id));

  const nodes = new Map(people.map((e) => [e.id, {
    id: e.id,
    name: e.name,
    role: roleTitle.get(e.roleId) || null,
    department: deptName.get(e.departmentId) || null,
    status: e.status,
    reports: []
  }]));

  const roots = [];
  for (const e of people) {
    const node = nodes.get(e.id);
    if (e.managerId && inChart.has(e.managerId)) nodes.get(e.managerId).reports.push(node);
    else roots.push(node);
  }

  const sortTree = (list) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((n) => sortTree(n.reports));
  };
  sortTree(roots);

  return { departmentId: departmentId || null, totalEmployees: people.length, roots };
}

module.exports = {
  listDepartments,
  listDepartmentsWithCounts,
  getDepartment,
  getDepartmentOrFail,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listRoles,
  listRolesWithCounts,
  getRole,
  getRoleOrFail,
  createRole,
  deleteRole,
  assignRole,
  buildOrgChart
};
