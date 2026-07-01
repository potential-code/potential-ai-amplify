# Structure Audit — potential-smeep

Date: 2026-06-18
Audited against: `basic-setup`, `backend-feature`, `frontend-ui`, `deployment` skills (canonical source of truth) + reference projects `potential-vxacademy-V2`, `goumbook-competitons`.

Decision on scope: frontend framework = **Next.js per the skills** (smeep already uses it; no Vite migration). Output = report + fix everything safe. Backend runtime deviation = flagged.

---

## Verdict

Backend is **largely conformant** (routes→controllers→services, Drizzle at root, `schema/index.ts`, Bun workspace, hoisted linker). The gaps are tooling config, stray files, naming, and a migration-artifact frontend layer. No structural rewrite needed.

| Severity | Count | Theme |
|---|---|---|
| 🔴 High | 3 | Missing lint/format tooling; API prefix; backend runtime |
| 🟡 Medium | 4 | Route file naming; ports; `views/` layer; stray files |
| 🟢 Low | 2 | Hardcoded colors; doc placement |

---

## 🔴 High

### H1. Missing lint/format/editor config — FIXED
`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.vscode/settings.json` were all absent. Both reference projects and the `basic-setup` skill mandate them. Added canonical versions + `lint`/`format` scripts and ESLint devDeps to root `package.json`.

### H2. API prefix is `/api`, skill mandates `/api/v1` — FLAGGED (not auto-changed)
`server/index.ts:74` mounts `app.use("/api", router)`. Skill (`backend-feature`) requires `/api/v1`. Blast radius: **159 client files** reference `/api/`. Recommend a single coordinated change (server mount + a client API base constant) — do NOT hand-edit 159 call sites; centralize the base URL first, then version it. Held for your sign-off — outward-facing, hard to reverse.

### H3. Backend runtime is esbuild→Node bundle, skill mandates Bun-only — FLAGGED
smeep builds `server` via `build.mjs` (esbuild) and runs the bundle on Node. The skills say "Bun only — never use Node.js-specific APIs"; `vxacademy` runs `bun run server/index.ts` directly. Recommend dropping the esbuild step and running Bun directly (simpler, matches reference). Held: touches Dockerfile + entrypoint + deploy, verify nothing relies on the bundle.

---

## 🟡 Medium

### M1. Route files miss `.routes.ts` suffix — FIXED
`server/routes/` had `auth.ts`, `admin.ts`, `lms.ts`, etc. — controllers/services already use `.controller.ts`/`.service.ts`, so routes were inconsistent. Renamed all 11 to `<domain>.routes.ts` and updated `routes/index.ts` imports.

### M2. Ports diverge from convention — FLAGGED
Actual: server **5000**, client **3000**. Skill + `vxacademy`: server **8000**, client **5000**. Changing touches `.env.example`, `NEXT_PUBLIC_API_URL`, both docker-compose files, and Dockerfiles. Recommend aligning to 8000/5000 but held for sign-off to avoid breaking the running stack.

### M3. `client/views/` layer is non-canonical — FLAGGED (kept, it's live)
36 view components wrapped by thin `app/**/page.tsx` files (21+ imports). This is a Vite→Next migration artifact: the skill wants page logic directly in App Router pages, not an intermediate `views/` layer. It works, so left in place. Recommend incrementally inlining each `views/X.tsx` into its `page.tsx` and deleting `views/` over time. Not auto-refactored (36 files, behavior-risk).

### M4. Stray files in repo root — FIXED
- `InteractiveLearningPage.tsx` — dead duplicate (0 imports; real impl at `app/(dashboard)/dashboard/learning/page.tsx`). **Deleted.**
- `AI_LEARNING_PATH_PLAN.md`, `LEARNING_PATH_ARCHITECTURE.md`, `LEARNING_UI_TEST.md` — moved to `docs/`.

---

## 🟢 Low

### L1. ~20% hardcoded Tailwind colors
Project uses a custom `brand-*` token system (good, ~80% adherence) but legacy `emerald-*`/`amber-*`/`rose-*` literals remain in difficulty badges and gradients. Sweep into brand tokens opportunistically.

### L2. No tests / CI
Neither reference project has tests either, so not a deviation from your norm — but worth noting as a gap relative to a mature setup. `goumbook` has Vitest wired in root scripts; consider adopting that pattern.

---

## What was changed in this pass
- Added: `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.vscode/settings.json`
- Updated: root `package.json` (lint/format scripts + ESLint devDeps)
- Renamed: `server/routes/*.ts` → `*.routes.ts` (+ import fixups)
- Moved: 3 learning docs → `docs/`
- Deleted: dead `InteractiveLearningPage.tsx`

## What needs your sign-off (not changed)
- H2 API prefix `/api` → `/api/v1`
- H3 esbuild→Bun runtime
- M2 ports 5000/3000 → 8000/5000
- M3 collapse `views/` into App Router pages
