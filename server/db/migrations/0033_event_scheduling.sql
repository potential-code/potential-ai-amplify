CREATE TABLE "event_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"match_key" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"first_joined_at" timestamp with time zone NOT NULL,
	"last_left_at" timestamp with time zone,
	"minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"zoom_registrant_id" text,
	"zoom_join_url" text,
	"zoom_status" text DEFAULT 'not_required' NOT NULL,
	"zoom_error" text
);
--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: the old date (YYYY-MM-DD) plus the first time in the free-text
-- time ("5:00 PM / GST - UAE time", "17:00"), read as UAE time; noon when the
-- text has no time. Events were an hour long unless said otherwise.
WITH parsed AS (
  SELECT id, date,
    regexp_match(time, '(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]') AS ap,
    regexp_match(time, '(\d{1,2}):(\d{2})') AS hm
  FROM "live_events"
)
UPDATE "live_events" e SET "starts_at" = (
  (p.date || ' ' ||
    CASE
      WHEN p.ap IS NOT NULL THEN lpad(((p.ap[1]::int % 12) + CASE WHEN lower(p.ap[3]) = 'p' THEN 12 ELSE 0 END)::text, 2, '0') || ':' || p.ap[2]
      WHEN p.hm IS NOT NULL AND p.hm[1]::int < 24 THEN lpad(p.hm[1], 2, '0') || ':' || p.hm[2]
      ELSE '12:00'
    END
  )::timestamp AT TIME ZONE 'Asia/Dubai')
FROM parsed p WHERE p.id = e.id;--> statement-breakpoint
UPDATE "live_events" SET "ends_at" = "starts_at" + interval '60 minutes';--> statement-breakpoint
ALTER TABLE "live_events" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ALTER COLUMN "ends_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "format" text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_meeting_id" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_join_url" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_passcode" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_error" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "zoom_last_meeting_uuid" text;--> statement-breakpoint
ALTER TABLE "live_events" ADD COLUMN "attendance_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendance_event_key_idx" ON "event_attendance" USING btree ("event_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvps_event_user_idx" ON "event_rsvps" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_rsvps_user_idx" ON "event_rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_events_starts_at_idx" ON "live_events" USING btree ("starts_at");