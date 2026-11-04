import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, pointsEvents, courseCertificates, codUserPaths, userLearningPath, courses } from "../db/schema";
import { startTestServer, api, cleanup, createUser, createCourse, enrol, sentMail, type TestUser, type TestCourse } from "./helpers";
import { UNIT_POINTS_PER_DAY } from "../services/lms/progress.service";
import { getCoursePerformance } from "../services/admin.analytics.service";

beforeAll(async () => {
  await startTestServer();
});
afterAll(async () => {
  await cleanup();
});

const points = async (userId: string) =>
  (await db.select({ p: users.points }).from(users).where(eq(users.id, userId)))[0]!.p;

/** Does every part of one unit the honest way: answers saved, blocks completed. */
async function finishUnit(user: TestUser, course: TestCourse, i: number) {
  const b = course.blocks[i]!;
  expect((await api("POST", `/api/lms/learning-blocks/${b.textId}/progress`, { token: user.token, body: { status: "completed" } })).status).toBe(200);
  for (const q of b.questionIds) {
    expect((await api("POST", `/api/lms/questions/${q}/answer`, { token: user.token, body: { answerData: { selectedAnswer: 1 } } })).status).toBe(201);
  }
  expect((await api("POST", `/api/lms/learning-blocks/${b.questionBlockId}/progress`, { token: user.token, body: { status: "completed" } })).status).toBe(200);
}

describe("answer keys", () => {
  it("are not in the learner's course data", async () => {
    const user = await createUser();
    const course = await createCourse({ withPostExam: true });
    await enrol(user.id, course.id);
    const res = await api("GET", `/api/lms/courses/${course.id}`, { token: user.token });
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    // Block quiz answers are nulled; exam answers and explanations are gone.
    const blockQs = res.body.data.modules[0].units[0].blocks[1].questions;
    expect(blockQs[0].correctIndex).toBeNull();
    expect(blockQs[0].correctBool).toBeNull();
    const examQs = res.body.data.postAssessment.questions;
    expect(examQs).toHaveLength(2);
    expect(examQs[0]).not.toHaveProperty("correctAnswer");
    expect(examQs[0]).not.toHaveProperty("explanation");
    expect(text).not.toContain('"correctAnswer"');
  });
});

