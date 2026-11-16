import { describe, it, expect } from "bun:test";
import {
  OPERATOR_ROUTES,
  OPERATOR_EXCLUDED_ROUTES,
  operatorRouteAllowed,
  priceFieldsIn,
  statusFieldsIn,
  routeShape,
} from "../auth/operatorScope";

/**
 * auth/operatorScope.ts: the method + path patterns an operator key may call
 * (what the operator MCP's AI Amplify adapter is built against), everything
 * else 403. AI Amplify leaves out more than SMEEP: anything that reaches
 * learners, prices and payment records, and invite code / organisation writes.
 */

const id = "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b";
const other = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

/** An excluded route's pattern with its params filled in. */
const concrete = (route: string): [string, string] => {
  const [method, path] = route.split(" ") as [string, string];
  let n = 0;
  return [method, path.replace(/:[A-Za-z]+/g, () => (n++ === 0 ? id : other))];
};

describe("operator route allowlist", () => {
  it("allows what the operator MCP calls", () => {
    const calls: Array<[string, string]> = [
      ["GET", "/api/admin/offers"],
      ["GET", `/api/offers/${id}`],
      ["PATCH", `/api/admin/offers/${id}`],
      ["GET", "/api/admin/announcements"],
      ["GET", "/api/admin/announcements/audience"],
      ["POST", `/api/admin/announcements/${id}/archive`],
      ["GET", "/api/live-events/admin"],
      ["GET", "/api/live-events/admin/zoom"],
      ["GET", `/api/live-events/${id}/bookings`],
      ["GET", `/api/live-events/${id}/bookings/export`],
      ["POST", `/api/live-events/${id}/zoom/resync`],
      ["GET", `/api/lms/admin/courses/${id}`],
      ["POST", "/api/lms/admin/courses"],
      ["POST", `/api/lms/admin/modules/${id}/units`],
      ["POST", `/api/lms/admin/assessments/${id}/questions/reorder`],
      ["DELETE", `/api/lms/admin/block-questions/${id}`],
      ["GET", "/api/lms/cod/admin/learners"],
      ["POST", `/api/lms/learning/admin/learners/${id}/regenerate-path`],
      ["POST", `/api/lms/both/admin/learners/${id}/reset`],
      ["POST", "/api/lms/learning/admin/regenerate-all"],
      ["GET", "/api/admin/organisations"],
      ["GET", `/api/admin/organisations/${id}/dashboard`],
      ["GET", `/api/admin/organisations/${id}/learners/${other}`],
      ["GET", `/api/admin/organisations/${id}/partners`],
      ["GET", "/api/admin/invites"],
      ["GET", "/api/admin/needs-attention"],
      ["GET", "/api/admin/mentor-applications"],
      ["GET", "/api/admin/stakeholder-applications"],
      ["GET", "/api/media"],
      ["DELETE", "/api/media"],
      ["DELETE", `/api/media/${id}`],
      ["GET", "/api/admin/ai-reports"],
      ["PATCH", `/api/admin/ai-reports/${id}`],
      ["GET", "/api/admin/analytics/stakeholder-trend-by-type"],
      ["POST", "/api/admin/ai/query"],
      ["PUT", `/api/admin/ai/dashboards/${id}`],
    ];
    for (const [method, path] of calls) expect([method, path, operatorRouteAllowed(method, path)]).toEqual([method, path, true]);
  });

  it("refuses every deliberately excluded route", () => {
    expect(OPERATOR_EXCLUDED_ROUTES.length).toBeGreaterThan(0);
    for (const [route] of OPERATOR_EXCLUDED_ROUTES) {
      const [method, path] = concrete(route);
      expect([route, operatorRouteAllowed(method, path)]).toEqual([route, false]);
    }
  });

  it("no excluded route is also in the allowlist (they never overlap)", () => {
    const allowed = new Set<string>(OPERATOR_ROUTES);
    for (const [route] of OPERATOR_EXCLUDED_ROUTES) expect([route, allowed.has(route)]).toEqual([route, false]);
  });

  it("refuses anything that sends to learners", () => {
    const calls: Array<[string, string]> = [
      ["POST", "/api/admin/announcements"],
      ["POST", "/api/live-events"],
      ["PATCH", `/api/live-events/${id}`],
      ["DELETE", `/api/live-events/${id}`],
      ["POST", `/api/admin/organisations/${id}/learners`],
      ["POST", "/api/newsletter/subscribe"],
      ["POST", "/api/me/notifications/read-all"],
      ["POST", "/api/ai-tools/generate-pdf"],
    ];
    for (const [method, path] of calls) expect([method, path, operatorRouteAllowed(method, path)]).toEqual([method, path, false]);
  });

  it("refuses price and payment changes", () => {
    const calls: Array<[string, string]> = [
      ["POST", "/api/admin/offers"],
      ["DELETE", `/api/admin/offers/${id}`],
      ["POST", `/api/offers/${id}/payment-intent`],
      ["POST", `/api/offers/${id}/complete`],
    ];
    for (const [method, path] of calls) expect([method, path, operatorRouteAllowed(method, path)]).toEqual([method, path, false]);
  });

  it("refuses invite code and organisation writes (reading them stays)", () => {
    const calls: Array<[string, string]> = [
      ["POST", "/api/admin/invites"],
      ["POST", "/api/admin/organisations"],
      ["PATCH", `/api/admin/organisations/${id}`],
      ["DELETE", `/api/admin/organisations/${id}`],
      ["POST", `/api/admin/organisations/${id}/join-code`],
      ["DELETE", `/api/admin/organisations/${id}/learners/${other}`],
      ["DELETE", `/api/admin/organisations/${id}/partners/${other}`],
      ["DELETE", `/api/admin/organisations/${id}/invites/${other}`],
    ];
    for (const [method, path] of calls) expect([method, path, operatorRouteAllowed(method, path)]).toEqual([method, path, false]);
  });

  it("refuses admin routes the operator MCP does not call", () => {
    const calls: Array<[string, string]> = [
      ["GET", "/api/admin/exports/learners"],
      ["GET", `/api/admin/organisations/${id}/exports/learners`],
      ["POST", "/api/admin/ai/report"],
      ["POST", "/api/lms/admin/quiz/generate"],
      ["POST", "/api/media/upload"],
      ["GET", `/api/live-events/${id}/zoom/start-url`],
      // Anything that hands out a login: the key would pick who gets it.
      ["POST", `/api/admin/organisations/${id}/partners`],
      ["POST", `/api/admin/mentor-applications/${id}/approve`],
      ["POST", `/api/admin/mentor-applications/${id}/reject`],
      // Learner, partner and account routes.
      ["GET", "/api/me/streak"],
      ["GET", "/api/account/me"],
      ["POST", "/api/account/set-password"],
      ["GET", "/api/partner/dashboard"],
    ];
    for (const [method, path] of calls) expect([method, path, operatorRouteAllowed(method, path)]).toEqual([method, path, false]);
  });

  it("matches the method, not just the path", () => {
    expect(operatorRouteAllowed("GET", `/api/admin/offers/${id}`)).toBe(false);
    expect(operatorRouteAllowed("DELETE", "/api/admin/offers")).toBe(false);
    expect(operatorRouteAllowed("HEAD", "/api/admin/offers")).toBe(false);
    expect(operatorRouteAllowed("get", "/api/admin/offers")).toBe(true);
  });

  it("matches whole segments only", () => {
    expect(operatorRouteAllowed("GET", "/api/admin/offers/")).toBe(true); // Express's optional trailing slash
    expect(operatorRouteAllowed("GET", "/api/admin/offersx")).toBe(false);
    expect(operatorRouteAllowed("GET", "/api/admin/offers/extra")).toBe(false);
    expect(operatorRouteAllowed("PATCH", `/api/admin/offers/${id}/more`)).toBe(false);
    expect(operatorRouteAllowed("PATCH", "/api/admin/offers//")).toBe(false);
    expect(operatorRouteAllowed("GET", "/API/ADMIN/OFFERS")).toBe(true); // Express routes case-insensitively
  });

  it("every entry is a METHOD and an /api/ path", () => {
    for (const entry of OPERATOR_ROUTES) expect(entry).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/api\/[a-zA-Z0-9/:_-]+$/);
    for (const [entry] of OPERATOR_EXCLUDED_ROUTES) expect(entry).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/api\/[a-zA-Z0-9/:_-]+$/);
    expect(new Set(OPERATOR_ROUTES).size).toBe(OPERATOR_ROUTES.length);
  });

  it("the doc's allowed-route table lists exactly OPERATOR_ROUTES, and its exclusions every excluded route", async () => {
    const doc = await Bun.file(new URL("../docs/operator-access.md", import.meta.url)).text();
    const allowedSection = doc.split("## Allowed routes")[1]!.split("\n## ")[0]!;
    const excludedSection = doc.split("## Deliberately excluded routes")[1]!.split("\n## ")[0]!;
    const rows = (section: string) =>
      [...section.matchAll(/^\| `(GET|POST|PUT|PATCH|DELETE)` \| `([^`]+)` \|/gm)].map((m) => `${m[1]} ${m[2]}`);
    expect(rows(allowedSection).sort()).toEqual([...OPERATOR_ROUTES].sort());
    expect(rows(excludedSection).sort()).toEqual(OPERATOR_EXCLUDED_ROUTES.map(([r]) => r).sort());
  });
});

describe("price fields on offer edits", () => {
  it("finds price, priceLabel, priceBefore and pointsCost, whatever their case", () => {
    expect(priceFieldsIn({ title: "x", price: 1, priceLabel: "a", priceBefore: "b", pointsCost: 2 })).toEqual([
      "price",
      "priceLabel",
      "priceBefore",
      "pointsCost",
    ]);
    expect(priceFieldsIn({ PRICE: 1, pointscost: 1 })).toEqual(["PRICE", "pointscost"]);
  });

  it("finds none in other fields or bodies that aren't objects", () => {
    expect(priceFieldsIn({ title: "x", category: "AI", imageUrl: "/a.png", status: "draft" })).toEqual([]);
    expect(priceFieldsIn(null)).toEqual([]);
    expect(priceFieldsIn("price")).toEqual([]);
    expect(priceFieldsIn([{ price: 1 }])).toEqual([]);
  });
});

describe("status on offer edits (publish / unpublish)", () => {
  it("finds status, whatever its case", () => {
    expect(statusFieldsIn({ title: "x", status: "published" })).toEqual(["status"]);
    expect(statusFieldsIn({ Status: "draft", STATUS: "published" })).toEqual(["Status", "STATUS"]);
  });

  it("finds none in other fields or bodies that aren't objects", () => {
    expect(statusFieldsIn({ title: "x", category: "AI", imageUrl: "/a.png", price: 1 })).toEqual([]);
    expect(statusFieldsIn(null)).toEqual([]);
    expect(statusFieldsIn("status")).toEqual([]);
    expect(statusFieldsIn([{ status: "published" }])).toEqual([]);
  });
});

describe("route shape for logs", () => {
  it("keeps word segments and replaces ids, emails and anything else with :param", () => {
    expect(routeShape(`/api/admin/organisations/${id}/exports/learners`)).toBe("/api/admin/organisations/:param/exports/learners");
    expect(routeShape("/api/admin/users/someone@example.com")).toBe("/api/admin/users/:param");
    expect(routeShape("/api/admin/x/12345/john%20smith")).toBe("/api/admin/x/:param/:param");
  });
});
