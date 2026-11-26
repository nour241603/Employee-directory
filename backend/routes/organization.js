const express = require('express');
const controller = require('../controllers/organization');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/departments', requireLogin, controller.listDepartments);
router.post('/departments', requireLogin, requireRole('HR'), controller.createDepartment);
router.put('/departments/:id', requireLogin, requireRole('HR'), controller.updateDepartment);
router.delete('/departments/:id', requireLogin, requireRole('HR'), controller.deleteDepartment);

router.get('/roles', requireLogin, controller.listRoles);
router.post('/roles', requireLogin, requireRole('HR'), controller.createRole);
router.delete('/roles/:id', requireLogin, requireRole('HR'), controller.deleteRole);
router.put('/employees/:id/role', requireLogin, requireRole('HR'), controller.assignRole);

router.get('/org-chart', requireLogin, controller.getOrgChart);

module.exports = router;
