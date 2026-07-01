# AI-Curated Learning Path — Implementation Plan

Branch: `feat/ai-learning-path` in both repos (branched off `feat/business-tools-subgraph`).

## Goal
Keep existing courses untouched. Add an AI-curated learning experience:
1. **One-time platform setup** — AI reads all `learningBlocks`, derives cross-course **themes** + a short **questionnaire** (≤10 questions). Stored in smeep.
2. **Per-user path** — user fills a pre-chat form, AI generates a single ordered **path covering all themes** (each theme = a milestone/"course"). Stored in smeep.
3. **Chat consumption** — a Sana-style full-page chat (reusing the existing `chatbot` graph) walks the user milestone→block; user views content + marks complete in-chat OR jumps to the old course page. Completion writes the **existing** `userLearningBlockProgress` (dual-sync), rolls up to course progress, auto-enrolls underlying courses.

## Reusability principle
The two new graphs are **stateless, platform-agnostic compute**. smeep owns all data + UI. A new platform reimplements only the smeep half (catalog adapter, persistence, renderers, form). Contract:
- Setup: `blocks[] → {themes, questions}`
- Path:  `{answers, themes, progress} → {milestones[]}`

---

## 1. Graphs (potential-Ai) — 2 NEW, consumption reuses `chatbot`

### Graph A — `learningSetup` (batch, map-reduce)
`src/graphs/learningSetup/` — mirrors the businessTools folder layout.

**Input** (from smeep, via configurable/context):
```ts
{
  blocks: { id: string; title: string; text: string; courseId: string; courseTitle: string; unitTitle: string }[]
  config?: { maxQuestions?: number /* default 8, hard cap 10 */; maxBlocksPerTheme?: number /* keep milestones short */ }
}
```
**Nodes:**
- `mapTopics` — batch blocks (by course or fixed size), each batch → candidate topics + 1-line summaries (parallel; handles scale, one-time so latency OK).
- `clusterThemes` — all candidates → cluster into themes (**no floor** on count, AI decides), assign blockIds, order within theme, cap per theme, name + describe each.
- `deriveQuestions` — from themes → ≤10 questions whose answers steer ordering/emphasis/depth.

**Output (structured/schema-validated):**
```ts
{
  themes: { tempId: string; title: string; description: string; blockIds: string[] }[]
  questions: { prompt: string; type: "single"|"multi"|"scale"|"text"; options?: string[] }[]
}
```

### Graph B — `learningPath` (one-shot, structured)
`src/graphs/learningPath/` — single node, like the businessTools subgraph but no chat loop.

**Input:**
```ts
{
  questionnaire: { questionId: string; prompt: string; answer: unknown }[]
  themes: { id: string; title: string; description: string;
            blocks: { id: string; title: string; difficulty: string; durationMins: number }[] }[]
  progress?: { blockId: string; status: string }[]
}
```
**Output:** path covering ALL themes, ordered, blocks-per-milestone capped:
```ts
{ milestones: { themeId: string; order: number; rationale: string;
                blocks: { blockId: string; order: number; reason?: string }[] }[] }
```

### Chat consumption — reuse existing `chatbot` graph (NO new graph)
The `chatbot` graph already: binds arbitrary frontend tools (`state.copilotkit.actions`), takes a frontend `systemPrompt`, is per-platform gated. Learning-path consumption is just a **mode**:
- New page = clone of `EmbeddedDashboardAssistant` → `<CopilotChat>` at the `chatbot` graph, separate thread namespace.
- System prompt = a learning-path prompt (walk milestones, call the tools below, never invent content).
- Seed the user's path as a context entry (e.g. `__learning_path__`, same mechanism as `__system_prompt__`).

### Registration & gating (Ai)
- `langgraph.json`: add `"learningSetup"` and `"learningPath"` (Studio + standalone test).
- `src/graphs/index.ts`: `getLearningSetupGraph()` / `getLearningPathGraph()` factories (compile w/ Redis checkpointer, singleton — same pattern as `getChatbotGraph`).
- `src/graphs/businessTools/access.ts` (or new `access.ts`): add `isLearningPathEnabled(platformId)` allowlist (deny-by-default), seed `"smeep"`. Setup + path endpoints gated by it.
- New routes/services (server-to-server one-shots, NOT the CopilotKit voice runtime):
  - `POST /api/learning/setup` `{ blocks, config } → { themes, questions }`
  - `POST /api/learning/path`  `{ questionnaire, themes, progress } → { milestones }`
  - both verify the service JWT → `platformId` → gate.

---

## 2. Data model (potential-smeep, Postgres / Drizzle)

Platform-scoped so it's reusable; in smeep `platformId = "smeep"`.

