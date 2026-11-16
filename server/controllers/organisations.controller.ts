import type { Request, Response, NextFunction } from "express";
import * as svc from "../services/organisations.service";
import { participantRecord, recordTurn } from "../services/participantRecord.service";
import { learnerNotificationsEnabled } from "../services/notifications.service";
import { buildExport, ORGANISATION_DATASETS, type ExportDataset } from "../services/admin.exports.service";
import { viaOperatorKey } from "../auth/operatorScope";

/** Organisations: the admin area, the partner dashboard, the public sign-up link and the learner's own. */

type Handler<P = Record<string, string>> = (req: Request<P>, res: Response, next: NextFunction) => Promise<void>;
const wrap =
  <P = Record<string, string>>(fn: (req: Request<P>, res: Response) => Promise<unknown>): Handler<P> =>
  async (req, res, next) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

/** "Ministry of Economy" → "ministry-of-economy" for download filenames. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "organisation";

async function sendExport(req: Request<{ dataset: string }>, res: Response, organisationId: string): Promise<void> {
  const dataset = req.params.dataset as ExportDataset;
  if (!(ORGANISATION_DATASETS as readonly string[]).includes(dataset)) {
    res.status(404).json({ success: false, error: { message: "Unknown export", code: "NOT_FOUND" } });
    return;
  }
  const org = await svc.getOrganisation(organisationId);
  const file = await buildExport(dataset, req.query["format"] === "csv" ? "csv" : "xlsx", { organisationId, filePrefix: slug(org.name) });
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Row-Count", String(file.rows));
  res.status(200).send(file.body);
}

// ── Admin ────────────────────────────────────────────────────────────────────

// An organisation's join code (and the sign-up link built from it) puts
// whoever signs up with it into that organisation, where its partners see
// them. An admin in the browser gets it to pass on; an operator key (Maya)
// never does, as with invite codes and partner setup links. The rest of the
// row (name, type, whether the link is on, counts) stays.
// `joinCodeHidden: true` says the code was left out on purpose.
function withoutJoinCode<T extends { joinCode: string; joinLink: string }>(org: T): Omit<T, "joinCode" | "joinLink"> & { joinCodeHidden: true } {
  const { joinCode: _joinCode, joinLink: _joinLink, ...rest } = org;
  return { ...rest, joinCodeHidden: true };
}

export const list = wrap(async (req) => {
  const rows = await svc.listOrganisations();
  return viaOperatorKey(req) ? rows.map(withoutJoinCode) : rows;
});
export const create = wrap(async (req, res) => {
  res.status(201);
  return svc.createOrganisation(req.user!.userId, req.body as { name: string; type: svc.OrganisationType });
});
export const update = wrap<{ id: string }>((req) => svc.updateOrganisation(req.params.id, req.body as Parameters<typeof svc.updateOrganisation>[1]));
export const regenerateCode = wrap<{ id: string }>((req) => svc.regenerateJoinCode(req.params.id));
export const archive = wrap<{ id: string }>(async (req) => {
  await svc.archiveOrganisation(req.params.id);
  return { ok: true };
});
export const dashboard = wrap<{ id: string }>(async (req) => {
  const board = await svc.organisationDashboard(req.params.id);
  return {
    ...board,
    organisation: viaOperatorKey(req) ? withoutJoinCode(board.organisation) : board.organisation,
    // Admin only: adding existing learners needs learner messages to tell them.
    canAddLearners: learnerNotificationsEnabled(),
  };
});
export const addLearners = wrap<{ id: string }>((req) => svc.addLearnersByEmail(req.params.id, (req.body as { emails: string[] }).emails));
export const removeLearner = wrap<{ id: string; userId: string }>(async (req) => {
  await svc.removeLearner(req.params.id, req.params.userId);
  return { ok: true };
});
// A partner setup link holds a live token: whoever opens it creates the
// partner login and sees the organisation's learners. An admin in the browser
// gets it to pass on by hand; an operator key (Maya) never does, so a key
// can't be turned into a partner login. The invite email still carries it.
const withoutSetupLinkForKeys = (req: Request<{ id: string }>, contact: svc.PartnerContact): svc.PartnerContact => {
  if (!viaOperatorKey(req)) return contact;
  const { setupLink: _setupLink, ...rest } = contact;
  return rest;
};

export const partners = wrap<{ id: string }>(async (req) =>
  (await svc.listPartners(req.params.id)).map((contact) => withoutSetupLinkForKeys(req, contact)),
);
export const invitePartner = wrap<{ id: string }>(async (req, res) => {
  res.status(201);
  const invite = await svc.invitePartner(req.params.id, req.user!.userId, req.body as { fullName: string; email: string });
  return withoutSetupLinkForKeys(req, invite);
});
export const cancelInvite = wrap<{ id: string; inviteId: string }>(async (req) => {
  await svc.cancelInvite(req.params.id, req.params.inviteId);
  return { ok: true };
});
export const removePartner = wrap<{ id: string; userId: string }>(async (req) => {
  await svc.removePartner(req.params.id, req.params.userId);
  return { ok: true };
});
export const adminExport: Handler<{ id: string; dataset: string }> = async (req, res, next) => {
  try {
    await sendExport(req as unknown as Request<{ dataset: string }>, res, req.params.id);
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/organisations/:id/learners/:userId — one participant's full record. */
export const adminParticipant = wrap<{ id: string; userId: string }>((req) => participantRecord(req.params.id, req.params.userId));

// ── Partner (their own organisation only) ────────────────────────────────────

/** GET /api/partner/learners/:userId — one of their own participants' full record. */
export const partnerParticipant = wrap<{ userId: string }>(async (req) =>
  participantRecord(await svc.partnerOrganisationId(req.user!.userId), req.params.userId),
);

export const partnerDashboard = wrap(async (req) => svc.organisationDashboard(await svc.partnerOrganisationId(req.user!.userId)));
export const partnerExport: Handler<{ dataset: string }> = async (req, res, next) => {
  try {
    await sendExport(req, res, await svc.partnerOrganisationId(req.user!.userId));
  } catch (err) {
    next(err);
  }
};

/** GET /api/partner/setup-token?token= — who the setup link is for (public). */
export const setupToken = wrap(async (req, res) => {
  const found = await svc.findValidInvite(String(req.query["token"] ?? ""));
  if (!found) {
    res.status(404).json({ success: false, error: { message: "This setup link has expired or was already used. Ask the AI Amplify team for a new one.", code: "INVITE_INVALID" } });
    return;
  }
  return { fullName: found.invite.fullName, email: found.invite.email, organisation: found.organisation };
});

// ── Public sign-up link ──────────────────────────────────────────────────────

/** GET /api/organisations/join/:code — the organisation's name for the sign-up page, or 404. */
export const joinInfo = wrap<{ code: string }>(async (req, res) => {
  const org = await svc.findJoinable(req.params.code);
  if (!org) {
    res.status(404).json({ success: false, error: { message: "This organisation link isn't active.", code: "NOT_FOUND" } });
    return;
  }
  return { name: org.name, code: org.joinCode };
});

// ── The learner's own ────────────────────────────────────────────────────────

/** POST /api/me/ai-turns — an AI answer to keep for the learner's organisation (ignored if she has none). */
export const saveTurn = wrap(async (req) => ({
  saved: await recordTurn(req.user!.userId, req.body as { surface: string; messageId: string; question?: string | null; answer: string }),
}));

export const mine = wrap((req) => svc.myOrganisation(req.user!.userId));
export const leave = wrap(async (req) => {
  await svc.leaveOrganisation(req.user!.userId);
  return { ok: true };
});
