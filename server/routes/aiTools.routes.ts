import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { generatePdf } from '../controllers/aiTools.controller';
import { capped, HOUR } from '../middleware/limits';

const router = Router();

/**
 * POST /api/ai-tools/generate-pdf
 * Authenticated. Generates a business document PDF and emails it to the
 * user's own account email: 5 an hour, 20 a day per user.
 */
router.post('/generate-pdf', authenticate, ...capped('pdf-email', 5, HOUR, 20), generatePdf);

export default router;
