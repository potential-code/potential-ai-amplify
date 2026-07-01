import type { Request, Response, NextFunction } from 'express'
import * as learningSvc from '../../services/learning/learning.service'
import { AppError } from '../../utils/app-error'

// ── Admin endpoints ───────────────────────────────────────────────────────────

/**
 * POST /lms/learning/setup/regenerate
 * Body: { maxCourses? } — optional positive-integer subset guard; default = all
 * published courses. Regenerates the global learning setup (themes +
 * questionnaire) from published courses' blocks. Returns the new version/counts.
 */
export async function regenerateSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { maxCourses } = (req.body ?? {}) as { maxCourses?: number }
    const data = await learningSvc.regenerateSetup(req.user!.userId, maxCourses)
    res.status(201).json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /lms/learning/themes
 * Returns the current (latest setup version) themes with block counts.
 */
export async function listThemes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await learningSvc.listCurrentThemes()
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

// ── Learner endpoints ─────────────────────────────────────────────────────────

/**
 * GET /lms/learning/questions
 * Returns the latest-setup-version questionnaire questions, ordered.
 */
export async function listQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await learningSvc.listCurrentQuestions()
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/learning/path/generate
 * Body: { answers: { [questionId]: answer } }
 * Upserts answers, generates a fresh active path, returns the stored path.
 */
export async function generatePath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { answers } = req.body as { answers: Record<string, unknown> }
    await learningSvc.generatePath(req.user!.userId, answers)
    // Return the fully-joined active path (themes + block content), matching
    // GET /path, so the client renders titles/descriptions without a refresh.
    const data = await learningSvc.getActivePath(req.user!.userId)
    res.status(201).json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/learning/path/regenerate
 * Body: { answers? } — re-runs path generation with new answers, or reuses the
 * learner's latest stored answers when omitted.
 */
export async function regeneratePath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { answers } = (req.body ?? {}) as { answers?: Record<string, unknown> }
    await learningSvc.generatePath(req.user!.userId, answers)
    const data = await learningSvc.getActivePath(req.user!.userId)
    res.status(201).json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /lms/learning/path
 * Returns the learner's active path joined to block content + progress status.
 * Returns data: null when the learner has no active path.
 */
export async function getPath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await learningSvc.getActivePath(req.user!.userId)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/learning/blocks/:blockId/complete
 * Marks a block complete from the in-chat path flow (bypasses course-page block
 * locking, auto-enrolls the course). Returns the updated block progress.
 */
export async function completeBlock(
  req: Request<{ blockId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await learningSvc.completeBlock(req.user!.userId, req.params.blockId)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

// ── Admin: learner management ─────────────────────────────────────────────────

/**
 * Validates that a route param userId is a present, non-empty string.
 * Throws a 400 AppError otherwise (matches the project's AppError pattern).
 */
function requireUserId(userId: string | undefined): string {
  if (!userId || userId.trim().length === 0) {
    throw new AppError('userId path param is required', 400, 'INVALID_USER_ID')
  }
  return userId
}

/**
 * GET /lms/learning/admin/learners
 * Returns all learners (role 'sme') with learning-path status + progress counts.
 */
export async function listLearners(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await learningSvc.listLearners()
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/learning/admin/learners/:userId/reset-progress
 * Clears the learner's block/course progress (keeps path + questionnaire).
 * Returns { cleared } — the number of block-progress rows deleted.
 */
export async function resetProgress(
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await learningSvc.resetProgress(requireUserId(req.params.userId))
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/learning/admin/learners/:userId/regenerate-path
 * Regenerates the learner's active path from their stored questionnaire answers.
 * Propagates a 400 AppError if the learner has no stored answers.
 */
export async function regenerateLearnerPath(
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await learningSvc.generatePath(requireUserId(req.params.userId))
    res.status(201).json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/learning/admin/regenerate-all
 * Rebuilds the global setup AND resets all learners' paths (preserving completed
 * blocks/progress/enrolments). Long-running: setup regenerate is a ~15-min AI run.
 */
export async function regenerateAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await learningSvc.regenerateAll(req.user!.userId)
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/learning/path
 * Resets the calling user's own learning path to pre-onboarding state: deletes
 * their path(s) and questionnaire answers so the intake form is presented again.
 * Uses req.user!.userId exclusively — no userId from request inputs.
 */
export async function deletePath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await learningSvc.resetPath(req.user!.userId)
    res.status(200).json({ success: true })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/learning/admin/learners/:userId/reset-path
 * Resets the learner to pre-onboarding: deletes path(s) + questionnaire answers.
 */
export async function resetLearnerPath(
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await learningSvc.resetPath(requireUserId(req.params.userId))
    res.json({ success: true, data })
  } catch (e) {
    next(e)
  }
}
