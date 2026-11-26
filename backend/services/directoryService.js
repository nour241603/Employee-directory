// OWNER: Nour — Search & Directory service
//
// Three functions:
//   1. Directory search       - one search with text + department/role/skill/status filters,
//                               sorting and paging (people who left are hidden by default)
//   2. Expert finder          - ranks employees by how well their skills match a need,
//                               available people first, people on leave marked unavailable
//   3. Reporting path finder  - "how do I escalate from A to B?": walks both reporting lines,
//                               finds the closest shared manager and returns the path
//
// Employee details (GET /api/directory/:id) is the profile view used by all three.
// Reads data through employeeService and organizationService (never their tables directly).
const crypto = require('crypto');
const employeeService = require('./employeeService');
const organizationService = require('./organizationService');
const { AppError } = require('../middleware/errors');

// External API: Gravatar gives each employee a profile photo from their email.
// We send only a one-way hash of the email, never the email itself.
const AVATAR_BASE = process.env.AVATAR_API_URL || 'https://www.gravatar.com/avatar';

function avatarUrl(email) {
  const hash = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `${AVATAR_BASE}/${hash}?s=160&d=identicon`;
}

// Loads everything once and returns employees with readable names attached.
async function loadDirectory() {
  const [staff, departments, roles] = await Promise.all([
    employeeService.listEmployees(),
    organizationService.listDepartments(),
    organizationService.listRoles()
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const nameOf = new Map(staff.map((e) => [e.id, e.name]));

  return staff.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    phone: e.phone,
    skills: e.skills || [],
    status: e.status || 'Active',
    departmentId: e.departmentId,
    department: deptName.get(e.departmentId) || null,
    roleId: e.roleId,
    role: roleById.get(e.roleId)?.title || null,
    roleLevel: roleById.get(e.roleId)?.level || 0,
    managerId: e.managerId,
    manager: nameOf.get(e.managerId) || null,
    avatarUrl: avatarUrl(e.email)
  }));
}

/* ---------- Function 1: Directory search ---------- */

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  department: (a, b) => (a.department || '~').localeCompare(b.department || '~') || a.name.localeCompare(b.name),
  seniority: (a, b) => b.roleLevel - a.roleLevel || a.name.localeCompare(b.name)
};

async function search({ q, departmentId, roleId, skill, status, sort, page, limit }) {
  let results = await loadDirectory();

  // People who left are hidden unless someone asks for them.
  results = status ? results.filter((e) => e.status === status) : results.filter((e) => e.status !== 'Left');

  if (q) {
    const term = q.toLowerCase();
    results = results.filter((e) =>
      e.name.toLowerCase().includes(term) ||
      e.email.includes(term) ||
      (e.role || '').toLowerCase().includes(term) ||
      e.skills.some((s) => s.includes(term)));
  }
  if (departmentId) results = results.filter((e) => e.departmentId === departmentId);
  if (roleId) results = results.filter((e) => e.roleId === roleId);
  if (skill) results = results.filter((e) => e.skills.includes(skill.toLowerCase()));

  results.sort(SORTS[sort] || SORTS.name);

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (page > totalPages) {
    throw new AppError(400, 'PAGE_OUT_OF_RANGE', `Page ${page} does not exist; there are ${totalPages} page(s).`);
  }
  const start = (page - 1) * limit;
  return { total, page, limit, totalPages, sort: SORTS[sort] ? sort : 'name', results: results.slice(start, start + limit) };
}

/* ---------- Function 2: Expert finder ---------- */

// Score = share of the requested skills the person has (0-100).
// Ties: available people first, then more senior, then by name.
async function findExperts(skills, { departmentId, availableOnly } = {}) {
  const wanted = [...new Set(skills.map((s) => s.toLowerCase()))];
  let people = (await loadDirectory()).filter((e) => e.status !== 'Left');
  if (departmentId) people = people.filter((e) => e.departmentId === departmentId);
  if (availableOnly) people = people.filter((e) => e.status === 'Active');

  const ranked = people
    .map((e) => {
      const matched = wanted.filter((s) => e.skills.includes(s));
      return {
        id: e.id, name: e.name, role: e.role, department: e.department, email: e.email,
        avatarUrl: e.avatarUrl,
        available: e.status === 'Active',
        matchedSkills: matched,
        missingSkills: wanted.filter((s) => !e.skills.includes(s)),
        score: Math.round((matched.length / wanted.length) * 100),
        roleLevel: e.roleLevel
      };
    })
    .filter((e) => e.matchedSkills.length > 0)
    .sort((a, b) => b.score - a.score || Number(b.available) - Number(a.available) ||
      b.roleLevel - a.roleLevel || a.name.localeCompare(b.name));

  // Which requested skills nobody in the company has (a skills gap).
  const covered = new Set(ranked.flatMap((e) => e.matchedSkills));
  return {
    skills: wanted,
    count: ranked.length,
    fullMatches: ranked.filter((e) => e.score === 100).length,
    skillsNobodyHas: wanted.filter((s) => !covered.has(s)),
    results: ranked
  };
}