describe("progress is checked by the server", () => {
  it("can't be recorded in a course the learner isn't enrolled in", async () => {
    const user = await createUser();
    const course = await createCourse();
    const res = await api("POST", `/api/lms/learning-blocks/${course.blocks[0]!.textId}/progress`, { token: user.token, body: { status: "completed" } });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("UNIT_NOT_AVAILABLE");
  });

  it("can't be recorded in an unpublished course, even if enrolled", async () => {
    const user = await createUser();
    const course = await createCourse({ status: "draft" });
    await enrol(user.id, course.id);
    const res = await api("POST", `/api/lms/units/${course.unitIds[0]}/progress`, { token: user.token, body: { status: "completed" } });
    expect(res.status).toBe(404);
  });

  it("a question block needs every answer saved first", async () => {
    const user = await createUser();
    const course = await createCourse();
    await enrol(user.id, course.id);
    const b = course.blocks[0]!;
    let res = await api("POST", `/api/lms/learning-blocks/${b.questionBlockId}/progress`, { token: user.token, body: { status: "completed" } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("BLOCK_NOT_ANSWERED");
    await api("POST", `/api/lms/questions/${b.questionIds[0]}/answer`, { token: user.token, body: { answerData: { selectedAnswer: 0 } } });
    res = await api("POST", `/api/lms/learning-blocks/${b.questionBlockId}/progress`, { token: user.token, body: { status: "completed" } });
    expect(res.status).toBe(409);
    await api("POST", `/api/lms/questions/${b.questionIds[1]}/answer`, { token: user.token, body: { answerData: { selectedAnswer: 1 } } });
    res = await api("POST", `/api/lms/learning-blocks/${b.questionBlockId}/progress`, { token: user.token, body: { status: "completed" } });
    expect(res.status).toBe(200);
  });

  it("a unit can't be claimed complete until every block in it is", async () => {
    const user = await createUser();
    const course = await createCourse();
    await enrol(user.id, course.id);
    const res = await api("POST", `/api/lms/units/${course.unitIds[0]}/progress`, { token: user.token, body: { status: "completed" } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("UNIT_NOT_DONE");
    expect(await points(user.id)).toBe(0);
  });

  it("answers can't be saved for a course the learner can't study", async () => {
    const user = await createUser();
    const course = await createCourse();
    const res = await api("POST", `/api/lms/questions/${course.blocks[0]!.questionIds[0]}/answer`, { token: user.token, body: { answerData: { selectedAnswer: 1 } } });
    expect(res.status).toBe(404);
  });

  it("saved answers come back to their owner", async () => {
    const user = await createUser();
    const course = await createCourse();
    await enrol(user.id, course.id);
    const b = course.blocks[0]!;
    await api("POST", `/api/lms/questions/${b.questionIds[0]}/answer`, { token: user.token, body: { answerData: { openEndedAnswer: "my plan" } } });
    const mine = await api("GET", `/api/lms/learning-blocks/${b.questionBlockId}/answers`, { token: user.token });
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].answerData.openEndedAnswer).toBe("my plan");
    const other = await createUser();
    const theirs = await api("GET", `/api/lms/learning-blocks/${b.questionBlockId}/answers`, { token: other.token });
    expect(theirs.body.data).toHaveLength(0);
  });
});

describe("points", () => {
  it("pay once per unit, however often it's completed", async () => {
    const user = await createUser();
    const course = await createCourse({ pointsPerUnit: 10 });
    await enrol(user.id, course.id);
    await finishUnit(user, course, 0);
    expect(await points(user.id)).toBe(10);

    // Reset and complete again: no second payout.
    await api("POST", `/api/lms/units/${course.unitIds[0]}/progress`, { token: user.token, body: { status: "not_started" } });
    await api("POST", `/api/lms/units/${course.unitIds[0]}/progress`, { token: user.token, body: { status: "completed" } });
    await api("POST", `/api/lms/learning-blocks/${course.blocks[0]!.textId}/progress`, { token: user.token, body: { status: "completed" } });
    expect(await points(user.id)).toBe(10);
    const ledger = await db.select().from(pointsEvents).where(eq(pointsEvents.userId, user.id));
    expect(ledger).toHaveLength(1);
  });

  it("stop after the daily cap, while units still complete", async () => {
    const user = await createUser();
    const course = await createCourse({ pointsPerUnit: 10 });
    await enrol(user.id, course.id);
    await db.insert(pointsEvents).values(
      Array.from({ length: UNIT_POINTS_PER_DAY }, (_, i) => ({ userId: user.id, reason: "unit", ref: `earlier-${i}`, amount: 0 })),
    );
    await finishUnit(user, course, 0);
    expect(await points(user.id)).toBe(0);
  });
});

describe("certificates", () => {
  it("can't be requested without finishing the course", async () => {
    const user = await createUser();
    const draft = await createCourse({ status: "draft" });
    let res = await api("POST", `/api/lms/courses/${draft.id}/certificate`, { token: user.token });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_ENROLLED");

    const course = await createCourse();
    await enrol(user.id, course.id);
    res = await api("POST", `/api/lms/courses/${course.id}/certificate`, { token: user.token });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PROGRESS_INCOMPLETE");

    const certs = await db.select().from(courseCertificates).where(eq(courseCertificates.userId, user.id));
    expect(certs).toHaveLength(0);
  });

  it("are issued once the course is finished, drawn with the learner's name, and only their owner can download them", async () => {
    const a = await createUser();
    const b = await createUser();
    await db.update(users).set({ fullName: "Aisha Rahman" }).where(eq(users.id, a.id));
    await db.update(users).set({ fullName: "Bilal Khan Mohammed" }).where(eq(users.id, b.id));
    const course = await createCourse({ unitCount: 1 });
    for (const u of [a, b]) {
      await enrol(u.id, course.id);
      await finishUnit(u, course, 0);
    }
    const [certA] = await db.select().from(courseCertificates).where(and(eq(courseCertificates.userId, a.id), eq(courseCertificates.courseId, course.id)));
    const [certB] = await db.select().from(courseCertificates).where(and(eq(courseCertificates.userId, b.id), eq(courseCertificates.courseId, course.id)));
    expect(certA).toBeDefined();
    expect(certA!.certificateUrl).toMatch(/-v2\.png$/);

    // Asking again returns the same certificate.
    const again = await api("POST", `/api/lms/courses/${course.id}/certificate`, { token: a.token });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(certA!.id);

    const dlA = await fetch(`${await startTestServer()}/api/lms/certificates/${certA!.id}/download`, { headers: { Authorization: `Bearer ${a.token}` } });
    expect(dlA.status).toBe(200);
    const pngA = Buffer.from(await dlA.arrayBuffer());
    const dlB = await fetch(`${await startTestServer()}/api/lms/certificates/${certB!.id}/download`, { headers: { Authorization: `Bearer ${b.token}` } });
    const pngB = Buffer.from(await dlB.arrayBuffer());
    // Without a working font no text is drawn and both images are identical.
    expect(pngA.equals(pngB)).toBe(false);

    const stolen = await api("GET", `/api/lms/certificates/${certA!.id}/download`, { token: b.token });
    expect(stolen.status).toBe(404);
  });
});

describe("learning journeys", () => {
  it("a Content on Demand path can only be used by its owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const [path] = await db.insert(codUserPaths).values({ userId: owner.id, milestones: [], status: "active" }).returning();
    const res = await api("GET", `/api/lms/cod/milestones/m1/pretest?pathId=${path!.id}`, { token: other.token });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PATH_NOT_FOUND");
  });

  it("a second Content on Demand build is refused while one is running", async () => {
    const user = await createUser();
    await db.insert(codUserPaths).values({ userId: user.id, milestones: [], status: "building" });
    const res = await api("POST", "/api/lms/cod/path/generate", {
      token: user.token,
      body: { profile: { goals: "Grow sales", topics: ["marketing"], experienceLevel: "beginner", learningStyle: "mixed", milestoneCount: 3 } },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PATH_BUILDING");
    const rows = await db.select().from(codUserPaths).where(eq(codUserPaths.userId, user.id));
    expect(rows).toHaveLength(1);
  });

  it("Learning Path completion only accepts blocks in the learner's own path, in published courses", async () => {
    const user = await createUser();
    const course = await createCourse();
    const draft = await createCourse({ status: "draft" });
    const res = await api("POST", `/api/lms/learning/blocks/${course.blocks[0]!.textId}/complete`, { token: user.token });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("BLOCK_NOT_IN_PATH");

    await db.insert(userLearningPath).values({
      userId: user.id,
      status: "active",
      milestones: [{ themeId: "t", order: 0, rationale: "", blocks: [
        { blockId: course.blocks[0]!.textId, order: 0, reason: "" },
        { blockId: draft.blocks[0]!.textId, order: 1, reason: "" },
      ] }],
    } as typeof userLearningPath.$inferInsert);

    const ok = await api("POST", `/api/lms/learning/blocks/${course.blocks[0]!.textId}/complete`, { token: user.token });
    expect(ok.status).toBe(200);
    const blocked = await api("POST", `/api/lms/learning/blocks/${draft.blocks[0]!.textId}/complete`, { token: user.token });
    expect(blocked.status).toBe(404);
    expect(blocked.body.error.code).toBe("BLOCK_NOT_AVAILABLE");
  });

  it("journey question blocks accept answers before enrolment", async () => {
    const user = await createUser();
    const course = await createCourse();
    await db.insert(userLearningPath).values({
      userId: user.id,
      status: "active",
      milestones: [{ themeId: "t", order: 0, rationale: "", blocks: [{ blockId: course.blocks[0]!.questionBlockId, order: 0, reason: "" }] }],
    } as typeof userLearningPath.$inferInsert);
    for (const q of course.blocks[0]!.questionIds) {
      const res = await api("POST", `/api/lms/questions/${q}/answer`, { token: user.token, body: { answerData: { selectedAnswer: 1 } } });
      expect(res.status).toBe(201);
    }
    const done = await api("POST", `/api/lms/learning/blocks/${course.blocks[0]!.questionBlockId}/complete`, { token: user.token });
    expect(done.status).toBe(200);
  });
});

describe("business document PDFs", () => {
  it("only go to the account's own email", async () => {
    const user = await createUser();
    const before = sentMail().length;
    const res = await api("POST", "/api/ai-tools/generate-pdf", {
      token: user.token,
      body: { documentType: "business-plan", title: "Plan", content: "Hello", emailAddress: "someone-else@example.com" },
    });
    expect(res.status).toBe(200);
    const mail = sentMail().slice(before);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.to).toBe(user.email);
  });
});

describe("admin analytics", () => {
  it("count a finished course as completed", async () => {
    const user = await createUser();
    const course = await createCourse({ unitCount: 1 });
    await enrol(user.id, course.id);
    await finishUnit(user, course, 0);
    const row = (await getCoursePerformance()).find((r) => r.courseId === course.id);
    expect(row?.completionRate).toBe(100);
    await db.update(courses).set({ status: "draft" }).where(eq(courses.id, course.id));
  });
});
