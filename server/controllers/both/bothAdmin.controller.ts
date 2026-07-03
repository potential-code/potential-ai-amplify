import type { Request, Response, NextFunction } from 'express'
import { db } from '../../db'
import { bothUserPaths } from '../../db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /both/admin/learners
 * Lists all users who have a Both learning path on this platform.
 */
export async function listLearners(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const paths = await db.select({
      pathId: bothUserPaths.id,
      userId: bothUserPaths.userId,
      status: bothUserPaths.status,
      internalBlockCount: bothUserPaths.internalBlockCount,
      createdAt: bothUserPaths.createdAt,
      updatedAt: bothUserPaths.updatedAt,
    }).from(bothUserPaths).where(eq(bothUserPaths.platformId, 'ai-amplify'))

    res.json({ success: true, data: paths })
  } catch (e) { next(e) }
}

/**
 * POST /both/admin/learners/:userId/reset
 * Deletes the Both path for a specific learner. CASCADE on both_user_paths
 * removes all refs, assessments, progress rows, and quiz results automatically.
 *
 * @param req.params.userId - The learner whose path to delete.
 */
export async function resetLearner(req: Request<{ userId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await db.delete(bothUserPaths).where(and(
      eq(bothUserPaths.userId, req.params.userId),
      eq(bothUserPaths.platformId, 'ai-amplify'),
    ))
    res.json({ success: true })
  } catch (e) { next(e) }
}
