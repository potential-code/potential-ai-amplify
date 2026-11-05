import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  courseEnrollments,
  courses,
  examinerAttempts,
  learningBlocks,
  modules,
  units,
  userCourseProgress,
  users,
} from '../db/schema';
import { AppError } from '../utils/app-error';
import { checkBadgesSoon } from './achievements.service';
import { getAiBaseUrl, mintServiceToken } from './learning/aiClient';

/**
 * Anam.ai integration: session tokens for the AI Examiner avatar flow.
 *
 * The avatar runs in CUSTOMER_CLIENT_V1 ("custom LLM") mode, meaning Anam only
 * renders the face and voice — the conversation itself is driven client-side by
 * the Potential.com examiner bot. This service exists purely because minting a
 * session token requires ANAM_API_KEY, which must never reach the browser.
 */

const ANAM_API_URL = process.env['ANAM_API_URL'] ?? 'https://api.anam.ai';

export interface AnamSessionTokenOptions {
  apiKey: string;
  avatarId: string;
  voiceId: string;
  name?: string;
}

/**
 * Creates an Anam session token for client-side custom-LLM (avatar) mode.
 *
 * @param options - Anam credentials plus the persona name shown by the SDK.
 * @returns       - The short-lived session token for `@anam-ai/js-sdk`.
 */
