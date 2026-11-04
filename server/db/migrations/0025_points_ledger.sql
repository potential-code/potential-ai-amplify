CREATE TABLE "points_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ref" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "points_events" ADD CONSTRAINT "points_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "points_events_user_reason_ref_idx" ON "points_events" USING btree ("user_id","reason","ref");--> statement-breakpoint
CREATE INDEX "points_events_user_created_idx" ON "points_events" USING btree ("user_id","created_at");--> statement-breakpoint
-- Units already completed before the ledger existed were already paid into
-- users.points. Record them so completing them again pays nothing.
INSERT INTO "points_events" ("user_id", "reason", "ref", "amount", "created_at")
SELECT p."user_id", 'unit', p."unit_id"::text, c."points_per_unit", COALESCE(p."completed_at", now())
FROM "user_unit_progress" p
JOIN "units" u ON u."id" = p."unit_id"
JOIN "modules" m ON m."id" = u."module_id"
JOIN "courses" c ON c."id" = m."course_id"
WHERE p."status" = 'completed'
ON CONFLICT DO NOTHING;
