// OWNER: Jana - Employee Management service (business rules + Employees table)
//
// Three functions:
//   1. Employee onboarding     - register with checks; the manager is picked automatically
//                                (the department head) when none is given
//   2. Employment status       - Active <-> OnLeave -> Left workflow; leaving requires the
//      workflow (offboarding)    team to be handed over first; records are deleted only after leaving
//   3. Manager assignment      - reporting-line rules (below) for assigning one manager or
//      and team reassignment     moving a whole team to a new manager in one step
//
// Manager rules:
//   - nobody manages themselves, and there is no circular reporting
//   - the manager must be Active (not on leave, not left)
//   - the manager must be in the same department, or be company-level (no department)
//   - the manager's role must rank above the employee's role
//   - a manager can have at most MAX_DIRECT_REPORTS people (span of control)
//
// Security notes:
//   - passwordHash never leaves this file: every function that returns employee data
//     returns a cleaned copy without it. Raw records (with the hash) are only used
//     internally, through getEmployeeRaw / getEmployeeOrFailRaw.
//   - ids, status, accessRole and timestamps are never taken from the request body;
//     the controller whitelists the editable fields and this file sets the rest.
//   - a new employee gets the default password below (hashed with bcrypt); HR tells
//     them to change it with IT on first login.
//
// Other services read employee data through these functions, never the table directly.
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { db, TABLES, scanAll } = require('../db/dynamo');
const { AppError } = require('../middleware/errors');

const TABLE = TABLES.employees;
const MAX_DIRECT_REPORTS = Number(process.env.MAX_DIRECT_REPORTS || 8);
const DEFAULT_PASSWORD = process.env.DEFAULT_EMPLOYEE_PASSWORD || 'password123';

const STATUSES = ['Active', 'OnLeave', 'Left'];
const ALLOWED_MOVES = {
  Active: ['OnLeave', 'Left'],
  OnLeave: ['Active', 'Left'],
  Left: [] // final
};

// Loaded only when needed, because organizationService also uses this file.
const organization = () => require('./organizationService');

/* ---------- Cleaning ---------- */

// passwordHash stays inside the service; everything else may be returned.
function stripPassword(employee) {
  if (!employee) return employee;
  const { passwordHash, ...clean } = employee;
  return clean;
}

/* ---------- Reading ---------- */

async function listEmployees() {
  return (await scanAll(TABLE)).map(stripPassword);
}

// Everyone who still works here (used for counts, charts and search).
async function listCurrentEmployees() {
  return (await listEmployees()).filter((e) => e.status !== 'Left');
}

async function getEmployee(id) {
  return stripPassword(await getEmployeeRaw(id));
}

// Raw records (passwordHash included) for internal use and for the login check.
async function getEmployeeRaw(id) {
  const result = await db.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return result.Item || null;
}

async function getEmployeeOrFail(id) {
  return stripPassword(await getEmployeeOrFailRaw(id));
}

async function getEmployeeOrFailRaw(id) {
  const employee = await getEmployeeRaw(id);
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', `Employee ${id} does not exist.`);
  return employee;
}

async function getTeam(managerId) {
  return (await listEmployees()).filter((e) => e.managerId === managerId && e.status !== 'Left');
}

async function save(employee) {
  employee.updatedAt = new Date().toISOString();
  await db.send(new PutCommand({ TableName: TABLE, Item: employee }));
  return employee;
}

/* ---------- Login ---------- */

// Compared against when the email is unknown, so a wrong email and a wrong
// password take the same time and get the same answer.
let dummyHash;
async function getDummyHash() {
  if (!dummyHash) dummyHash = await bcrypt.hash(randomUUID(), 10);
  return dummyHash;
}

async function login(email, password) {
  if (!process.env.AUTH_SECRET) {
    throw new AppError(500, 'AUTH_NOT_CONFIGURED', 'Login is not set up on the server.');
  }
  const staff = await scanAll(TABLE);
  const user = staff.find((e) => e.email === email.toLowerCase()) || null;
  const hash = user && user.passwordHash ? user.passwordHash : await getDummyHash();
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) {
    throw new AppError(401, 'LOGIN_FAILED', 'Wrong email or password.');
  }
  if (user.status === 'Left') {
    throw new AppError(401, 'ACCOUNT_INACTIVE', 'This account can no longer log in.');
  }
  const token = jwt.sign({ sub: user.id }, process.env.AUTH_SECRET, { expiresIn: '12h' });
  return { token, user: stripPassword(user) };
}

/* ---------- Manager rules (shared by onboarding, assignment and reassignment) ---------- */

async function loadContext() {
  const [staff, roles] = await Promise.all([listEmployees(), organization().listRoles()]);
  return {
    byId: new Map(staff.map((e) => [e.id, e])),
    roleLevel: new Map(roles.map((r) => [r.id, r.level])),
    staff
  };
}

