import type { Request, Response, NextFunction } from 'express';
import {
  buildCourseReference,
  createAnamSessionToken,
  getExamineeProfile,
  listAttempts,
  listExaminableCourses,
  saveAttempt,
  type SaveAttemptInput,
} from '../services/examiner.service';
import { AppError } from '../utils/app-error';

/**
 * POST /api/ai/anam/session-token
 *
 * Mints a short-lived Anam session token for the AI Examiner avatar tab.
 * The browser uses it with `@anam-ai/js-sdk` in CUSTOMER_CLIENT_V1 mode; the
 * conversation itself is driven by the Potential.com examiner bot client-side.
 */
export async function getAnamSessionToken(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const apiKey = process.env['ANAM_API_KEY'];
    const avatarId = process.env['ANAM_AVATAR_ID'];
    const voiceId = process.env['ANAM_VOICE_ID'];

    if (!apiKey || !avatarId || !voiceId) {
      throw new AppError(
        'Anam is not configured. Set ANAM_API_KEY, ANAM_AVATAR_ID, and ANAM_VOICE_ID.',
        503,
        'ANAM_NOT_CONFIGURED',
      );
    }

    const { sessionToken } = await createAnamSessionToken({
      apiKey,
      avatarId,
      voiceId,
      name: 'AI Examiner',
    });

    res.json({ success: true, data: { sessionToken } });
  } catch (e) {
    next(e);
  }
}

// ---------------------------------------------------------------------------
// Course-grounded exam endpoints (the Anna examiner page)
// ---------------------------------------------------------------------------

/** GET /api/ai/examiner/profile — who is being examined. */
export async function examinerProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await getExamineeProfile(req.user!.userId) });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/examiner/courses — enrolled published courses with studied %. */
export async function examinerCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await listExaminableCourses(req.user!.userId) });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/examiner/courses/:courseId/reference — the agent's syllabus. */
export async function examinerCourseReference(
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ success: true, data: await buildCourseReference(req.user!.userId, req.params.courseId) });
  } catch (e) {
    next(e);
  }
}

/** GET /api/ai/examiner/attempts?limit= — attempt history, newest first. */
export async function examinerAttemptsList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Number.parseInt(String(req.query['limit'] ?? '10'), 10);
    res.json({ success: true, data: await listAttempts(req.user!.userId, Number.isNaN(limit) ? 10 : limit) });
  } catch (e) {
    next(e);
  }
}

/** POST /api/ai/examiner/attempts — store one finished attempt. */
export async function examinerAttemptSave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as SaveAttemptInput;
    if (!body || typeof body.courseId !== 'string' || !body.courseId.trim()) {
      throw new AppError('courseId is required', 400, 'INVALID_ATTEMPT');
    }
    res.status(201).json({ success: true, data: await saveAttempt(req.user!.userId, body) });
  } catch (e) {
    next(e);
  }
}