/* ---------- Function 3: Reporting path finder ---------- */

// The chain from a person up to the top: [person, manager, manager's manager, ...]
function chainUp(id, byId) {
  const chain = [];
  const seen = new Set();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = byId.get(current.managerId);
  }
  return chain;
}

const step = (e, direction) => ({ id: e.id, name: e.name, role: e.role, department: e.department, direction });

async function findReportingPath(fromId, toId) {
  const everyone = await loadDirectory();
  const byId = new Map(everyone.filter((e) => e.status !== 'Left').map((e) => [e.id, e]));
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', `Employee ${fromId} does not exist.`);
  if (!to) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', `Employee ${toId} does not exist.`);
  if (fromId === toId) throw new AppError(400, 'SAME_EMPLOYEE', 'Choose two different employees.');

  const upFrom = chainUp(fromId, byId);
  const upTo = chainUp(toId, byId);
  const toIndex = new Map(upTo.map((e, i) => [e.id, i]));

  // Closest shared manager = first person in A's chain that is also in B's chain.
  const meetAt = upFrom.findIndex((e) => toIndex.has(e.id));
  if (meetAt === -1) {
    return {
      connected: false,
      message: `${from.name} and ${to.name} have no shared manager.`,
      from: step(from, 'start'), to: step(to, 'end'), path: []
    };
  }
  const common = upFrom[meetAt];
  const down = upTo.slice(0, toIndex.get(common.id)).reverse();

  const path = [
    ...upFrom.slice(0, meetAt).map((e, i) => step(e, i === 0 ? 'start' : 'up')),
    step(common, common.id === fromId ? 'start' : common.id === toId ? 'end' : 'shared-manager'),
    ...down.map((e, i) => step(e, i === down.length - 1 ? 'end' : 'down'))
  ];

  let relationship = 'Same reporting line';
  if (common.id === toId) relationship = `${to.name} is above ${from.name} in the reporting line`;
  else if (common.id === fromId) relationship = `${from.name} is above ${to.name} in the reporting line`;
  else if (from.managerId === to.managerId) relationship = 'Same manager (teammates)';
  else relationship = `Closest shared manager: ${common.name}`;

  return {
    connected: true,
    relationship,
    sharedManager: step(common, 'shared-manager'),
    steps: path.length - 1,
    path
  };
}

/* ---------- Profile view + filter values ---------- */

async function getDetails(id) {
  const everyone = await loadDirectory();
  const person = everyone.find((e) => e.id === id);
  if (!person) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', `Employee ${id} does not exist.`);

  const byId = new Map(everyone.map((e) => [e.id, e]));
  const team = everyone
    .filter((e) => e.managerId === id && e.status !== 'Left')
    .map((e) => ({ id: e.id, name: e.name, role: e.role }));
  const managerChain = chainUp(id, byId).slice(1).map((e) => ({ id: e.id, name: e.name, role: e.role }));

  return { ...person, team, managerChain };
}

async function getFilters() {
  const [everyone, departments, roles] = await Promise.all([
    loadDirectory(), organizationService.listDepartments(), organizationService.listRoles()
  ]);
  const current = everyone.filter((e) => e.status !== 'Left');
  return {
    departments: departments.map((d) => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)),
    roles: roles.map((r) => ({ id: r.id, title: r.title })).sort((a, b) => a.title.localeCompare(b.title)),
    skills: [...new Set(current.flatMap((e) => e.skills))].sort(),
    statuses: employeeService.STATUSES,
    people: current.map((e) => ({ id: e.id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

module.exports = { search, findExperts, findReportingPath, getDetails, getFilters };
