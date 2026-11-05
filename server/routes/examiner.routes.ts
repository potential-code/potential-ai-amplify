import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { capped, MINUTE, HOUR } from '../middleware/limits';
import {
  examinerAttemptSave,
  examinerAttemptsList,
  examinerCourseReference,
  examinerCourses,
  examinerProfile,
  getAnamSessionToken,
} from '../controllers/examiner.controller';

const router = Router();

/**
 * POST /api/ai/anam/session-token
 * Authenticated. Returns an Anam session token for the AI Examiner avatar tab.
 */
// Each token opens a video session billed per minute: 5 per 10 minutes, 20 a day.
router.post('/anam/session-token', authenticate, ...capped('anam-session', 5, 10 * MINUTE, 20), getAnamSessionToken);

/**
 * The course-grounded AI Examiner (Anna, smeepExaminer agent):
 * - GET  /api/ai/examiner/profile                      — who is being examined
 * - GET  /api/ai/examiner/courses                      — examinable courses
 * - GET  /api/ai/examiner/courses/:courseId/reference  — condensed course content
 * - GET  /api/ai/examiner/attempts                     — attempt history
 * - POST /api/ai/examiner/attempts                     — mark (server-side) and store a finished attempt
 */
router.get('/examiner/profile', authenticate, examinerProfile);
router.get('/examiner/courses', authenticate, examinerCourses);
router.get('/examiner/courses/:courseId/reference', authenticate, examinerCourseReference);
router.get('/examiner/attempts', authenticate, examinerAttemptsList);
router.post('/examiner/attempts', authenticate, ...capped('examiner-attempt', 10, HOUR, 30), examinerAttemptSave);

export default router;
