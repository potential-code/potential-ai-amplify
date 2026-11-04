import { Router, type IRouter } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { perUser, MINUTE } from "../middleware/limits";
import {
  getMyAchievements,
  getMyAnnouncements,
  getMyLeaderboard,
  getMyNotifications,
  getMyStreak,
  readAllMyNotifications,
  readMyNotification,
  setMyLeaderboardVisibility,
} from "../controllers/me.controller";
import * as organisations from "../controllers/organisations.controller";

/** Routes about the signed-in user, mounted at /api/me. */
const router: IRouter = Router();

// Each finished AI answer posts once; generous, but not unbounded.
const turnLimiter = perUser("ai-turns", 10 * MINUTE, 300);

router.get("/streak", authenticate, getMyStreak);
router.get("/notifications", authenticate, getMyNotifications);
router.get("/announcements", authenticate, getMyAnnouncements);
router.post("/notifications/read-all", authenticate, readAllMyNotifications);
router.post("/notifications/:id/read", authenticate, readMyNotification);
router.get("/achievements", authenticate, getMyAchievements);
router.get("/leaderboard", authenticate, getMyLeaderboard);
router.put("/leaderboard-visibility", authenticate, validate(z.object({ show: z.boolean() }).strict()), setMyLeaderboardVisibility);
router.get("/organisation", authenticate, organisations.mine);
router.post(
  "/ai-turns",
  authenticate,
  turnLimiter,
  validate(
    z.object({
      surface: z.string().trim().min(2).max(80).regex(/^[a-z0-9:-]+$/),
      messageId: z.string().min(1).max(200),
      question: z.string().max(20_000).optional().nullable(),
      answer: z.string().min(1).max(40_000),
    }),
  ),
  organisations.saveTurn,
);
router.post("/organisation/leave", authenticate, organisations.leave);

export default router;