export async function createAnamSessionToken(
  options: AnamSessionTokenOptions,
): Promise<{ sessionToken: string }> {
  const { apiKey, avatarId, voiceId, name = 'AI Examiner' } = options;

  if (!apiKey.trim()) throw new AppError('ANAM_API_KEY is required', 503, 'ANAM_NOT_CONFIGURED');
  if (!avatarId.trim()) throw new AppError('ANAM_AVATAR_ID is required', 503, 'ANAM_NOT_CONFIGURED');
  if (!voiceId.trim()) throw new AppError('ANAM_VOICE_ID is required', 503, 'ANAM_NOT_CONFIGURED');

  let response: globalThis.Response;
  try {
    response = await fetch(`${ANAM_API_URL}/v1/auth/session-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personaConfig: { name, avatarId, voiceId, llmId: 'CUSTOMER_CLIENT_V1' },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError('Failed to reach Anam', 502, 'ANAM_UNREACHABLE');
  }

  if (!response.ok) {
    const errBody = await response.text();
    let message = `Anam session token failed: ${response.status}`;
    try {
      const parsed = JSON.parse(errBody) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      if (errBody) message = errBody.slice(0, 200);
    }
    throw new AppError(message, 502, 'ANAM_REQUEST_FAILED');
  }

  const data = (await response.json()) as { sessionToken?: string };
  if (!data.sessionToken) {
    throw new AppError('Anam did not return a session token', 502, 'ANAM_BAD_RESPONSE');
  }

  return { sessionToken: data.sessionToken };
}

// ---------------------------------------------------------------------------
// Course-grounded exam (Anna as examiner, smeepExaminer agent)
// ---------------------------------------------------------------------------

/** Who is being examined — what the page sends the agent as __examiner_learner__. */
export async function getExamineeProfile(userId: string) {
  const [row] = await db
    .select({ fullName: users.fullName, company: users.company, country: users.country, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  return {
    firstName: (row.fullName ?? '').split(' ')[0] || 'there',
    fullName: row.fullName,
    company: row.company ?? null,
    country: row.country ?? null,
    role: row.role === 'sme' ? 'Small business owner' : row.role,
    // Video exams need an Anam avatar for Anna; without one the mode is hidden.
    videoAvailable: isAnamConfigured(),
  };
}

/** Whether video exams can run here: an Anam key, avatar and voice are all set. */
export function isAnamConfigured(): boolean {
  return ['ANAM_API_KEY', 'ANAM_AVATAR_ID', 'ANAM_VOICE_ID'].every((k) => (process.env[k] ?? '').trim().length > 0);
}

/** Published courses the learner is enrolled in, with their studied %. */
export async function listExaminableCourses(userId: string) {
  const rows = await db
    .select({
      courseId: courses.id,
      title: courses.title,
      difficulty: courses.difficulty,
      cover: courses.cover,
      category: courses.category,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(and(eq(courseEnrollments.userId, userId), eq(courses.status, 'published')));

  const ids = rows.map((r) => r.courseId);
  const progress = ids.length
    ? await db
        .select({ courseId: userCourseProgress.courseId, pct: userCourseProgress.progressPercentage })
        .from(userCourseProgress)
        .where(and(eq(userCourseProgress.userId, userId), inArray(userCourseProgress.courseId, ids)))
    : [];
  const pctOf = new Map(progress.map((p) => [p.courseId, p.pct]));

  return rows
    .map((r) => ({ ...r, progressPercentage: pctOf.get(r.courseId) ?? 0 }))
    .sort((a, b) => b.progressPercentage - a.progressPercentage);
}

/** Per-section budget keeps one long transcript from starving the rest. */
const REFERENCE_CHAR_BUDGET = 9000;
const BLOCK_EXCERPT_CHARS = 700;

/**
 * The condensed course content the agent uses as its syllabus: module and
 * unit structure plus trimmed teaching text from each block. Assembled
 * server-side so the browser never has to ship the whole course.
 */
export async function buildCourseReference(userId: string, courseId: string) {
  const [course] = await db
    .select({ id: courses.id, title: courses.title, difficulty: courses.difficulty, status: courses.status })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course || course.status !== 'published') throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  const [enrollment] = await db
    .select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
    .limit(1);
  if (!enrollment) throw new AppError('Not enrolled in this course', 403, 'NOT_ENROLLED');

  const mods = await db
    .select({ id: modules.id, title: modules.title, order: modules.order })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.order));
  const modIds = mods.map((m) => m.id);
  const unitRows = modIds.length
    ? await db
        .select({ id: units.id, moduleId: units.moduleId, title: units.title, order: units.order })
        .from(units)
        .where(inArray(units.moduleId, modIds))
        .orderBy(asc(units.order))
    : [];
  const unitIds = unitRows.map((u) => u.id);
  const blocks = unitIds.length
    ? await db
        .select({
          unitId: learningBlocks.unitId,
          title: learningBlocks.title,
          type: learningBlocks.type,
          body: learningBlocks.body,
          transcript: learningBlocks.transcript,
          order: learningBlocks.order,
        })
        .from(learningBlocks)
        .where(inArray(learningBlocks.unitId, unitIds))
        .orderBy(asc(learningBlocks.order))
    : [];

  const byUnit = new Map<string, typeof blocks>();
  for (const b of blocks) {
    const list = byUnit.get(b.unitId) ?? [];
    list.push(b);
    byUnit.set(b.unitId, list);
  }

  const lines: string[] = [];
  let used = 0;
  const push = (line: string) => {
    if (used + line.length > REFERENCE_CHAR_BUDGET) return false;
    lines.push(line);
    used += line.length + 1;
    return true;
  };
  outer: for (const mod of mods) {
    if (!push(`MODULE: ${mod.title}`)) break;
    for (const unit of unitRows.filter((u) => u.moduleId === mod.id)) {
      if (!push(`  UNIT: ${unit.title}`)) break outer;
      for (const b of byUnit.get(unit.id) ?? []) {
        const text = (b.body ?? b.transcript ?? '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        if (!push(`    ${b.title || b.type}: ${text.slice(0, BLOCK_EXCERPT_CHARS)}`)) break outer;
      }
    }
  }

  return {
    courseId: course.id,
    title: course.title,
    difficulty: course.difficulty,
    reference: lines.join('\n'),
  };
}

// --- attempts --------------------------------------------------------------

const EXAM_MODES = new Set(['text', 'voice', 'video']);
const DIMENSION_KEYS = ['courseKnowledge', 'application', 'communication', 'problemSolving', 'professionalism'] as const;

export interface SaveAttemptInput {
  courseId: string;
  mode: string;
  /** The page's name for the scenario; the grader's own wins when it gives one. */
  scenario?: string;
  /**
   * The exam's CopilotKit thread id (the one the page ran the examiner on).
   * potential-ai reads the transcript from that thread's server-held state,
   * scoped to this learner, so the page can't supply or edit it.
   */
  threadId: string;
  // Anything else the page sends (an old client's overallScore, dimensions,
  // transcript…) is ignored: the transcript comes from potential-ai and the
  // score is whatever the server-side grader returns.
}

type TranscriptLine = { role: 'customer' | 'learner'; text: string };

/** Thread ids the page may name (it sends a UUID); matches potential-ai's rule. */
const THREAD_ID = /^[A-Za-z0-9_.-]{1,128}$/;

interface Scorecard {
  scenario: string;
  overallScore: number;
  dimensions: Record<string, number>;
  strengths: string[];
  improvements: string[];
  feedback: string;
}

function isScore(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100;
}

const GRADING_FAILED = () =>
  new AppError("Your exam couldn't be marked right now. Please try again in a moment.", 503, 'GRADING_UNAVAILABLE');

const NO_EXAM = () =>
  new AppError('This exam session has expired. Please start the exam again.', 409, 'EXAM_NOT_FOUND');
const EMPTY_ATTEMPT = () => new AppError('Answer at least one question before getting feedback', 400, 'EMPTY_ATTEMPT');

/**
 * Marks an attempt with potential-ai (POST /api/examiner/grade): the judge
 * model reads the exam's transcript — taken from the learner's own thread on
 * potential-ai, named by `threadId` and scoped by the service token's user —
 * against the course. Neither the scorecard the examiner shows in the browser
 * nor a transcript from the browser is used, so a learner can't post a score
 * or rewrite what they said.
 */
async function gradeAttempt(
  userId: string,
  payload: { course: { title: string; difficulty?: string; reference: string }; scenario?: string; threadId: string },
): Promise<Scorecard & { transcript: TranscriptLine[] }> {
  let res: Response;
  try {
    res = await fetch(`${getAiBaseUrl()}/api/examiner/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintServiceToken(userId)}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw GRADING_FAILED();
  }
  if (res.status === 409) throw NO_EXAM();
  if (res.status === 400) {
    const err = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (err?.error?.code === 'empty_attempt') throw EMPTY_ATTEMPT();
    throw GRADING_FAILED();
  }
  if (!res.ok) throw GRADING_FAILED();
  const body = (await res.json().catch(() => null)) as { data?: Scorecard & { transcript?: unknown } } | null;
  if (!body?.data) throw GRADING_FAILED();
  return { ...body.data, transcript: validTranscript(body.data.transcript) };
}

