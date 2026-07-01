import { Router, type IRouter } from "express";
import healthRouter from "./health.routes";
import authRouter from "./auth.routes";
import stakeholdersRouter from "./stakeholders.routes";
import adminRouter from "./admin.routes";
import mentorRouter from "./mentor.routes";
import lmsRouter from "./lms.routes";
import mediaRouter from "./media.routes";
import offersRouter from "./offers.routes";
import smeRouter from "./sme.routes";
import liveEventsRouter from "./liveEvents.routes";
import aiToolsRouter from "./aiTools.routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/stakeholders", stakeholdersRouter);
router.use("/admin", adminRouter);
router.use("/mentor", mentorRouter);
router.use("/lms", lmsRouter);
router.use("/media", mediaRouter);
router.use("/live-events", liveEventsRouter);
router.use("/offers", offersRouter);
router.use("/ai-tools", aiToolsRouter);
// SME routes: /api/mentors/* and /api/sessions/* — no sub-prefix, paths defined in sme.routes.ts
router.use(smeRouter);

export default router;
