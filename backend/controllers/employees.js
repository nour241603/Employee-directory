// OWNER: Jana - request handling and input validation for /api/employees
const employeeService = require('../services/employeeService');
const { AppError } = require('../middleware/errors');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const ID_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

// Fields an employee may change on their own profile. HR may change everything below.
const SELF_EDITABLE = ['phone', 'skills'];
const HR_EDITABLE = ['name', 'email', 'phone', 'skills', 'departmentId'];

function validationError(details) {
  return new AppError(400, 'VALIDATION_ERROR', 'Some fields are missing or invalid.', details);
}

function checkFields(body, { partial }) {
  const errors = [];
  const has = (field) => body[field] !== undefined;

  if (!partial || has('name')) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 80) {
      errors.push({ field: 'name', message: 'Name must be 2 to 80 characters.' });
    }
  }
  if (!partial || has('email')) {
    if (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim())) {
      errors.push({ field: 'email', message: 'Email must be a valid address.' });
    }
  }
  if (has('phone') && body.phone !== '') {
    if (typeof body.phone !== 'string' || !PHONE_PATTERN.test(body.phone.trim())) {
      errors.push({ field: 'phone', message: 'Phone must be 7 to 20 digits (may start with +).' });
    }
  }
  if (has('skills')) {
    const ok = Array.isArray(body.skills) && body.skills.length <= 20 &&
      body.skills.every((s) => typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 40);
    if (!ok) errors.push({ field: 'skills', message: 'Skills must be a list of up to 20 short words.' });
  }
  for (const field of ['departmentId', 'roleId', 'managerId']) {
    if (has(field) && body[field] !== null && body[field] !== '' &&
        (typeof body[field] !== 'string' || !ID_PATTERN.test(body[field]))) {
      errors.push({ field, message: `${field} is not a valid id.` });
    }
  }
  return errors;
}

// Keeps only known fields and cleans them up. Anything else in the body
// (status, accessRole, createdAt, ...) is silently dropped, never trusted.
function clean(body, allowed) {
  const data = {};
  for (const field of allowed) {
    if (body[field] === undefined) continue;
    let value = body[field];
    if (typeof value === 'string') value = value.trim();
    if (field === 'skills') value = [...new Set(value.map((s) => s.trim().toLowerCase()))];
    if (['departmentId', 'roleId', 'managerId'].includes(field) && value === '') value = null;
    data[field] = value;
  }
  return data;
}

function requireJson(req) {
  if (!req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the body as JSON (Content-Type: application/json).');
  }
}

/* ---------- Login (public: no token yet) ---------- */

async function login(req, res, next) {
  try {
    requireJson(req);
    const { email, password } = req.body;
    const errors = [];
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      errors.push({ field: 'email', message: 'Email must be a valid address.' });
    }
    if (typeof password !== 'string' || password.length === 0) {
      errors.push({ field: 'password', message: 'Password is required.' });
    }
    if (errors.length) throw validationError(errors);

    res.status(200).json(await employeeService.login(email.trim(), password));
  } catch (error) {
    next(error);
  }
}

/* ---------- Function 1: Onboarding ---------- */

async function listEmployees(req, res, next) {
  try {
    const employees = await employeeService.listEmployees();
    employees.sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json(employees);
  } catch (error) {
    next(error);
  }
}

async function getEmployee(req, res, next) {
  try {
    res.status(200).json(await employeeService.getEmployeeOrFail(req.params.id));
  } catch (error) {
    next(error);
  }
}

async function createEmployee(req, res, next) {
  try {
    requireJson(req);
    const errors = checkFields(req.body, { partial: false });
    if (errors.length) throw validationError(errors);

    const data = clean(req.body, ['name', 'email', 'phone', 'skills', 'departmentId', 'roleId', 'managerId']);
    const employee = await employeeService.createEmployee(data);
    res.status(201).json(employee);
  } catch (error) {
    next(error);
  }
}

async function updateEmployee(req, res, next) {
  try {
    requireJson(req);
    const errors = checkFields(req.body, { partial: true });
    if (errors.length) throw validationError(errors);

    // req.user is set by middleware/auth.js; isSelfOrHR has already limited
    // this route to the employee themselves or HR.
    const isHR = req.user.role === 'HR';
    const allowed = isHR ? HR_EDITABLE : SELF_EDITABLE;
    const blocked = Object.keys(req.body).filter((f) => !allowed.includes(f));
    if (blocked.length) {
      throw new AppError(403, 'FIELD_NOT_EDITABLE', `You cannot change: ${blocked.join(', ')}.`);
    }

    const changes = clean(req.body, allowed);
    if (Object.keys(changes).length === 0) throw validationError([{ message: 'Nothing to update.' }]);

    res.status(200).json(await employeeService.updateEmployee(req.params.id, changes));
  } catch (error) {
    next(error);
  }
}

/* ---------- Function 2: Status workflow ---------- */

async function deleteEmployee(req, res, next) {
  try {
    const removed = await employeeService.deleteEmployee(req.params.id);
    res.status(200).json({ message: `${removed.name} was removed.`, id: removed.id });
  } catch (error) {
    next(error);
  }
}

async function changeStatus(req, res, next) {
  try {
    requireJson(req);
    const { status, reassignTo } = req.body;
    const errors = [];
    if (!employeeService.STATUSES.includes(status)) {
      errors.push({ field: 'status', message: `status must be one of ${employeeService.STATUSES.join(', ')}.` });
    }
    if (reassignTo !== undefined && reassignTo !== null && (typeof reassignTo !== 'string' || !ID_PATTERN.test(reassignTo))) {
      errors.push({ field: 'reassignTo', message: 'reassignTo must be an employee id.' });
    }
    if (errors.length) throw validationError(errors);

    res.status(200).json(await employeeService.changeStatus(req.params.id, status, reassignTo || null));
  } catch (error) {
    next(error);
  }
}

/* ---------- Function 3: Manager assignment and team moves ---------- */

async function assignManager(req, res, next) {
  try {
    requireJson(req);
    const { managerId } = req.body;
    if (managerId !== null && (typeof managerId !== 'string' || !ID_PATTERN.test(managerId))) {
      throw validationError([{ field: 'managerId', message: 'managerId must be an employee id or null.' }]);
    }
    res.status(200).json(await employeeService.assignManager(req.params.id, managerId));
  } catch (error) {
    next(error);
  }
}

async function reassignTeam(req, res, next) {
  try {
    requireJson(req);
    const { newManagerId } = req.body;
    if (typeof newManagerId !== 'string' || !ID_PATTERN.test(newManagerId)) {
      throw validationError([{ field: 'newManagerId', message: 'newManagerId is required.' }]);
    }
    const result = await employeeService.reassignTeam(req.params.id, newManagerId);
    res.status(200).json({ message: `${result.moved.length} employee(s) moved.`, ...result });
  } catch (error) {
    next(error);
  }
}

async function getTeam(req, res, next) {
  try {
    await employeeService.getEmployeeOrFail(req.params.id);
    res.status(200).json(await employeeService.getTeam(req.params.id));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  assignManager,
  changeStatus,
  reassignTeam,
  getTeam
};
