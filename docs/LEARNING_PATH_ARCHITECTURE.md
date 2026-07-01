# AI Personalized Learning Path — Architecture

How the personalized learning path is built and consumed. It's built on **two
stateless AI graphs** (on the potential-Ai service) plus the smeep DB/UI that
owns all data and the chat.

## The big picture

- **Existing courses are untouched.** A course is `Course → Module → Unit → Block`
  (a *block* = one piece of content: text, video, image, or question).
- **Graph A (`learningSetup`)** runs **once for the platform**: reads *every* block
  across all published courses and reorganizes them into **cross-course themes** +
  a short **questionnaire**.
- **Graph B (`learningPath`)** runs **per user**: takes their questionnaire answers
  and turns the themes into an ordered **path of milestones**, picking the
  **15–20 most relevant blocks per theme**.
- The **chat** (Sana) walks the user through it one block at a time; completing a
  block writes the same `userLearningBlockProgress` the normal course pages use
  (dual-sync) and auto-enrolls them in the parent course.

```mermaid
flowchart TD
    subgraph Catalog["📚 Existing LMS catalog (unchanged)"]
        C[Courses → Modules → Units → Blocks<br/>~2000 learning blocks]
    end

    subgraph GraphA["🏗️ Graph A · learningSetup (ONE-TIME, platform-wide)"]
        A1[mapTopics<br/>chunk all blocks, derive topics]
        A2[clusterThemes<br/>group into 12–18 balanced<br/>cross-course themes]
        A3[deriveQuestions<br/>≤8–10 questionnaire Qs]
        A1 --> A2 --> A3
    end

    subgraph DB["🗄️ smeep DB (owns the data)"]
        T[(learningThemes)]
        TB[(learningThemeBlocks<br/>theme ↔ block map)]
        Q[(learningQuestions)]
    end

    subgraph GraphB["🧭 Graph B · learningPath (PER USER)"]
        B1[Stage 1 · orderThemes<br/>sequence themes → milestones]
        B2[Stage 2 · orderBlocks<br/>per theme: SELECT 15–20<br/>most relevant blocks, ordered]
        B1 --> B2
    end

    subgraph Chat["💬 Chat consumption (Sana)"]
        U1[Conversational questionnaire]
        U2[Pick a course/milestone]
        U3[Blocks delivered one-by-one<br/>Mark Complete / auto-complete]
    end

    C --> A1
    A2 --> T
    A2 --> TB
    A3 --> Q
    U1 -->|answers| GraphB
    T --> B1
    TB --> B2
    Q --> U1
    B2 --> P[("userLearningPath<br/>milestones[] + selected blocks")]
    P --> U2 --> U3
    U3 -->|completeBlock| PR[(userLearningBlockProgress<br/>+ course enrollment roll-up)]
```

## How blocks get allocated to a path

Blocks flow **catalog → theme → per-user milestone**:

```mermaid
flowchart LR
    subgraph Step1["1 Setup: every block → exactly one theme"]
        direction TB
        BA[Block: 'Cash flow basics'<br/>from Course X]
        BB[Block: 'Pricing 101'<br/>from Course Y]
        BC[Block: 'Reading a P&L'<br/>from Course Z]
        BA --> TH[Theme: 'Financial Foundations'<br/>e.g. 60 blocks pooled<br/>across many courses]
        BB --> TH
        BC --> TH
    end

    subgraph Step2["2 Path-gen: pick the best 15–20 for THIS user"]
        direction TB
        TH2[Theme's full block pool<br/>~60 candidates]
        Q2{Questionnaire<br/>answers + goals}
        SEL[orderBlocks: rank by relevance<br/>keep completed, cap 15–20,<br/>backfill to ≥15, drop the rest]
        TH2 --> SEL
        Q2 --> SEL
        SEL --> MS[Milestone 'Financial Foundations'<br/>18 ordered blocks]
    end

    TH -.same theme.-> TH2
    MS --> PATH[Ordered path:<br/>Milestone 1 → 2 → 3 → …<br/>each = one theme = one 'course']
```

**Key rules in the allocation:**

| Stage | What happens | Guardrails |
|---|---|---|
| **Setup → theme** | `clusterThemes` assigns each block to one cross-course theme; consolidated to **12–18 balanced** themes | Final block IDs intersected against real `learning_blocks` (drops AI hallucinations) |
| **Theme → milestone order** | `orderThemes` sequences themes using the questionnaire (one cheap call) | Every theme appears exactly once; missing ones appended |
| **Block selection (per theme)** | `orderBlocks` picks the **15–20 most relevant** blocks to the theme/user and orders them | Hard cap 20; backfill to `min(15, available)`; **completed blocks always kept**; hallucinated IDs filtered |

So a theme might pool ~60 blocks from several courses, but a given learner's
milestone only carries the **15–20 most accurate** for them — that's the
"we don't use all the blocks" behavior.

## At runtime in the chat

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Learning chat (Sana)
    participant AI as chatbot graph
    participant API as smeep API/DB

    U->>UI: Pick a course (milestone)
    UI->>AI: openMilestone(themeId) + full course content as context
    AI-->>UI: render first block (one at a time)
    Note over UI: video → Mark Complete locked until it ends<br/>question → auto-completes on submit
    U->>UI: Mark Complete
    UI->>API: completeBlock(blockId)
    API-->>API: write userLearningBlockProgress<br/>+ roll up unit/module/course + auto-enroll
    UI->>AI: advance → displayBlock(nextId)
    AI-->>UI: render next block
    U->>UI: Ask a question
    AI-->>U: infer from __current_course__ content,<br/>guide (don't just answer)
```

Two things worth highlighting:

- **Dual-sync:** completing a block in chat writes the exact same progress table as
  the normal course pages, so progress is consistent both ways and the parent
  course auto-enrolls.
- **Grounded guidance:** when a course is opened, its full block content is fed to
  the AI (`__current_course__`), so course-related questions are answered *from the
  real material* and used to guide the learner rather than hand over answers.

## Where things live

| Concern | Location |
|---|---|
| Graph A (`learningSetup`) | `potential-Ai/src/graphs/learningSetup/graph.ts` |
| Graph B (`learningPath`) | `potential-Ai/src/graphs/learningPath/graph.ts` |
| AI client + JWT + endpoints | `potential-smeep/server/services/learning/aiClient.ts`, `learning.service.ts` |
| DB schema (themes/questions/path) | `potential-smeep/server/db/schema/learning.ts` |
| Routes/controllers | `potential-smeep/server/routes/lms.ts`, `server/controllers/learning/learning.controller.ts` |
| Questionnaire UI | `potential-smeep/client/components/dashboard/ConversationalQuestionnaire.tsx` |
| Chat consumption UI | `potential-smeep/client/components/dashboard/EmbeddedLearningAssistant.tsx` |
| Learning page | `potential-smeep/client/app/(dashboard)/dashboard/learning/page.tsx` |
