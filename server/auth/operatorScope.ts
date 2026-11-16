import type { Request, Response, NextFunction } from "express";

// What an operator key may call. An operator key acts as an admin, but only
// on the method + path patterns below: the endpoints the operator MCP
// (potential-ai, the AI Amplify adapter) is built against. Anything else
// answers 403 for a key; admin sessions (cookies) are not affected. The same
// list, with the reasons for what is left out, is in docs/operator-access.md.
//
// KEEP IN STEP WITH THE OPERATOR MCP AND THE DOC: when the MCP adds or changes
// an AI Amplify tool, add its method and path here (and to the doc's table) in
// the same change, or the tool gets a 403. Patterns use Express syntax;
// ":name" matches one path segment.
//
// AI Amplify is a paid, invite-only client programme, and learner messages
// stay off until the client signs off (LEARNER_NOTIFICATIONS_ENABLED). So,
// beyond what SMEEP leaves out, a key here can't:
//   - send anything to learners: announcements (POST /api/admin/announcements),
//     live event create/edit/delete (a new event or replay goes to every
//     learner's bell; a new time or a cancellation to everyone booked), adding
//     learners to an organisation (tells them in the bell);
//   - change prices, what is on sale, or payment records: creating an offer (a
//     price is required), deleting one (its redemptions, the order and payment
//     records, go with it), or any price field or the status on an offer edit
//     (publishing a paid offer puts it on sale through Stripe; see
//     refuseOperatorOfferChanges below; the route stays for title, category
//     and image);
//   - create or change invite codes or organisations (join codes, sign-up
//     links, partner invites, membership): Maya asks her Lead for these.
//   - see a live invite code or organisation sign-up code: on AI Amplify the
//     invite code is the login. The invite list, the needs-attention panel,
//     the organisations list and an organisation's dashboard still answer
//     (counts, status, organisation, dates), with every code and sign-up link
//     left out for a key (inviteWithoutCode, needsAttentionWithoutCodes in
//     controllers/admin.controller.ts; withoutJoinCode in
//     controllers/organisations.controller.ts).
// And, as on SMEEP, a key can never hand out a login (partner invites, mentor
// application approve/reject), and has no bulk exports, AI report download,
// AI generation, uploads, Zoom host links, or learner, mentor, partner or
// account routes.
export const OPERATOR_ROUTES = [
  // Offers (read; edit title, category and image: no price fields, no status)
  "GET /api/admin/offers",
  "GET /api/offers/:id",
  "PATCH /api/admin/offers/:id",

  // Announcements (read; take a banner down)
  "GET /api/admin/announcements",
  "GET /api/admin/announcements/audience",
  "POST /api/admin/announcements/:id/archive",

  // Live events (read, bookings, Zoom re-sync; Zoom's own registrant emails are off)
  "GET /api/live-events/admin",
  "GET /api/live-events/admin/zoom",
  "GET /api/live-events/:id/bookings",
  "GET /api/live-events/:id/bookings/export", // bookers' names and emails, as CSV (audited)
  "POST /api/live-events/:id/zoom/resync",

  // Courses (LMS authoring)
  "GET /api/lms/admin/courses",
  "GET /api/lms/admin/courses/:id",
  "POST /api/lms/admin/courses",
  "PATCH /api/lms/admin/courses/:id",
  "DELETE /api/lms/admin/courses/:id",
  "POST /api/lms/admin/courses/:id/modules",
  "POST /api/lms/admin/courses/:id/modules/reorder",
  "POST /api/lms/admin/courses/:id/assessments",
  "PATCH /api/lms/admin/modules/:id",
  "DELETE /api/lms/admin/modules/:id",
  "POST /api/lms/admin/modules/:id/units",
  "POST /api/lms/admin/modules/:id/units/reorder",
  "PATCH /api/lms/admin/units/:id",
  "DELETE /api/lms/admin/units/:id",
  "POST /api/lms/admin/units/:id/blocks",
  "POST /api/lms/admin/units/:id/blocks/reorder",
  "PATCH /api/lms/admin/blocks/:id",
  "DELETE /api/lms/admin/blocks/:id",
  "POST /api/lms/admin/blocks/:id/questions",
  "POST /api/lms/admin/blocks/:id/questions/reorder",
  "PATCH /api/lms/admin/block-questions/:id",
  "DELETE /api/lms/admin/block-questions/:id",
  "PATCH /api/lms/admin/assessments/:id",
  "DELETE /api/lms/admin/assessments/:id",
  "POST /api/lms/admin/assessments/:id/questions",
  "POST /api/lms/admin/assessments/:id/questions/reorder",
  "PATCH /api/lms/admin/assessment-questions/:id",
  "DELETE /api/lms/admin/assessment-questions/:id",

  // Learning journeys
  "GET /api/lms/learning/admin/learners",
  "GET /api/lms/cod/admin/learners",
  "GET /api/lms/both/admin/learners",
  "GET /api/lms/learning/themes",
  "POST /api/lms/learning/admin/learners/:userId/reset-progress",
  "POST /api/lms/learning/admin/learners/:userId/reset-path",
  "POST /api/lms/learning/admin/learners/:userId/regenerate-path",
  "POST /api/lms/cod/admin/learners/:userId/reset",
  "POST /api/lms/both/admin/learners/:userId/reset",
  "POST /api/lms/learning/setup/regenerate",
  "POST /api/lms/learning/admin/regenerate-all", // wipes every learner's path (MCP: approval tool)

  // Organisations (read only; join codes and sign-up links left out for a key)
  "GET /api/admin/organisations",
  "GET /api/admin/organisations/:id/dashboard",
  "GET /api/admin/organisations/:id/learners/:userId",
  "GET /api/admin/organisations/:id/partners", // without partner setup links for a key

  // People: invites and applications (read only; invite codes and links left out for a key)
  "GET /api/admin/needs-attention",
  "GET /api/admin/invites",
  "GET /api/admin/mentor-applications",
  "GET /api/admin/stakeholder-applications",

  // Media library and AI safety reports
  "GET /api/media",
  "DELETE /api/media",
  "DELETE /api/media/:id",
  "GET /api/admin/ai-reports",
  "PATCH /api/admin/ai-reports/:id",

  // Analytics
  "GET /api/admin/stats",
  "GET /api/admin/analytics/impact",
  "GET /api/admin/analytics/learning-gain",
  "GET /api/admin/analytics/insights",
  "GET /api/admin/analytics/kpi-overview",
  "GET /api/admin/analytics/user-growth",
  "GET /api/admin/analytics/enrollments",
  "GET /api/admin/analytics/course-engagement",
  "GET /api/admin/analytics/course-completion",
  "GET /api/admin/analytics/course-performance",
  "GET /api/admin/analytics/stakeholder-kpis",
  "GET /api/admin/analytics/stakeholder-trend",
  "GET /api/admin/analytics/stakeholder-trend-by-type",

  // AI analytics: the pseudonymised ai.* views (SELECT-only, guarded server-side) and saved boards
  "GET /api/admin/ai/catalog",
  "POST /api/admin/ai/query",
  "GET /api/admin/ai/dashboards",
  "GET /api/admin/ai/dashboards/:id",
  "POST /api/admin/ai/dashboards",
  "PUT /api/admin/ai/dashboards/:id",
  "DELETE /api/admin/ai/dashboards/:id",
] as const;

