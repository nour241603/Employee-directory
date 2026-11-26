const organizationService = require('../services/organizationService');
const { AppError } = require('../middleware/errors');

const ID_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

function validationError(details) {
  return new AppError(400, 'VALIDATION_ERROR', 'Some fields are missing or invalid.', details);
}

function requireJson(req) {
  if (!req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the body as JSON (Content-Type: application/json).');
  }
}

function checkText(value, field, min, max, errors) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    errors.push({ field, message: `${field} must be ${min} to ${max} characters.` });
  }
}

/* ---------- Departments ---------- */

async function listDepartments(req, res, next) {
  try {
    res.status(200).json(await organizationService.listDepartmentsWithCounts());
  } catch (error) {
    next(error);
  }
}

async function createDepartment(req, res, next) {
  try {
    requireJson(req);
    const errors = [];
    checkText(req.body.name, 'name', 2, 60, errors);
    if (req.body.description !== undefined) checkText(req.body.description, 'description', 0, 300, errors);
    if (errors.length) throw validationError(errors);

    const department = await organizationService.createDepartment({
      name: req.body.name.trim(),
      description: (req.body.description || '').trim()
    });
    res.status(201).json(department);
  } catch (error) {
    next(error);
  }
}

async function updateDepartment(req, res, next) {
  try {
    requireJson(req);
    const { name, description, headId } = req.body;
    const errors = [];
    if (name !== undefined) checkText(name, 'name', 2, 60, errors);
    if (description !== undefined) checkText(description, 'description', 0, 300, errors);
    if (headId !== undefined && headId !== null && (typeof headId !== 'string' || !ID_PATTERN.test(headId))) {
      errors.push({ field: 'headId', message: 'headId must be an employee id or null.' });
    }
    if (name === undefined && description === undefined && headId === undefined) {
      errors.push({ message: 'Nothing to update.' });
    }
    if (errors.length) throw validationError(errors);

    const changes = {};
    if (name !== undefined) changes.name = name.trim();
    if (description !== undefined) changes.description = description.trim();
    if (headId !== undefined) changes.headId = headId || null;

    res.status(200).json(await organizationService.updateDepartment(req.params.id, changes));
  } catch (error) {
    next(error);
  }
}

async function deleteDepartment(req, res, next) {
  try {
    const removed = await organizationService.deleteDepartment(req.params.id);
    res.status(200).json({ message: `${removed.name} was deleted.`, id: removed.id });
  } catch (error) {
    next(error);
  }
}

/* ---------- Roles ---------- */

async function listRoles(req, res, next) {
  try {
    res.status(200).json(await organizationService.listRolesWithCounts());
  } catch (error) {
    next(error);
  }
}

async function createRole(req, res, next) {
  try {
    requireJson(req);
    const errors = [];
    checkText(req.body.title, 'title', 2, 60, errors);
    const level = req.body.level;
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      errors.push({ field: 'level', message: 'level must be a whole number from 1 (junior) to 10 (top).' });
    }
    if (errors.length) throw validationError(errors);

    res.status(201).json(await organizationService.createRole({ title: req.body.title.trim(), level }));
  } catch (error) {
    next(error);
  }
}

async function deleteRole(req, res, next) {
  try {
    const removed = await organizationService.deleteRole(req.params.id);
    res.status(200).json({ message: `${removed.title} was deleted.`, id: removed.id });
  } catch (error) {
    next(error);
  }
}

async function assignRole(req, res, next) {
  try {
    requireJson(req);
    const { roleId } = req.body;
    if (typeof roleId !== 'string' || !ID_PATTERN.test(roleId)) {
      throw validationError([{ field: 'roleId', message: 'roleId is required.' }]);
    }
    res.status(200).json(await organizationService.assignRole(req.params.id, roleId));
  } catch (error) {
    next(error);
  }
}

/* ---------- Org chart ---------- */

async function getOrgChart(req, res, next) {
  try {
    const { departmentId } = req.query;
    if (departmentId !== undefined && !ID_PATTERN.test(departmentId)) {
      throw validationError([{ field: 'departmentId', message: 'departmentId is not a valid id.' }]);
    }
    res.status(200).json(await organizationService.buildOrgChart(departmentId));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listRoles,
  createRole,
  deleteRole,
  assignRole,
  getOrgChart
};
