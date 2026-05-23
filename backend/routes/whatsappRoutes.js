import express from 'express';
import { getStatus, connect, disconnect } from '../controllers/whatsappController.js';

const router = express.Router();

// Public routes for shared dashboard whatsapp pairing
router.get('/status', getStatus);
router.post('/connect', connect);
router.post('/disconnect', disconnect);

export default router;