/**
 * Admin routes deliberately left out of OPERATOR_ROUTES, with the reason.
 * Tests prove each answers 403 for a key; docs/operator-access.md lists them.
 * Do not add any of these to OPERATOR_ROUTES without the client's and the
 * CEO's say-so.
 */
export const OPERATOR_EXCLUDED_ROUTES: ReadonlyArray<readonly [route: string, reason: string]> = [
  // Sends to learners (learner messages stay off until the client signs off)
  ["POST /api/admin/announcements", "sends a banner, bell notification and email to a whole audience"],
  ["POST /api/live-events", "a published event notifies every learner (bell)"],
  ["PATCH /api/live-events/:id", "a new time notifies everyone booked; publishing or adding a replay notifies every learner"],
  ["DELETE /api/live-events/:id", "a cancellation notifies everyone booked"],
  ["POST /api/admin/organisations/:id/learners", "adding learners tells each of them in the bell"],
  // Prices and payment records
  ["POST /api/admin/offers", "an offer can't be created without setting its price"],
  ["DELETE /api/admin/offers/:id", "deletes the offer's redemptions (order and payment records) with it"],
  // Invite codes and organisations: Maya asks her Lead
  ["POST /api/admin/invites", "creates an invite code (programme access)"],
  ["POST /api/admin/organisations", "creates an organisation"],
  ["PATCH /api/admin/organisations/:id", "renames an organisation or turns its sign-up link on or off"],
  ["DELETE /api/admin/organisations/:id", "archives an organisation"],
  ["POST /api/admin/organisations/:id/join-code", "issues a new organisation sign-up link"],
  ["DELETE /api/admin/organisations/:id/learners/:userId", "changes organisation membership"],
  ["DELETE /api/admin/organisations/:id/partners/:userId", "changes organisation membership"],
  ["DELETE /api/admin/organisations/:id/invites/:inviteId", "changes a partner invite"],
  // Hands out a login (the key would choose who gets it)
  ["POST /api/admin/organisations/:id/partners", "emails a partner setup link to any address the caller names"],
  ["POST /api/admin/mentor-applications/:id/approve", "creates a mentor login and emails its setup link"],
  ["POST /api/admin/mentor-applications/:id/reject", "the other half of the approval decision"],
  // Bulk data, generation, uploads, host links
  ["GET /api/admin/exports/:dataset", "bulk export of learner data"],
  ["GET /api/admin/organisations/:id/exports/:dataset", "bulk export of an organisation's learner data"],
  ["POST /api/admin/ai/report", "AI report download (bulk export)"],
  ["POST /api/lms/admin/quiz/generate", "AI generation (cost)"],
  ["POST /api/media/upload", "file upload"],
  ["GET /api/live-events/:id/zoom/start-url", "the Zoom host link starts the meeting as host"],
];

