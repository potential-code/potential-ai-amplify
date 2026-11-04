import type { Request, Response, NextFunction } from "express";
import * as analyticsService from "../services/admin.analytics.service";
import type { AnalyticsRange } from "../services/admin.analytics.service";
import * as learningGainService from "../services/admin.learningGain.service";
import * as exportsService from "../services/admin.exports.service";
import * as impactService from "../services/admin.impact.service";

function parseRange(req: Request): AnalyticsRange {
  const r = req.query["range"];
  if (r === "7d" || r === "30d" || r === "12m") return r;
  return "12m"; // default
}

/** GET /api/admin/analytics/impact — the admin home's impact KPIs and charts */
export async function getImpact(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ success: true, data: await impactService.getImpact() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/insights?range=7d|30d|12m — the Analytics page's KPIs and charts */
export async function getAnalyticsInsights(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = String(req.query["range"] ?? "30d");
    const range = (["7d", "30d", "12m"].includes(raw) ? raw : "30d") as impactService.InsightRange;
    res.status(200).json({ success: true, data: await impactService.getAnalyticsInsights(range) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/stats — used by Overview dashboard, unchanged */
export async function getKpiStats(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await analyticsService.getKpiStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/kpi-overview?range= */
export async function getOverviewKpis(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getOverviewKpis(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/user-growth?range= */
export async function getUserGrowthTrend(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getUserGrowthTrend(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/enrollments — unchanged, used by Overview dashboard */
export async function getEnrollmentTrend(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getEnrollmentTrend();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/course-engagement — unchanged, used by Overview dashboard */
export async function getCourseEngagement(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getCourseEngagement();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/course-completion?range= */
export async function getCourseCompletionRates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getCourseCompletionRates(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/course-performance */
export async function getCoursePerformance(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getCoursePerformance();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/stakeholder-kpis */
export async function getStakeholderKpis(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getStakeholderKpis();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/stakeholder-trend?range= */
export async function getStakeholderTrend(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getStakeholderTrend(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/stakeholder-trend-by-type?range= */
export async function getStakeholderTrendByType(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await analyticsService.getStakeholderTrendByType(parseRange(req));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/analytics/learning-gain — pre-test vs final exam, overall and per course */
export async function getLearningGain(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ success: true, data: await learningGainService.getLearningGain() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/exports/:dataset?format=csv|xlsx — a dataset as a spreadsheet download */
export async function downloadExport(
  req: Request<{ dataset: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dataset = req.params.dataset as exportsService.ExportDataset;
    if (!exportsService.EXPORT_DATASETS.includes(dataset)) {
      res.status(404).json({ success: false, error: { message: "Unknown export", code: "NOT_FOUND" } });
      return;
    }
    const format: exportsService.ExportFormat = req.query["format"] === "csv" ? "csv" : "xlsx";
    const file = await exportsService.buildExport(dataset, format);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Row-Count", String(file.rows));
    res.status(200).send(file.body);
  } catch (err) {
    next(err);
  }
}
