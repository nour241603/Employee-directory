// OWNER: Jana - Employee Management service
//   Login:                  POST /login (public)
//   Password change:        PATCH /me/password (logged in, own password only)
//   1. Onboarding:          POST /, GET /, GET /:id, PATCH /:id
//   2. Status workflow:     PATCH /:id/status, DELETE /:id (only after leaving)
//   3. Manager assignment:  PUT /:id/manager, POST /:id/reassign-team, GET /:id/team
//   4. Promotions:          POST /:id/promote (HR), GET /:id/promotions (self or HR)
//
// Every route needs a login token. HR-only routes re-check the role on the server
// (401 without a token, 403 with the wrong role). PATCH /:id is limited to the
// employee themselves or HR; anyone else gets 404, so records are not leaked.
const express = require('express');
const controller = require('../controllers/employees');
const { requireLogin, requireRole, isSelfOrHR } = require('../middleware/auth');

const router = express.Router();

router.post('/login', controller.login);
router.post('/signup', controller.signUp);   // public: creates a Pending account only
router.patch('/me/password', requireLogin, controller.changePassword); // the caller's own password

// HR reviews self sign-ups (before '/:id' so "signups" is not read as an id)
router.get('/signups', requireLogin, requireRole('HR'), controller.listSignUps);
router.post('/:id/approve', requireLogin, requireRole('HR'), controller.approveSignUp);
router.post('/:id/reject', requireLogin, requireRole('HR'), controller.rejectSignUp);

router.get('/', requireLogin, controller.listEmployees);
router.post('/', requireLogin, requireRole('HR'), controller.createEmployee);
router.get('/:id', requireLogin, controller.getEmployee);
router.patch('/:id', requireLogin, isSelfOrHR, controller.updateEmployee);

router.patch('/:id/status', requireLogin, requireRole('HR'), controller.changeStatus);
router.delete('/:id', requireLogin, requireRole('HR'), controller.deleteEmployee);

router.put('/:id/manager', requireLogin, requireRole('HR'), controller.assignManager);
router.post('/:id/reassign-team', requireLogin, requireRole('HR'), controller.reassignTeam);
router.get('/:id/team', requireLogin, controller.getTeam);

router.post('/:id/promote', requireLogin, requireRole('HR'), controller.promote);
router.get('/:id/promotions', requireLogin, isSelfOrHR, controller.getPromotionHistory);

module.exports = router;
