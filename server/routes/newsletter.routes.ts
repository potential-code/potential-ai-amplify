import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { newsletterSubscribers } from "../db/schema";
import { validate } from "../middleware/validate";
import { perIp, HOUR } from "../middleware/limits";

const router: IRouter = Router();

// Public form: throttle per visitor so it can't be used to flood the list.
const newsletterLimiter = perIp("newsletter", HOUR, 10, "Too many sign-ups from this network. Please try again later.");

const subscribeDto = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * POST /api/newsletter/subscribe  { email }
 * Idempotent: an existing address stays subscribed, and a previously
 * unsubscribed one is re-activated.
 */
router.post(
  "/subscribe",
  newsletterLimiter,
  validate(subscribeDto),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as z.infer<typeof subscribeDto>;
      await db
        .insert(newsletterSubscribers)
        .values({ email, source: "homepage" })
        .onConflictDoUpdate({
          target: newsletterSubscribers.email,
          set: { unsubscribedAt: sql`NULL` },
        });
      res.status(201).json({ success: true, data: { subscribed: true } });
    } catch (e) {
      next(e);
    }
  },
);

export default router;
