import type { Request, Response, NextFunction } from 'express'
import { db } from '../../db'
import { codUserPaths } from '../../db/schema'
import { eq, and } from 'drizzle-orm'

export async function listCodLearners(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const paths = await db.select({
      pathId: codUserPaths.id,
      userId: codUserPaths.userId,
      status: codUserPaths.status,
      createdAt: codUserPaths.createdAt,
      updatedAt: codUserPaths.updatedAt,
    }).from(codUserPaths).where(eq(codUserPaths.platformId, 'ai-amplify'))

    res.json({ success: true, data: paths })
  } catch (e) { next(e) }
}

export async function resetCodLearner(req: Request<{ userId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    // CASCADE on cod_user_paths deletes all refs, assessments, progress, and quiz results
    await db.delete(codUserPaths).where(and(
      eq(codUserPaths.userId, req.params.userId),
      eq(codUserPaths.platformId, 'ai-amplify'),
    ))
    res.json({ success: true })
  } catch (e) { next(e) }
}
