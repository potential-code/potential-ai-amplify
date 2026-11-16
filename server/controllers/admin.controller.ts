import type { Request, Response, NextFunction } from "express";
import * as adminService from "../services/admin.service";
import * as needsAttentionService from "../services/admin.needsAttention.service";
import { viaOperatorKey } from "../auth/operatorScope";

// On AI Amplify an invite code is the login: whoever holds an unused one can
// sign up. An admin in the browser sees the codes to hand out; an operator key
// (Maya) never does, so a key can't decide who gets a login. She still sees
// each invite's status, dates and who redeemed it, and the counts.
// `codeHidden: true` says the code was left out on purpose.
function inviteWithoutCode(invite: adminService.InviteWithUser) {
  const { code: _code, inviteLink: _inviteLink, ...rest } = invite;
  return { ...rest, codeHidden: true as const };
}

function needsAttentionWithoutCodes(panel: needsAttentionService.NeedsAttention) {
  return {
    ...panel,
    unusedInviteCodes: panel.unusedInviteCodes.map(({ code: _code, ...rest }) => ({ ...rest, codeHidden: true as const })),
  };
}

/**
 * POST /api/admin/invites
 *
 * Creates a new invite code. The authenticated user must be an admin.
 * Returns 201 with the generated invite code and its fully-formed link.
 */
export async function createInvite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is guaranteed by the authenticate + requireRole('admin') chain.
    const adminUserId = req.user!.userId; // ! safe: authenticate middleware guarantees it
    const invite = await adminService.createInvite(adminUserId);
    res.status(201).json({ success: true, data: invite });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/invites
 *
 * Returns all invite codes with optional nested info about the user who
 * redeemed each code (null when unredeemed).
 */
export async function listInvites(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const invites = await adminService.listInvites();
    res.status(200).json({ success: true, data: viaOperatorKey(req) ? invites.map(inviteWithoutCode) : invites });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/mentor-applications
 *
 * Returns mentor applications, optionally filtered by status via `?status=`.
 * Accepts any string value; invalid values will simply return an empty array
 * rather than an error — filtering is a convenience, not a constraint.
 */
export async function listMentorApplications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // status is an optional query string filter — coerce to string or undefined.
    const status =
      typeof req.query["status"] === "string" ? req.query["status"] : undefined;

    const applications = await adminService.listMentorApplications(status);
    res.status(200).json({ success: true, data: applications });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/mentor-applications/:id/approve
 *
 * Approves a pending mentor application, generates a setup token, and
 * dispatches an approval email to the applicant.
 */
export async function approveMentorApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await adminService.approveMentorApplication(req.params["id"] as string);
    res.status(200).json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/mentor-applications/:id/reject
 *
 * Rejects a mentor application by updating its status to 'rejected'.
 */
export async function rejectMentorApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await adminService.rejectMentorApplication(req.params["id"] as string);
    res.status(200).json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/stakeholder-applications
 *
 * Returns stakeholder registrations, optionally filtered by type via `?type=`.
 * Accepts any string value; invalid values will simply return an empty array.
 */
export async function listStakeholderApplications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const type =
      typeof req.query["type"] === "string" ? req.query["type"] : undefined;
    const applications = await adminService.listStakeholderApplications(type);
    res.status(200).json({ success: true, data: applications });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/needs-attention
 *
 * Counts for the dashboard "Needs attention" panel: pending mentor
 * applications, recent stakeholder applications, draft courses, unused invite
 * codes and mentor sessions that ended without being marked complete.
 * Returns { data: NeedsAttention }.
 */
export async function getNeedsAttention(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const panel = await needsAttentionService.getNeedsAttention();
    res.json({ data: viaOperatorKey(req) ? needsAttentionWithoutCodes(panel) : panel });
  } catch (err) {
    next(err);
  }
}
