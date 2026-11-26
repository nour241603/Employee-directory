// OWNER: Nour — Search & Directory service
//   1. Directory search:       GET /api/directory
//   2. Expert finder:          GET /api/directory/experts
//   3. Reporting path finder:  GET /api/directory/path
//   Profile view:              GET /api/directory/:id
const express = require('express');
const controller = require('../controllers/directory');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireLogin, controller.search);
router.get('/filters', requireLogin, controller.getFilters);
router.get('/experts', requireLogin, controller.findExperts);
router.get('/path', requireLogin, controller.findReportingPath);
router.get('/:id', requireLogin, controller.getDetails);

module.exports = router;
