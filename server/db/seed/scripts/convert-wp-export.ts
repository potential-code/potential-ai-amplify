/**
 * One-off migration script: converts the extracted "aiamplify.potential.org"
 * WordPress export bundles (offer_cards, expert_cards, event_cards, cpt_cards,
 * all_courses) into this repo's seed-data JSON format, and copies every
 * referenced image out of the export bundles into client/public/images/**.
 *
 * This fully replaces the prior smeep.potential.org-origin seed data.
 *
 * Run once via: bun run server/db/seed/scripts/convert-wp-export.ts
 * Source dir defaults to /tmp/wp-zip-inspect (5 pre-extracted export folders:
 * offer_cards/, expert_cards/, event_cards/, cpt_cards/, all_courses/),
 * override with SOURCE_DIR=<path>.
 */

import fs from "fs";
import path from "path";

const SOURCE_DIR = process.env.SOURCE_DIR || "/tmp/wp-zip-inspect";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const SEED_DATA_DIR = path.join(REPO_ROOT, "server/db/seed/seed-data");
const IMAGES_DIR = path.join(REPO_ROOT, "client/public/images");

function readJson<T = any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p: string, data: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 4) + "\n");
}

function findFileByBasename(rootDir: string, basename: string): string | null {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop()!;
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === basename) return full;
    }
  }
  return null;
}

function basenameOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.split("/").pop() || null;
}

// ── Reset destination dirs ──────────────────────────────────────────────────

function resetDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

console.log("[convert] Resetting destination directories...");
for (const f of ["offer-cards.json", "mentor-cards.json", "cpt-cards.json", "live-events.json"]) {
  fs.rmSync(path.join(SEED_DATA_DIR, f), { force: true });
}
resetDir(path.join(SEED_DATA_DIR, "courses"));
resetDir(path.join(IMAGES_DIR, "offers"));
resetDir(path.join(IMAGES_DIR, "mentors"));
resetDir(path.join(IMAGES_DIR, "courses"));
resetDir(path.join(IMAGES_DIR, "events"));

// ── 1. Offers ────────────────────────────────────────────────────────────────

console.log("[convert] Offers...");
const offerExport = readJson(path.join(SOURCE_DIR, "offer_cards/cards.json"));
writeJson(path.join(SEED_DATA_DIR, "offer-cards.json"), offerExport);

let offerImagesCopied = 0;
for (const item of offerExport.cpt.items) {
  const basename = basenameOfUrl(item.extra_image_url);
  if (!basename) continue;
  const src = findFileByBasename(path.join(SOURCE_DIR, "offer_cards/images"), basename);
  if (!src) {
    console.warn(`[convert]   WARN: offer image not found: ${basename}`);
    continue;
  }
  fs.copyFileSync(src, path.join(IMAGES_DIR, "offers", basename));
  offerImagesCopied++;
}
console.log(`[convert]   ${offerExport.cpt.items.length} offer items, ${offerImagesCopied} images copied`);

// ── 2. Mentors ───────────────────────────────────────────────────────────────

console.log("[convert] Mentors...");
const mentorExport = readJson(path.join(SOURCE_DIR, "expert_cards/cards.json"));
writeJson(path.join(SEED_DATA_DIR, "mentor-cards.json"), mentorExport);

let mentorImagesCopied = 0;
for (const item of mentorExport.cpt.items) {
  const basename = basenameOfUrl(item.extra_image_url);
  if (!basename) continue;
  const src = findFileByBasename(path.join(SOURCE_DIR, "expert_cards/images"), basename);
  if (!src) {
    console.warn(`[convert]   WARN: mentor image not found: ${basename}`);
    continue;
  }
  fs.copyFileSync(src, path.join(IMAGES_DIR, "mentors", basename));
  mentorImagesCopied++;
}
console.log(`[convert]   ${mentorExport.cpt.items.length} mentor items, ${mentorImagesCopied} images copied`);

// ── 3. Live events ───────────────────────────────────────────────────────────

console.log("[convert] Live events...");
const eventExport = readJson(path.join(SOURCE_DIR, "event_cards/cards.json"));
writeJson(path.join(SEED_DATA_DIR, "live-events.json"), eventExport);
console.log(`[convert]   ${eventExport.cpt.items.length} event items (0 images in this export)`);

// ── 4. Course cards (+ synthetic draft cards for cardless courses) ──────────

console.log("[convert] Course cards + all-courses...");
const cptCardsExport = readJson(path.join(SOURCE_DIR, "cpt_cards/cards.json"));
const courseIndex = readJson(path.join(SOURCE_DIR, "all_courses/index.json"));

const cardlessCourses = courseIndex.courses.filter((c: any) => !c.has_card);
console.log(`[convert]   ${cptCardsExport.cpt.items.length} real cards, ${cardlessCourses.length} cardless courses -> synthetic draft cards`);

for (const course of cardlessCourses) {
  const courseJsonPath = path.join(SOURCE_DIR, "all_courses", course.folder, "course.json");
  const courseJson = readJson(courseJsonPath);
  cptCardsExport.cpt.items.push({
    post_id: courseJson.course.course_post_id,
    title: course.title,
    slug: course.slug,
    status: "draft",
    content: "",
    featured_image_url: null,
    extra_image_url: null,
    meta: {
      course_unit_number: "",
      course_time: "",
      course_unit_link: "",
      course_id: String(course.course_id),
      course_image_url: "",
    },
  });
}
writeJson(path.join(SEED_DATA_DIR, "cpt-cards.json"), cptCardsExport);
console.log(`[convert]   cpt-cards.json now has ${cptCardsExport.cpt.items.length} items total`);

// Build course_id -> real-card lookup (for image sourcing), from ORIGINAL real cards only.
const courseIdToRealCard = new Map<string, any>();
for (const item of cptCardsExport.cpt.items) {
  if (item.status === "publish" && item.meta.course_id) {
    courseIdToRealCard.set(String(item.meta.course_id), item);
  }
}

// Copy every course.json (all 102 folders) + copy card images for the 53 real ones.
let courseFoldersCopied = 0;
let courseImagesCopied = 0;
for (const course of courseIndex.courses) {
  const folderBase = path.basename(course.folder);
  const srcCourseJson = path.join(SOURCE_DIR, "all_courses", course.folder, "course.json");
  const destCourseJson = path.join(SEED_DATA_DIR, "courses", folderBase, "course.json");
  writeJson(destCourseJson, readJson(srcCourseJson));
  courseFoldersCopied++;

  if (!course.has_card) continue;
  const card = courseIdToRealCard.get(String(course.course_id));
  if (!card) {
    console.warn(`[convert]   WARN: has_card course ${course.course_id} has no matching real card`);
    continue;
  }
  const basename = basenameOfUrl(card.meta.course_image_url);
  if (!basename) continue;
  const src = findFileByBasename(path.join(SOURCE_DIR, "all_courses", course.folder, "images"), basename);
  if (!src) {
    console.warn(`[convert]   WARN: course image not found for course ${course.course_id}: ${basename}`);
    continue;
  }
  const ext = path.extname(basename) || ".png";
  fs.copyFileSync(src, path.join(IMAGES_DIR, "courses", `${card.slug}${ext}`));
  courseImagesCopied++;
}
console.log(`[convert]   ${courseFoldersCopied} course folders copied, ${courseImagesCopied} course card images copied`);

console.log("[convert] Done.");