// Throws an AppError explaining the first rule that is broken.
// `extraReports` = how many people are being added to the manager at once (team moves).
function checkManagerRules(employee, managerId, ctx, extraReports = 1) {
  const manager = ctx.byId.get(managerId);

  if (employee.id && managerId === employee.id) {
    throw new AppError(400, 'SELF_MANAGER', 'An employee cannot be their own manager.');
  }
  if (!manager || manager.status === 'Left') {
    throw new AppError(404, 'MANAGER_NOT_FOUND', `Manager ${managerId} does not exist.`);
  }
  if (manager.status !== 'Active') {
    throw new AppError(409, 'MANAGER_NOT_ACTIVE', `${manager.name} is on leave and cannot take new reports.`);
  }

  // No circular reporting: walk up from the manager; reaching the employee means a loop.
  if (employee.id) {
    let current = manager;
    const seen = new Set();
    while (current && current.managerId && !seen.has(current.id)) {
      if (current.managerId === employee.id) {
        throw new AppError(409, 'CIRCULAR_REPORTING',
          `${employee.name} cannot report to ${manager.name}, who already reports to them.`);
      }
      seen.add(current.id);
      current = ctx.byId.get(current.managerId);
    }
  }

  if (manager.departmentId && manager.departmentId !== employee.departmentId) {
    throw new AppError(409, 'DIFFERENT_DEPARTMENT',
      `${manager.name} is in another department. A manager must be in the same department or company-level.`);
  }

  const employeeLevel = ctx.roleLevel.get(employee.roleId);
  const managerLevel = ctx.roleLevel.get(manager.roleId);
  if (employeeLevel !== undefined && managerLevel !== undefined && managerLevel <= employeeLevel) {
    throw new AppError(409, 'MANAGER_ROLE_TOO_LOW',
      `${manager.name}'s role must rank above ${employee.name}'s role.`);
  }

  const currentReports = ctx.staff.filter((e) =>
    e.managerId === managerId && e.status !== 'Left' && e.id !== employee.id).length;
  if (currentReports + extraReports > MAX_DIRECT_REPORTS) {
    throw new AppError(409, 'TEAM_FULL',
      `${manager.name} already has ${currentReports} direct report(s); the limit is ${MAX_DIRECT_REPORTS}.`);
  }
}

/* ---------- Function 1: Employee onboarding ---------- */

async function findByEmail(email, staff) {
  const list = staff || await listEmployees();
  return list.find((e) => e.email === email.toLowerCase()) || null;
}

async function createEmployee(data) {
  const ctx = await loadContext();

  if (await findByEmail(data.email, ctx.staff)) {
    throw new AppError(409, 'EMAIL_TAKEN', `An employee with email ${data.email} already exists.`);
  }
  let department = null;
  if (data.departmentId) department = await organization().getDepartmentOrFail(data.departmentId);
  if (data.roleId) await organization().getRoleOrFail(data.roleId);

  const now = new Date().toISOString();
  const employee = {
    name: data.name,
    email: data.email.toLowerCase(),
    phone: data.phone || '',
    skills: data.skills || [],
    departmentId: data.departmentId || null,
    roleId: data.roleId || null,
    managerId: null,
    status: 'Active',
    accessRole: 'EMPLOYEE',
    passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    createdAt: now
  };

  let managerAssignedAutomatically = false;
  if (data.managerId) {
    checkManagerRules(employee, data.managerId, ctx);
    employee.managerId = data.managerId;
  } else if (department && department.headId) {
    // Rule: with no manager given, the new employee reports to the department head,
    // as long as that is allowed by the manager rules (e.g. the head's team is not full).
    try {
      checkManagerRules(employee, department.headId, ctx);
      employee.managerId = department.headId;
      managerAssignedAutomatically = true;
    } catch {
      employee.managerId = null;
    }
  }

  // The condition makes sure a new id never overwrites an existing record.
  for (let attempt = 0; attempt < 3; attempt++) {
    employee.id = `EMP-${randomUUID().slice(0, 8)}`;
    try {
      employee.updatedAt = new Date().toISOString();
      await db.send(new PutCommand({
        TableName: TABLE,
        Item: employee,
        ConditionExpression: 'attribute_not_exists(id)'
      }));
      return { ...stripPassword(employee), managerAssignedAutomatically };
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
    }
  }
  throw new AppError(500, 'ID_CLASH', 'Could not create a fresh employee id. Try again.');
}

