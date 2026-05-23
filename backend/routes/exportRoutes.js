import express from 'express';
import { exportCSV, exportExcel, exportPDF } from '../controllers/exportController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Protect all export endpoints
router.use(authenticateToken);

// GET /api/export/csv
router.get('/csv', exportCSV);

// GET /api/export/excel
router.get('/excel', exportExcel);

// GET /api/export/pdf
router.get('/pdf', exportPDF);

export default router;
