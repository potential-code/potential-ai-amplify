# Testing the AI Learning Path UI

Quick steps to click through `/dashboard/learning`.

## 1. Prereqs (must be running)

| Service | Port | Start |
|--------|------|-------|
| Postgres | 5432 | already up (DB `smeep`) |
| Redis | 6379 | needed by Ai |
| potential-Ai | 8000 | `cd ../potential-Ai && PORT=8000 bun src/index.ts` |
| smeep server | 5000 | `npm run dev:server` |
| smeep client | 3000 | `cd client && npm run dev` (or `npm run dev` from root) |

Setup data (themes + questions) is already populated — **setupVersion 3, 15 themes, 8 questions**. No need to re-run setup unless you change the catalog.

## 2. Log in

Open http://localhost:3000, log in as a normal user.
- Admin (`admin@email.com`) **already has an active path** from testing → goes straight to the chat, skipping the questionnaire.
- To test the **questionnaire → generate** flow, use a user with **no path yet** (any other account).

## 3. Flow to test

1. Sidebar → **Learning Path** (`/dashboard/learning`).
2. **No path yet** → questionnaire form (8 questions: single / multi / scale / text). Answer + submit.
3. **Generating** — the path covers all 15 themes; first generation takes **~5–6 min** (real gpt-5 over the whole catalog). The form waits; don't close the tab.
4. **Chat loads** (Sana-style). Try:
   - "Show me my milestones" → `showMilestones` cards (15 milestones, progress %).
   - Open a milestone → ordered blocks with ✓ on completed.
   - Open a block → content renders inline (text / video / image).
   - A **question block** → answer it in-chat (`ChatQuestionBlock`), then it marks complete.
   - "Mark complete" → block flips to ✓ (writes real block progress + auto-enrolls the course).
   - "Open the course page" → deep-links to the old course page for that block.

## 4. What to verify

- Milestones cover all themes, ordered.
- Block content matches the old course pages.
- Completing a block in chat persists (refresh → still ✓) and shows on the normal Courses pages too (dual-sync).
- Question blocks accept answers.

## Notes

- **Path gen is slow** (~6 min) only because it's the full 2027-block catalog. Subsequent chat is fast.
- **Reset a user's path** to re-test the questionnaire (psql):
  ```sql
  update user_learning_path set status='archived' where user_id='<uuid>';
  delete from user_questionnaire_answers where user_id='<uuid>';
  ```
- **Regenerate themes/questions** (admin) if the catalog changes:
  `POST /api/lms/learning/setup/regenerate` (admin JWT). Optional body `{"maxCourses":2}` for a fast subset.
- Chat uses the existing `chatbot` agent with a learning-path system prompt + seeded `__learning_path__` context — no separate agent.