/** The transcript potential-ai marked, checked before it is stored. */
function validTranscript(raw: unknown): TranscriptLine[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 80) throw GRADING_FAILED();
  const lines = raw.map((line) => {
    const l = line as { role?: unknown; text?: unknown } | null;
    if (!l || (l.role !== 'customer' && l.role !== 'learner') || typeof l.text !== 'string') throw GRADING_FAILED();
    return { role: l.role, text: l.text.slice(0, 2000) } as TranscriptLine;
  });
  if (!lines.some((l) => l.role === 'learner' && l.text.trim())) throw EMPTY_ATTEMPT();
  return lines;
}

/** Checks a scorecard's shape and bounds; the grader's output is still validated. */
function validScorecard(card: Scorecard, fallbackScenario: string): Scorecard {
  const bad = () => GRADING_FAILED();
  if (!isScore(card.overallScore)) throw bad();
  const dims: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) {
    const v = card.dimensions?.[key];
    if (!isScore(v)) throw bad();
    dims[key] = v;
  }
  const strlist = (v: unknown): string[] => {
    if (!Array.isArray(v) || v.length === 0 || v.length > 6) throw bad();
    return v.map((x) => {
      if (typeof x !== 'string' || !x.trim()) throw bad();
      return x.trim().slice(0, 400);
    });
  };
  if (typeof card.feedback !== 'string' || !card.feedback.trim()) throw bad();
  const scenario = typeof card.scenario === 'string' && card.scenario.trim() ? card.scenario.trim() : fallbackScenario;
  return {
    scenario: scenario.slice(0, 300),
    overallScore: card.overallScore,
    dimensions: dims,
    strengths: strlist(card.strengths),
    improvements: strlist(card.improvements),
    feedback: card.feedback.trim().slice(0, 4000),
  };
}

/**
 * Marks and stores one finished attempt. The page names the exam (its thread);
 * potential-ai supplies the transcript from that thread and the score.
 */
export async function saveAttempt(userId: string, input: SaveAttemptInput) {
  if (!EXAM_MODES.has(input.mode)) throw new AppError('Invalid mode', 400, 'INVALID_ATTEMPT');
  const pageScenario =
    typeof input.scenario === 'string' && input.scenario.trim() ? input.scenario.trim().slice(0, 300) : 'Practice exam';
  if (typeof input.threadId !== 'string' || !THREAD_ID.test(input.threadId))
    throw new AppError('Invalid exam session', 400, 'INVALID_ATTEMPT');

  // Attempts are tied to a course the learner can actually sit: enrolled + published.
  const [enrollment] = await db
    .select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(
      and(
        eq(courseEnrollments.userId, userId),
        eq(courseEnrollments.courseId, input.courseId),
        eq(courses.status, 'published'),
      ),
    )
    .limit(1);
  if (!enrollment) throw new AppError('Not enrolled in this course', 403, 'NOT_ENROLLED');

  const course = await buildCourseReference(userId, input.courseId);
  const graded = await gradeAttempt(userId, {
    course: { title: course.title, ...(course.difficulty ? { difficulty: String(course.difficulty) } : {}), reference: course.reference.slice(0, 60_000) },
    scenario: pageScenario,
    threadId: input.threadId,
  });
  const card = validScorecard(graded, pageScenario);
  const transcript = graded.transcript;

  const [row] = await db
    .insert(examinerAttempts)
    .values({
      userId,
      courseId: input.courseId,
      mode: input.mode,
      scenario: card.scenario,
      overallScore: card.overallScore,
      dimensions: card.dimensions,
      strengths: card.strengths,
      improvements: card.improvements,
      feedback: card.feedback,
      transcript,
    })
    .returning({ id: examinerAttempts.id, createdAt: examinerAttempts.createdAt });
  checkBadgesSoon(userId);
  return { ...row, ...card };
}

/** The learner's attempt history, newest first, without transcripts. */
export async function listAttempts(userId: string, limit: number) {
  const capped = Math.min(Math.max(limit || 10, 1), 50);
  return db
    .select({
      id: examinerAttempts.id,
      courseId: examinerAttempts.courseId,
      courseTitle: courses.title,
      mode: examinerAttempts.mode,
      scenario: examinerAttempts.scenario,
      overallScore: examinerAttempts.overallScore,
      dimensions: examinerAttempts.dimensions,
      createdAt: examinerAttempts.createdAt,
    })
    .from(examinerAttempts)
    .innerJoin(courses, eq(courses.id, examinerAttempts.courseId))
    .where(eq(examinerAttempts.userId, userId))
    .orderBy(desc(examinerAttempts.createdAt))
    .limit(capped);
}
