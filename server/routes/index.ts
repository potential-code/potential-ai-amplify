import { Router, type IRouter } from "express";
import healthRouter from "./health.routes";
import accountRouter from "./account.routes";
import newsletterRouter from "./newsletter.routes";
import stakeholdersRouter from "./stakeholders.routes";
import adminRouter from "./admin.routes";
import mentorRouter from "./mentor.routes";
import lmsRouter from "./lms.routes";
import mediaRouter from "./media.routes";
import offersRouter from "./offers.routes";
import smeRouter from "./sme.routes";
import liveEventsRouter from "./liveEvents.routes";
import aiToolsRouter from "./aiTools.routes";
import meRouter from "./me.routes";
import { organisationsRouter, partnerRouter } from "./organisations.routes";
import { aiReportsRouter, adminAiReportsRouter } from "./aiReports.routes";
import aiMentorRouter from "./aiMentor.routes";
import askSanaRouter from "./askSana.routes";
import tutorRouter from "./tutor.routes";
import aiAnalyticsRouter from "./ai-analytics.routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/account", accountRouter);
router.use("/newsletter", newsletterRouter);
router.use("/stakeholders", stakeholdersRouter);
router.use("/admin/ai-reports", adminAiReportsRouter);
// AI analytics (AI Insights + AI Dashboard). Mounted before /admin so its
// requests are authenticated once, by its own admin guard.
router.use("/admin/ai", aiAnalyticsRouter);
router.use("/admin", adminRouter);
router.use("/mentor", mentorRouter);
router.use("/lms", lmsRouter);
router.use("/media", mediaRouter);
router.use("/live-events", liveEventsRouter);
router.use("/offers", offersRouter);
router.use("/ai-tools", aiToolsRouter);
router.use("/me", meRouter);
router.use("/organisations", organisationsRouter);
router.use("/partner", partnerRouter);
router.use("/ai-reports", aiReportsRouter);
router.use("/ai-mentors", aiMentorRouter);
// Ask Anna (the path keeps its old internal name, like the "ask-sana" report surface).
router.use("/ask-sana", askSanaRouter);
// Multi Learning tutor (Anna, smeepTutor agent): /api/ai/tutor/*
router.use("/ai", tutorRouter);
// SME routes: /api/mentors/* and /api/sessions/* — no sub-prefix, paths defined in sme.routes.ts
router.use(smeRouter);

export default router;
