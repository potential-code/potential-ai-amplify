import type { Request, Response, NextFunction } from 'express'
import * as bothSvc from '../../services/both/both.service'
import { db } from '../../db'
import { bothUserPaths } from '../../db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /both/path
 * Returns the learner's most recent Both path with milestones, content, and progress.
 */
export async function getBothPath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await bothSvc.getBothPath(req.user!.userId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * POST /both/path/generate
 * Creates a 'building' path and kicks off async generation.
 * Body: { profile: { goals, topics, experienceLevel, learningStyle, milestoneCount } }
 */
export async function generateBothPath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await bothSvc.initiateBothPath(req.user!.userId, req.body.profile)
    res.status(202).json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * POST /both/items/:itemId/complete
 * Marks an external or internal item as completed.
 * Body: { itemType: 'external' | 'internal', pathId, milestoneId, videoWatchPct? }
 */
export async function completeItem(
  req: Request<{ itemId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { itemType, pathId, milestoneId, videoWatchPct } = req.body
    await bothSvc.completeItem(
      req.user!.userId,
      itemType,
      req.params.itemId,
      pathId,
      milestoneId,
      videoWatchPct,
    )
    res.json({ success: true })
  } catch (e) { next(e) }
}

/**
 * GET /both/milestones/:milestoneId/pretest
 * Returns diagnostic pretest questions for the milestone (no correct answers).
 * Query: pathId
 */
export async function getMilestonePretest(
  req: Request<{ milestoneId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { pathId } = req.query as { pathId: string }
    const data = await bothSvc.getMilestonePretest(req.user!.userId, pathId, req.params.milestoneId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * POST /both/milestones/:milestoneId/pretest/submit
 * Records pretest answers (diagnostic only — no pass/fail gate).
 * Body: { pathId, answers: number[] }
 */
export async function submitPretest(
  req: Request<{ milestoneId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { pathId, answers } = req.body
    const data = await bothSvc.submitPretest(req.user!.userId, pathId, req.params.milestoneId, answers)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * GET /both/milestones/:milestoneId/quiz
 * Returns posttest questions for the milestone (no correct answers).
 * Query: pathId
 */
export async function getMilestoneQuiz(
  req: Request<{ milestoneId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { pathId } = req.query as { pathId: string }
    const data = await bothSvc.getMilestoneQuiz(req.user!.userId, pathId, req.params.milestoneId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * POST /both/milestones/:milestoneId/quiz/submit
 * Submits posttest answers, scores them, and gates milestone progression.
 * Body: { pathId, answers: number[] }
 */
export async function submitQuiz(
  req: Request<{ milestoneId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { pathId, answers } = req.body
    const data = await bothSvc.submitQuiz(req.user!.userId, pathId, req.params.milestoneId, answers)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * DELETE /lms/both/path
 * Deletes the calling user's own Both path. CASCADE on both_user_paths removes all
 * child rows (content refs, block refs, assessments, quiz results, item progress) automatically.
 * Uses req.user!.userId exclusively — no userId from request inputs.
 */
export async function deleteBothPath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await db.delete(bothUserPaths).where(and(
      eq(bothUserPaths.userId, req.user!.userId),
      eq(bothUserPaths.platformId, 'smeep'),
    ))
    res.status(200).json({ success: true })
  } catch (e) { next(e) }
}
