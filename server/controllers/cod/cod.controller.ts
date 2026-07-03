import type { Request, Response, NextFunction } from 'express'
import * as codSvc from '../../services/cod/cod.service'
import { db } from '../../db'
import { codUserPaths } from '../../db/schema'
import { eq, and } from 'drizzle-orm'

export async function getCodPath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await codSvc.getCodPath(req.user!.userId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function generateCodPath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await codSvc.initiateCodPath(req.user!.userId, req.body.profile)
    res.status(202).json({ success: true, data })
  } catch (e) { next(e) }
}

export async function completeContent(req: Request<{ contentId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pathId, videoWatchPct } = req.body
    await codSvc.completeContent(req.user!.userId, pathId, req.params.contentId, videoWatchPct)
    res.json({ success: true })
  } catch (e) { next(e) }
}

export async function getMilestonePretest(req: Request<{ milestoneId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pathId } = req.query as { pathId: string }
    const data = await codSvc.getMilestonePretest(req.user!.userId, pathId, req.params.milestoneId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function submitPretest(req: Request<{ milestoneId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pathId, answers } = req.body
    const data = await codSvc.submitPretest(req.user!.userId, pathId, req.params.milestoneId, answers)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function getMilestoneQuiz(req: Request<{ milestoneId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pathId } = req.query as { pathId: string }
    const data = await codSvc.getMilestoneQuiz(req.user!.userId, pathId, req.params.milestoneId)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

export async function submitQuiz(req: Request<{ milestoneId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pathId, answers } = req.body
    const data = await codSvc.submitQuiz(req.user!.userId, pathId, req.params.milestoneId, answers)
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * DELETE /lms/cod/path
 * Deletes the calling user's own COD path. CASCADE on cod_user_paths removes all
 * child rows (content refs, assessments, quiz results, content progress) automatically.
 * Uses req.user!.userId exclusively — no userId from request inputs.
 */
export async function deleteCodPath(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await db.delete(codUserPaths).where(and(
      eq(codUserPaths.userId, req.user!.userId),
      eq(codUserPaths.platformId, 'ai-amplify'),
    ))
    res.status(200).json({ success: true })
  } catch (e) { next(e) }
}