async function updateEmployee(id, changes) {
  const employee = await getEmployeeOrFailRaw(id);
  if (employee.status === 'Left') {
    throw new AppError(409, 'EMPLOYEE_LEFT', `${employee.name} has left; the record can no longer be edited.`);
  }

  if (changes.email && changes.email.toLowerCase() !== employee.email) {
    const other = await findByEmail(changes.email);
    if (other && other.id !== id) {
      throw new AppError(409, 'EMAIL_TAKEN', `An employee with email ${changes.email} already exists.`);
    }
    changes.email = changes.email.toLowerCase();
  }

  // Rule: moving to another department re-routes the reporting line.
  const movingDepartment = changes.departmentId !== undefined && changes.departmentId !== employee.departmentId;
  if (movingDepartment) {
    const team = await getTeam(id);
    if (team.length > 0) {
      throw new AppError(409, 'HAS_DIRECT_REPORTS',
        `${employee.name} manages ${team.length} employee(s). Reassign the team before changing department.`);
    }
    const departments = await organization().listDepartments();
    if (departments.some((d) => d.headId === id)) {
      throw new AppError(409, 'IS_DEPARTMENT_HEAD', `${employee.name} heads a department. Choose a new head first.`);
    }
    let newHead = null;
    if (changes.departmentId) {
      const department = await organization().getDepartmentOrFail(changes.departmentId);
      newHead = department.headId;
    }
    // The employee now reports to the new department's head (if the rules allow), otherwise nobody.
    changes.managerId = null;
    if (newHead) {
      const ctx = await loadContext();
      try {
        checkManagerRules({ ...employee, ...changes }, newHead, ctx);
        changes.managerId = newHead;
      } catch {
        changes.managerId = null;
      }
    }
  }

  return stripPassword(await save({ ...employee, ...changes }));
}

/* ---------- Function 2: Employment status workflow (offboarding) ---------- */

async function changeStatus(id, newStatus, reassignTo) {
  const employee = await getEmployeeOrFailRaw(id);

  if (!ALLOWED_MOVES[employee.status].includes(newStatus)) {
    throw new AppError(409, 'INVALID_STATUS_CHANGE',
      `Status cannot change from ${employee.status} to ${newStatus}.`);
  }

  if (newStatus === 'Left') {
    const departments = await organization().listDepartments();
    const led = departments.find((d) => d.headId === id);
    if (led) {
      throw new AppError(409, 'IS_DEPARTMENT_HEAD', `${employee.name} heads ${led.name}. Choose a new head first.`);
    }
    // Rule: the team must be handed over before someone leaves.
    const team = await getTeam(id);
    if (team.length > 0) {
      if (!reassignTo) {
        throw new AppError(409, 'HAS_DIRECT_REPORTS',
          `${employee.name} still manages ${team.length} employee(s). Give reassignTo to hand the team over.`,
          team.map((e) => ({ id: e.id, name: e.name })));
      }
      await reassignTeam(id, reassignTo);
    }
    employee.leftAt = new Date().toISOString();
  }

  employee.status = newStatus;
  return stripPassword(await save(employee));
}

async function deleteEmployee(id) {
  const employee = await getEmployeeOrFailRaw(id);
  // Rule: only offboarded records can be removed, so nobody disappears by mistake.
  if (employee.status !== 'Left') {
    throw new AppError(409, 'NOT_OFFBOARDED',
      `${employee.name} is still ${employee.status}. Set the status to Left first.`);
  }
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
  return stripPassword(employee);
}

/* ---------- Function 3: Manager assignment and team reassignment ---------- */

async function assignManager(id, managerId) {
  const employee = await getEmployeeOrFailRaw(id);
  if (employee.status === 'Left') {
    throw new AppError(409, 'EMPLOYEE_LEFT', `${employee.name} has left.`);
  }
  if (managerId !== null) {
    const ctx = await loadContext();
    checkManagerRules(employee, managerId, ctx);
  }
  employee.managerId = managerId;
  return stripPassword(await save(employee));
}

// Moves every direct report of `managerId` to `newManagerId`. All or nothing:
// every move is checked first, and nothing is saved if one of them breaks a rule.
async function reassignTeam(managerId, newManagerId) {
  const oldManager = await getEmployeeOrFailRaw(managerId);
  const team = await getTeam(managerId);
  if (team.length === 0) {
    throw new AppError(409, 'NO_TEAM', `${oldManager.name} has no direct reports to move.`);
  }
  if (newManagerId === managerId) {
    throw new AppError(400, 'SAME_MANAGER', 'Choose a different manager.');
  }

  const ctx = await loadContext();
  for (const member of team) {
    try {
      checkManagerRules(member, newManagerId, ctx, team.length);
    } catch (error) {
      throw new AppError(error.status, error.code, `Cannot move ${member.name}: ${error.message}`);
    }
  }

  for (const member of team) {
    const raw = await getEmployeeRaw(member.id);
    await save({ ...raw, managerId: newManagerId });
  }
  return { from: managerId, to: newManagerId, moved: team.map((e) => ({ id: e.id, name: e.name })) };
}

// Used by the Organization Structure service to give an employee a role.
async function setRole(id, roleId) {
  const employee = await getEmployeeOrFailRaw(id);
  employee.roleId = roleId;
  return stripPassword(await save(employee));
}

module.exports = {
  STATUSES,
  MAX_DIRECT_REPORTS,
  listEmployees,
  listCurrentEmployees,
  getEmployee,
  getEmployeeRaw,
  getEmployeeOrFail,
  getTeam,
  login,
  createEmployee,
  updateEmployee,
  changeStatus,
  deleteEmployee,
  assignManager,
  reassignTeam,
  setRole
};
