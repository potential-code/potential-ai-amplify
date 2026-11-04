/* eslint-disable @typescript-eslint/no-explicit-any -- test responses are read loosely (res.body.error.code) */
/**
 * Shared test harness: boots the real Express app on an ephemeral port and
 * provides a small JSON client plus fixtures (users, courses) that clean up
 * after themselves.
 */
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { like, inArray } from "drizzle-orm";
import { app } from "../app";
import { db } from "../db";
import {
  users, courses, modules, units, learningBlocks, blockQuestions,
  assessments, assessmentQuestions, inviteCodes, courseEnrollments,
} from "../db/schema";

let server: Server | null = null;
let baseUrl = "";

export async function startTestServer(): Promise<string> {
  if (server) return baseUrl;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server!.address();
  if (address === null || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  return baseUrl;
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/** JSON request against the test server; `token` is a sign-in JWT. */
export async function api<T = any>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    ...(opts.raw !== undefined ? { body: opts.raw } : opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body
  }
  return { status: res.status, body };
}

export const PASSWORD = "e2e-password-123";
let seq = 0;
const createdUserIds: string[] = [];
const createdCourseIds: string[] = [];

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** A user straight in the database, plus a sign-in token for them. */
export async function createUser(role: "sme" | "admin" | "mentor" = "sme"): Promise<TestUser> {
  const email = `t${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 7)}@e2e.local`;
  const [u] = await db.insert(users).values({
    fullName: "E2E User",
    email,
    role,
    country: "AE",
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  }).returning();
  createdUserIds.push(u!.id);
  const token = jwt.sign({ userId: u!.id, role }, process.env["JWT_SECRET"]!, { algorithm: "HS256", expiresIn: "1h" });
  return { id: u!.id, email, token };
}

export function newEmail(): string {
  return `t${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 7)}@e2e.local`;
}

export interface TestCourse {
  id: string;
  unitIds: string[];
  /** blocks per unit, in order: [text, question] */
  blocks: { unitId: string; textId: string; questionBlockId: string; questionIds: string[] }[];
  postAssessmentId?: string;
  postQuestionIds: string[];
}

/**
 * A course with `unitCount` units, each holding a text block and a question
 * block with two multiple-choice questions (correct answer: index 1).
 */
export async function createCourse(opts: {
  status?: "draft" | "published";
  unitCount?: number;
  pointsPerUnit?: number;
  withPostExam?: boolean;
} = {}): Promise<TestCourse> {
  const [course] = await db.insert(courses).values({
    title: `E2E course ${++seq}`,
    status: opts.status ?? "published",
    pointsPerUnit: opts.pointsPerUnit ?? 10,
  }).returning();
  createdCourseIds.push(course!.id);
  const [mod] = await db.insert(modules).values({ courseId: course!.id, title: "Module 1" }).returning();
  const result: TestCourse = { id: course!.id, unitIds: [], blocks: [], postQuestionIds: [] };
  for (let i = 0; i < (opts.unitCount ?? 2); i++) {
    const [unit] = await db.insert(units).values({ moduleId: mod!.id, title: `Unit ${i + 1}`, order: i }).returning();
    const [text] = await db.insert(learningBlocks).values({ unitId: unit!.id, type: "text", title: "Read", body: "Hello", order: 0 }).returning();
    const [qb] = await db.insert(learningBlocks).values({ unitId: unit!.id, type: "question", title: "Check", order: 1 }).returning();
    const qs = await db.insert(blockQuestions).values([
      { blockId: qb!.id, prompt: "Q1", options: ["a", "b"], correctIndex: 1, order: 0 },
      { blockId: qb!.id, prompt: "Q2", options: ["a", "b"], correctIndex: 1, order: 1 },
    ]).returning();
    result.unitIds.push(unit!.id);
    result.blocks.push({ unitId: unit!.id, textId: text!.id, questionBlockId: qb!.id, questionIds: qs.map((q) => q.id) });
  }
  if (opts.withPostExam) {
    const [a] = await db.insert(assessments).values({
      courseId: course!.id, title: "Final exam", assessmentType: "post", isGraded: true, passingScore: 80,
    }).returning();
    const qs = await db.insert(assessmentQuestions).values([
      { assessmentId: a!.id, questionText: "E1", options: ["x", "y", "z"], correctAnswer: 2, explanation: "z", order: 0 },
      { assessmentId: a!.id, questionText: "E2", options: ["x", "y", "z"], correctAnswer: 0, explanation: "x", order: 1 },
    ]).returning();
    result.postAssessmentId = a!.id;
    result.postQuestionIds = qs.map((q) => q.id);
  }
  return result;
}

/** Emails "sent" during the tests (captured by setup.ts). */
export function sentMail(): { to: string; subject: string; template: string; context: Record<string, unknown> }[] {
  return (globalThis as { __sentMail?: any[] }).__sentMail ?? [];
}

/** Enrols a user directly (as the enrol endpoint would). */
export async function enrol(userId: string, courseId: string): Promise<void> {
  await db.insert(courseEnrollments).values({ userId, courseId, status: "active" });
}

export async function createInviteCode(): Promise<string> {
  const code = `E2E${Date.now()}${++seq}`;
  await db.insert(inviteCodes).values({ code });
  return code;
}

/** Removes everything the fixtures created (call in afterAll). */
export async function cleanup(): Promise<void> {
  if (createdCourseIds.length) await db.delete(courses).where(inArray(courses.id, createdCourseIds.splice(0)));
  await db.delete(inviteCodes).where(like(inviteCodes.code, "E2E%"));
  await db.delete(users).where(like(users.email, "%@e2e.local"));
  createdUserIds.length = 0;
}
