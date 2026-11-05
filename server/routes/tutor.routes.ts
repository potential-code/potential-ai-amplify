import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  tutorActionPlan,
  tutorActionPlanSubmit,
  tutorCheckAnswer,
  tutorCompleteBlocks,
  tutorProfile,
  tutorQuiz,
  tutorQuizSubmit,
  tutorResetCourse,
  tutorState,
  tutorUnitIntro,
  tutorUnitMaterial,
  tutorVideo,
} from '../controllers/tutor.controller';

/**
 * The Multi Learning tutor (Anna, smeepTutor agent):
 * - GET  /api/ai/tutor/profile                  — who is learning
 * - GET  /api/ai/tutor/state                    — where they are + NEXT STEP line
 * - GET  /api/ai/tutor/units/:unitId/intro      — unit introduction card
 * - GET  /api/ai/tutor/units/:unitId/material   — English source for the model
 * - GET  /api/ai/tutor/videos/:learningBlockId  — video card (+ its one-question check)
 * - POST /api/ai/tutor/checks/:questionId/answer — answer a video's check question
 * - GET  /api/ai/tutor/action-plans/:learningBlockId        — action-plan card
 * - POST /api/ai/tutor/action-plans/:learningBlockId/submit — save plan + complete block
 * - GET  /api/ai/tutor/quizzes/:assessmentId        — final-exam card (never answers)
 * - POST /api/ai/tutor/quizzes/:assessmentId/submit — grade + record an attempt
 * - POST /api/ai/tutor/progress/complete        — mark blocks complete
 * - POST /api/ai/tutor/courses/:courseId/reset  — start a course over
 */
const router = Router();

router.get('/tutor/profile', authenticate, tutorProfile);
router.get('/tutor/state', authenticate, tutorState);
router.get('/tutor/units/:unitId/intro', authenticate, tutorUnitIntro);
router.get('/tutor/units/:unitId/material', authenticate, tutorUnitMaterial);
router.get('/tutor/videos/:learningBlockId', authenticate, tutorVideo);
router.post('/tutor/checks/:questionId/answer', authenticate, tutorCheckAnswer);
router.get('/tutor/action-plans/:learningBlockId', authenticate, tutorActionPlan);
router.post('/tutor/action-plans/:learningBlockId/submit', authenticate, tutorActionPlanSubmit);
router.get('/tutor/quizzes/:assessmentId', authenticate, tutorQuiz);
router.post('/tutor/quizzes/:assessmentId/submit', authenticate, tutorQuizSubmit);
router.post('/tutor/progress/complete', authenticate, tutorCompleteBlocks);
router.post('/tutor/courses/:courseId/reset', authenticate, tutorResetCourse);

export default router;
