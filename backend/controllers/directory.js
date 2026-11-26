// OWNER: Nour — request handling and query validation for /api/directory
const directoryService = require('../services/directoryService');
const { AppError } = require('../middleware/errors');

const ID_PATTERN = /^[A-Za-z0-9-]{1,40}$/;
const STATUSES = ['Active', 'OnLeave', 'Left'];
const SORTS = ['name', 'department', 'seniority'];

function validationError(details) {
  return new AppError(400, 'VALIDATION_ERROR', 'Some search options are invalid.', details);
}

function toPositiveInt(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : NaN;
}

function checkId(value, field, errors) {
  if (value !== undefined && value !== '' && (typeof value !== 'string' || !ID_PATTERN.test(value))) {
    errors.push({ field, message: `${field} is not a valid id.` });
  }
}

/* Function 1: Directory search */
async function search(req, res, next) {
  try {
    const { q, department, role, skill, status, sort } = req.query;
    const errors = [];

    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 10);
    if (Number.isNaN(page)) errors.push({ field: 'page', message: 'page must be a positive whole number.' });
    if (Number.isNaN(limit) || limit > 50) errors.push({ field: 'limit', message: 'limit must be from 1 to 50.' });
    if (q !== undefined && (typeof q !== 'string' || q.length > 80)) {
      errors.push({ field: 'q', message: 'Search text must be at most 80 characters.' });
    }
    checkId(department, 'department', errors);
    checkId(role, 'role', errors);
    if (skill !== undefined && (typeof skill !== 'string' || skill.length > 40)) {
      errors.push({ field: 'skill', message: 'Skill must be at most 40 characters.' });
    }
    if (status && !STATUSES.includes(status)) {
      errors.push({ field: 'status', message: `status must be one of ${STATUSES.join(', ')}.` });
    }
    if (sort && !SORTS.includes(sort)) {
      errors.push({ field: 'sort', message: `sort must be one of ${SORTS.join(', ')}.` });
    }
    if (errors.length) throw validationError(errors);

    res.status(200).json(await directoryService.search({
      q: (q || '').trim(),
      departmentId: department || undefined,
      roleId: role || undefined,
      skill: (skill || '').trim(),
      status: status || undefined,
      sort: sort || 'name',
      page,
      limit
    }));
  } catch (error) {
    next(error);
  }
}

/* Function 2: Expert finder */
async function findExperts(req, res, next) {
  try {
    const skills = String(req.query.skills || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const errors = [];
    if (skills.length === 0 || skills.length > 10 || skills.some((s) => s.length > 40)) {
      errors.push({ field: 'skills', message: 'Give 1 to 10 skills separated by commas, e.g. ?skills=sql,excel' });
    }
    checkId(req.query.department, 'department', errors);
    if (errors.length) throw validationError(errors);

    res.status(200).json(await directoryService.findExperts(skills, {
      departmentId: req.query.department || undefined,
      availableOnly: req.query.available === 'true'
    }));
  } catch (error) {
    next(error);
  }
}

/* Function 3: Reporting path finder */
async function findReportingPath(req, res, next) {
  try {
    const { from, to } = req.query;
    const errors = [];
    if (!from) errors.push({ field: 'from', message: 'from (employee id) is required.' });
    if (!to) errors.push({ field: 'to', message: 'to (employee id) is required.' });
    checkId(from, 'from', errors);
    checkId(to, 'to', errors);
    if (errors.length) throw validationError(errors);

    res.status(200).json(await directoryService.findReportingPath(from, to));
  } catch (error) {
    next(error);
  }
}

/* Profile view used by all three */
async function getDetails(req, res, next) {
  try {
    if (!ID_PATTERN.test(req.params.id)) {
      throw validationError([{ field: 'id', message: 'Invalid employee id.' }]);
    }
    res.status(200).json(await directoryService.getDetails(req.params.id));
  } catch (error) {
    next(error);
  }
}

async function getFilters(req, res, next) {
  try {
    res.status(200).json(await directoryService.getFilters());
  } catch (error) {
    next(error);
  }
}

module.exports = { search, findExperts, findReportingPath, getDetails, getFilters };