```ts
// learningThemes — one-time setup output (Graph A)
learningThemes = pgTable("learning_themes", {
  id, platformId, title, description, order,
  setupVersion: integer,            // bump each regenerate batch
  generatedAt: timestamp,
})

// learningThemeBlocks — theme ↔ existing block membership (powers deep-links + render + staleness)
learningThemeBlocks = pgTable("learning_theme_blocks", {
  id, themeId -> learningThemes, learningBlockId -> learningBlocks, order,
})

// learningQuestions — questionnaire (Graph A)
learningQuestions = pgTable("learning_questions", {
  id, platformId, prompt, type, options: text[].null, order, setupVersion,
})

// userQuestionnaireAnswers — submitted answers
userQuestionnaireAnswers = pgTable("user_questionnaire_answers", {
  id, userId -> users, answers: jsonb,   // { questionId: answer }
  createdAt,
})

// userLearningPath — Graph B output, stored as header + JSONB (read/regenerated as a whole)
userLearningPath = pgTable("user_learning_path", {
  id, userId -> users, platformId, status: "active"|"archived",
  basedOnSetupVersion: integer, generatedAt,
  milestones: jsonb,   // [{ themeId, order, rationale, blocks:[{ blockId, order, reason }] }]
})
```
**Progress reuses `userLearningBlockProgress`** — no new progress model. Completion rolls up to existing course progress + auto-enrolls the block's course.

---

## 3. Endpoints + UI (potential-smeep)

### Backend (`server/`)
- **Admin (regenerate setup):**
  - `POST /api/lms/learning/setup/regenerate` — gather all published `learningBlocks` → call Ai `/learning/setup` → persist `learningThemes`+`learningThemeBlocks`+`learningQuestions`, bump `setupVersion`.
  - `GET /api/lms/learning/themes` — current themes (+ block counts).
- **Learner:**
  - `GET  /api/lms/learning/questions` — questionnaire.
  - `POST /api/lms/learning/path/generate` `{ answers }` — persist answers → build Graph-B input (themes+blocks+progress) → call Ai `/learning/path` → persist `userLearningPath` → return it.
  - `GET  /api/lms/learning/path` — current path joined to block content + progress.
  - `POST /api/lms/learning/path/regenerate` — re-run form/path.
  - `POST /api/lms/learning/blocks/:blockId/complete` — dual-sync: write `userLearningBlockProgress`, **bypass course-page sequential locking**, roll up course progress, auto-enroll if needed.
  - question/assessment blocks reuse existing answer endpoints.

### Frontend (`client/`)
- New route `/dashboard/learning` + sidebar item (existing Courses pages untouched):
  - **No path yet** → pre-chat questionnaire form → `path/generate`.
  - **Has path** → full-page Sana-style chat (clone `EmbeddedDashboardAssistant`), seeded with the path context.
- **Frontend tools** (`useFrontendTool`, emitted by `chatbot` graph) — the consumption contract:
  - `showMilestones()` — render milestone/"course" cards.
  - `openMilestone(themeId)` — render that milestone's ordered blocks.
  - `displayBlock(blockId)` — render content inline (text/video/image) — reuse `CourseDetail` block renderers.
  - `submitBlockQuestion(blockId, answer)` — question blocks → existing answer tables.
  - `markBlockComplete(blockId)` — → `blocks/:id/complete` (dual-sync).
  - `openCoursePage(courseId, blockId?)` — deep-link to the old course page (per-block, since themes are cross-course).

---

## 4. Build sequence
1. **Ai:** scaffold `learningSetup` + `learningPath` graphs (+ schemas), register in `langgraph.json`, `index.ts` factories, `isLearningPathEnabled` gate, two routes/services. Verify both in LangGraph Studio with sample input.
2. **smeep:** Drizzle schema + migration (5 tables above).
3. **smeep:** admin `setup/regenerate` → Ai setup graph → persist. Run once to populate themes/questions.
4. **smeep:** questionnaire form + `path/generate` → Ai path graph → persist `userLearningPath`.
5. **smeep:** chat page (clone Sana) + learning-path system prompt + seed context + the 6 frontend tools.
6. **smeep:** `blocks/:id/complete` (dual-sync, bypass locking, auto-enroll) + question-block wiring.
7. Gating verification (both ways), sync-contract doc, polish.

## Cross-project sync contract (keep aligned)
- Ai endpoints: `POST /api/learning/setup`, `POST /api/learning/path` (service-JWT, gated by `isLearningPathEnabled`).
- Graph IO schemas above are the contract — change in lockstep.
- `platformId "smeep"` allowlisted in Ai `access.ts`.

## Open follow-ups (defaults assumed, revisit later)
- Theme **staleness** detection when catalog changes (compare `setupVersion` / block set) → prompt admin re-run.
- Whether Graph B **excludes already-completed** blocks vs includes-but-marks-done.
- i18n/locale of generated themes/questions.
- Partial-course side effect on old catalog (expected: many courses show partial progress).
