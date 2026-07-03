import { pool, db } from "../index";
import { courses } from "../schema";
import { sql } from "drizzle-orm";
import { seed } from "./seed";

// Production deploy entrypoint (bundled to dist/seed.mjs, run by entrypoint.sh
// after migrations). Only seeds a completely empty database: seed-course-content
// wipes and recreates modules/assessments on every run, which would cascade-delete
// real user progress (userModuleProgress, assessmentAttempts) if re-run against a
// database that's already been seeded once.
async function main(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(courses);

  if (Number(count) > 0) {
    console.log("[seed-entrypoint] Database already seeded — skipping.");
    return;
  }

  await seed();
}

main()
  .catch((err) => {
    console.error("[seed-entrypoint] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    console.log("[seed-entrypoint] Done.");
  });
