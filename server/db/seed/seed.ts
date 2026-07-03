import { pool, db } from "../index";
import { users } from "../schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { seedMentors } from "./seed-mentors";
import { seedOffers } from "./seed-offers";
import { seedEvents } from "./seed-events";
import { seedCourses } from "./seed-courses";
import { seedCourseContent } from "./seed-course-content";
import { seedPosttests } from "./seed-posttests";

const ADMIN_EMAIL = "admin@email.com";
const ADMIN_PASSWORD = "password";

/**
 * Main seed entry point.
 * Creates the default admin user and populates the live_events table.
 */
export async function seed(): Promise<void> {
  console.log("[seed] Starting seed...")

  // ── Admin user ──────────────────────────────────────────────────────────────
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1)

  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
    await db.insert(users).values({
      fullName: "Admin",
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
    })
    console.log("[seed] Admin user created: admin@email.com")
  } else {
    console.log("[seed] Admin user already exists — skipping.")
  }

  // ── Live events ─────────────────────────────────────────────────────────────
  await seedEvents()

  // ── Offers ──────────────────────────────────────────────────────────────────
  await seedOffers()

  // ── Courses ─────────────────────────────────────────────────────────────────
  await seedCourses()

  // ── Course content (modules, units, blocks, pre-assessments) ─────────────
  await seedCourseContent()

  // ── Post-tests ───────────────────────────────────────────────────────────
  await seedPosttests()

  // ── Human mentors ───────────────────────────────────────────────────────────
  await seedMentors()
}

// @ts-ignore — import.meta.main is Bun-specific; falsy in Node so this block is skipped when bundled
if (import.meta.main) {
  seed()
    .catch((err) => {
      console.error("[seed] Error:", err)
      process.exit(1)
    })
    .finally(async () => {
      await pool.end()
      console.log("[seed] Done.")
    })
}
