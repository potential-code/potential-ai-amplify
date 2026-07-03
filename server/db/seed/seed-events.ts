import { db } from "../index";
import { liveEvents } from "../schema";
import { sql } from "drizzle-orm";
import cardsJson from "./seed-data/live-events.json";

// ── Types ────────────────────────────────────────────────────────────────────

interface EventCardMeta {
  event_track: string;
  event_category: string;
  linkedinurl: string;
  overview_txt: string;
  fulldate: string;
  time: string;
  recording_link: string;
}

interface EventCardItem {
  post_id: number;
  title: string;
  slug: string;
  status: string;
  featured_image_url: string | null;
  extra_image_url: string | null;
  meta: EventCardMeta;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localEventImageUrl(externalUrl: string | null): string | null {
  if (!externalUrl) return null;
  const filename = externalUrl.split("/").pop();
  return filename ? `/images/events/${filename}` : null;
}

// ── Main seed function ────────────────────────────────────────────────────────

export async function seedEvents(): Promise<void> {
  console.log("[seed-events] Starting WP live events seed...");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(liveEvents);

  if (Number(count) > 0) {
    console.log("[seed-events] Already seeded — skipping.");
    return;
  }

  const items = (cardsJson as { cpt: { items: EventCardItem[] } }).cpt.items;
  console.log(`[seed-events] Processing ${items.length} event items...`);

  let inserted = 0;

  for (const item of items) {
    await db.insert(liveEvents).values({
      title: item.title,
      description: item.meta.overview_txt?.trim() || null,
      type: "Webinar",
      date: item.meta.fulldate,
      time: item.meta.time?.trim() || "",
      meetingLink: null,
      recordingLink: item.meta.recording_link || null,
      coverImage: localEventImageUrl(item.extra_image_url),
      status: item.status === "publish" ? "published" : "draft",
      createdBy: null,
    });

    console.log(`[seed-events]   Inserted: ${item.title}`);
    inserted++;
  }

  console.log(`\n[seed-events] Complete — inserted: ${inserted}`);
}
