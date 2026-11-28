// OWNER: Jana (written by the team - security control)
//
// Three guards:
//   requireLogin        - a valid login token must come with the request; 401 otherwise
//   requireRole(...roles) - only the given access roles (EMPLOYEE, HR, MANAGER); 403 otherwise
//   isSelfOrHR          - an employee may touch only their own record; HR may touch anyone's.
//                         Somebody else's record answers 404, so its existence is not leaked.
//
// The token only carries the employee id. The role and status are read again from the
// Employees table on every request, so a role change (or offboarding) applies at once
// and nothing is trusted from the client.
const jwt = require('jsonwebtoken');
const { AppError } = require('./errors');

// Required lazily so this file never takes part in a require cycle.
const employeeService = () => require('../services/employeeService');

async function requireLogin(req, res, next) {
  try {
    if (!process.env.AUTH_SECRET) {
      throw new AppError(500, 'AUTH_NOT_CONFIGURED', 'Login is not set up on the server.');
    }
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'NOT_LOGGED_IN', 'Log in first.');
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.AUTH_SECRET);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Your login expired or is not valid. Log in again.');
    }
    const user = await employeeService().getEmployeeRaw(payload.sub);
    if (!user || user.status === 'Left' || user.status === 'Pending') {
      throw new AppError(401, 'ACCOUNT_INACTIVE', 'This account can no longer log in.');
    }
    // JWT iat is stored in whole seconds. Treat every token from the second in which
    // the password changed as old; this avoids leaving an old token valid due to rounding.
    if (user.passwordChangedAt && payload.iat < Math.ceil(Date.parse(user.passwordChangedAt) / 1000)) {
      throw new AppError(401, 'INVALID_TOKEN', 'Your password was changed. Log in again.');
    }
    // Newly registered employees can only replace the shared temporary password.
    // Check the router-relative path so this remains correct under /api/employees.
    if (user.mustChangePassword && !(req.method === 'PATCH' && req.path === '/me/password')) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before using the directory.');
    }
    req.user = { id: user.id, name: user.name, role: user.accessRole || 'EMPLOYEE' };
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'NOT_LOGGED_IN', 'Log in first.'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'NOT_ALLOWED', 'You do not have permission to do this.'));
    }
    next();
  };
}

function isSelfOrHR(req, res, next) {
  if (!req.user) return next(new AppError(401, 'NOT_LOGGED_IN', 'Log in first.'));
  if (req.user.role === 'HR' || req.user.id === req.params.id) return next();
  return next(new AppError(404, 'EMPLOYEE_NOT_FOUND', `Employee ${req.params.id} does not exist.`));
}

module.exports = { requireLogin, requireRole, isSelfOrHR };
