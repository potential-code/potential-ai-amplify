import type { Request, Response, NextFunction } from 'express';
import {
  answerVideoCheck,
  completeBlocks,
  getActionPlan,
  getCourseState,
  getLearnerProfile,
  getQuiz,
  getUnitIntro,
  getUnitMaterial,
  getVideo,
  isLearnerLanguage,
  resetCourseProgress,
  submitActionPlan,
  submitQuiz,
  type LearnerLanguage,
} from '../services/tutor.service';
import { AppError } from '../utils/app-error';

/**
 * Learner endpoints behind Anna as the Multi Learning tutor. See
 * services/tutor.service.ts for the model this serves: the page asks here
 * where the learner is and what each card contains, and Anna only chooses
 * which card comes next.
 */

function languageOf(req: Request): LearnerLanguage {
  const lang = req.query['lang'];
  return isLearnerLanguage(lang) ? lang : 'en';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOf(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new AppError(`${name} must be a UUID`, 400, 'VALIDATION_FAILED');
  }
  return value;
}

function optionalIdList(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => UUID.test(part))
    .slice(0, 200);
}

/** GET /api/ai/tutor/profile — who is learning. */
export async function tutorProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await getLearnerProfile(req.user!.userId) });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/tutor/state?courseId=&lang=&introSeen=a,b */
export async function tutorState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const courseId = req.query['courseId'] ? uuidOf(req.query['courseId'], 'courseId') : undefined;
    const data = await getCourseState(req.user!.userId, {
      courseId,
      lang: languageOf(req),
      introSeen: optionalIdList(req.query['introSeen']),
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/tutor/units/:unitId/intro?lang= */
export async function tutorUnitIntro(
  req: Request<{ unitId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getUnitIntro(req.user!.userId, uuidOf(req.params.unitId, 'unitId'), languageOf(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/tutor/units/:unitId/material — English source for the tutor. */
export async function tutorUnitMaterial(
  req: Request<{ unitId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getUnitMaterial(req.user!.userId, uuidOf(req.params.unitId, 'unitId'));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/tutor/videos/:learningBlockId?lang= */
export async function tutorVideo(
  req: Request<{ learningBlockId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getVideo(req.user!.userId, uuidOf(req.params.learningBlockId, 'learningBlockId'), languageOf(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** POST /api/ai/tutor/checks/:questionId/answer — body { selectedIndex }: save + say if right. */
export async function tutorCheckAnswer(
  req: Request<{ questionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const selectedIndex = (req.body as { selectedIndex?: unknown })?.selectedIndex;
    if (typeof selectedIndex !== 'number') throw new AppError('selectedIndex must be a number', 400, 'VALIDATION_FAILED');
    const data = await answerVideoCheck(req.user!.userId, uuidOf(req.params.questionId, 'questionId'), selectedIndex);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** POST /api/ai/tutor/courses/:courseId/reset — clear the learner's progress in a course. */
export async function tutorResetCourse(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await resetCourseProgress(req.user!.userId, uuidOf(req.params.courseId, 'courseId'));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/tutor/action-plans/:learningBlockId?lang= — the unit's prompts + any saved answers. */
export async function tutorActionPlan(
  req: Request<{ learningBlockId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getActionPlan(
      req.user!.userId,
      uuidOf(req.params.learningBlockId, 'learningBlockId'),
      languageOf(req),
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** POST /api/ai/tutor/action-plans/:learningBlockId/submit  { answers: [{ questionId, text }] } */
export async function tutorActionPlanSubmit(
  req: Request<{ learningBlockId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const answers = (req.body as { answers?: unknown })?.answers;
    if (!Array.isArray(answers) || answers.length === 0 || answers.length > 20) {
      throw new AppError('answers must be a non-empty array', 400, 'VALIDATION_FAILED');
    }
    const data = await submitActionPlan(
      req.user!.userId,
      uuidOf(req.params.learningBlockId, 'learningBlockId'),
      answers,
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/tutor/quizzes/:assessmentId?lang= — questions and options, never answers. */
export async function tutorQuiz(
  req: Request<{ assessmentId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getQuiz(req.user!.userId, uuidOf(req.params.assessmentId, 'assessmentId'), languageOf(req));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** POST /api/ai/tutor/quizzes/:assessmentId/submit  { answers: [{ questionId, selectedIndex }] } */
export async function tutorQuizSubmit(
  req: Request<{ assessmentId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const answers = (req.body as { answers?: unknown })?.answers;
    if (!Array.isArray(answers) || answers.length === 0 || answers.length > 200) {
      throw new AppError('answers must be a non-empty array', 400, 'VALIDATION_FAILED');
    }
    const data = await submitQuiz(req.user!.userId, uuidOf(req.params.assessmentId, 'assessmentId'), answers);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

/** POST /api/ai/tutor/progress/complete  { learningBlockIds: string[] } */
export async function tutorCompleteBlocks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = (req.body as { learningBlockIds?: unknown })?.learningBlockIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
      throw new AppError('learningBlockIds must be a non-empty array', 400, 'VALIDATION_FAILED');
    }
    await completeBlocks(req.user!.userId, ids.map((id) => uuidOf(id, 'learningBlockIds[]')));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}