interface CompiledRoute {
  method: string;
  pattern: RegExp;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(entry: string): CompiledRoute {
  const [method, path] = entry.split(" ") as [string, string];
  const source = path
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "[^/]+" : escape(seg)))
    .join("/");
  // Case-insensitive with an optional trailing slash, as Express routes.
  return { method, pattern: new RegExp(`^${source}/?$`, "i") };
}

const COMPILED: readonly CompiledRoute[] = OPERATOR_ROUTES.map(compile);

/**
 * True when an operator key may call `method` on `pathname`. `pathname` must
 * be the normalised request path (no query string, no host), see
 * operatorKeys.requestPathname.
 */
export function operatorRouteAllowed(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  return COMPILED.some((route) => route.method === m && route.pattern.test(pathname));
}

/** True when the request came with an operator key (Maya), not an admin session. */
export const viaOperatorKey = (req: Pick<Request, "user">): boolean => req.user?.via === "operator_key";

/**
 * The path with anything but plain word segments replaced by ":param", for
 * logs: ids, emails and names in a path never reach the log line.
 */
export function routeShape(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) => (seg === "" || /^[a-z][a-z-]{0,39}$/i.test(seg) ? seg : ":param"))
    .join("/");
}

/**
 * Offer fields that set what a learner pays: priceLabel, priceBefore, price
 * (USD cents) and pointsCost. Matched on the raw body's field names, whatever
 * their case, before validation.
 */
const PRICE_FIELD = /price|pointscost/i;

/**
 * The offer's status ("published" | "draft"): publishing a paid offer puts it
 * on sale (learners can buy it through Stripe), unpublishing takes it off. Any
 * field name containing "status", whatever its case, as for prices.
 */
const STATUS_FIELD = /status/i;

const fieldsIn = (body: unknown, pattern: RegExp): string[] =>
  !body || typeof body !== "object" || Array.isArray(body) ? [] : Object.keys(body).filter((k) => pattern.test(k));

/** The price fields present in a request body (empty for none, or a body that isn't an object). */
export function priceFieldsIn(body: unknown): string[] {
  return fieldsIn(body, PRICE_FIELD);
}

/** The status fields present in a request body (empty for none, or a body that isn't an object). */
export function statusFieldsIn(body: unknown): string[] {
  return fieldsIn(body, STATUS_FIELD);
}

/**
 * Refuses an offer create or edit that touches a price or the offer's status
 * (publish / unpublish) when it comes with an operator key: Maya never changes
 * what a learner pays or whether an offer is on sale. 403, nothing changes,
 * and the audit log records the refusal with the fields tried. Admin sessions
 * pass straight through. Must come after authenticate() and before validate().
 */
export function refuseOperatorOfferChanges(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.via === "operator_key") {
    const prices = priceFieldsIn(req.body);
    const statuses = statusFieldsIn(req.body);
    if (prices.length || statuses.length) {
      const fields = [...prices, ...statuses];
      const what = [prices.length ? "price fields" : "", statuses.length ? "status" : ""].filter(Boolean).join(" and ");
      console.warn(`[operator-scope] refused ${req.method} ${routeShape((req.originalUrl || req.url || "").split("?")[0]!)} for operator key "${req.user.keyLabel ?? ""}": ${what} (${fields.join(", ")})`);
      const message = prices.length
        ? "The operator key may not change prices. Ask an admin to change the price."
        : "The operator key may not publish or unpublish an offer. Ask an admin to change its status.";
      res.status(403).json({ success: false, error: { message, code: "FORBIDDEN" } });
      return;
    }
  }
  next();
}
