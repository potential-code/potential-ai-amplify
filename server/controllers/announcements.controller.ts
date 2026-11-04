import type { Request, Response, NextFunction } from "express";
import * as svc from "../services/announcements.service";

const AUDIENCES = ["learners", "mentors", "all"] as const;

/** GET /api/admin/announcements */
export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await svc.listAnnouncements() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/announcements/audience?audience=learners|mentors|all */
export async function audience(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const a = String(req.query["audience"] ?? "learners");
    if (!AUDIENCES.includes(a as svc.Audience)) {
      res.status(422).json({ success: false, error: { message: "Unknown audience", code: "VALIDATION_ERROR" } });
      return;
    }
    res.json({ success: true, data: await svc.countAudience(a as svc.Audience) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/announcements */
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(201).json({ success: true, data: await svc.createAnnouncement(req.user!.userId, req.body as svc.NewAnnouncement) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/announcements/:id/archive */
export async function archive(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !(await svc.archiveAnnouncement(req.params.id))) {
      res.status(404).json({ success: false, error: { message: "Announcement not found", code: "NOT_FOUND" } });
      return;
    }
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/account/email-preferences */
export async function getEmailPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: { announcements: await svc.getAnnouncementEmails(req.user!.userId) } });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/account/email-preferences  { announcements: boolean } */
export async function setEmailPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const on = (req.body as { announcements: boolean }).announcements;
    await svc.setAnnouncementEmails(req.user!.userId, on);
    res.json({ success: true, data: { announcements: on } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/account/unsubscribe  { token } — one click from an email, no sign-in. */
export async function unsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = svc.verifyUnsubscribeToken(String((req.body as { token?: string })?.token ?? ""));
    if (!userId || !(await svc.setAnnouncementEmails(userId, false))) {
      res.status(400).json({ success: false, error: { message: "This unsubscribe link isn't valid.", code: "INVALID_TOKEN" } });
      return;
    }
    res.json({ success: true, data: { unsubscribed: true } });
  } catch (err) {
    next(err);
  }
}
