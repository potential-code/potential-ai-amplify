import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
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
 * Idempotent: an existing address keeps its row as it is. An address that
 * unsubscribed stays unsubscribed (anyone can type any address here, so this
 * form must not undo someone's unsubscribe); the answer is the same either
 * way, so it doesn't reveal whether an address is on the list.
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
        .onConflictDoNothing({ target: newsletterSubscribers.email });
      res.status(201).json({ success: true, data: { subscribed: true } });
    } catch (e) {
      next(e);
    }
  },
);

export default router;
