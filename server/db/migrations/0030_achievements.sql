CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_pk" PRIMARY KEY("user_id","badge")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_on_leaderboard" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Points held that no unit accounts for (balance + points spent on offers),
-- dated to when the account was made, so all-time ranks match what learners
-- have earned. (Units were backfilled into points_events by 0025.)
INSERT INTO "points_events" ("user_id", "reason", "ref", "amount", "created_at")
SELECT u."id", 'opening', 'opening', t.extra, u."created_at"
FROM "users" u
JOIN LATERAL (
  SELECT u."points"
    + COALESCE((SELECT sum(r."points_deducted") FROM "offer_redemptions" r WHERE r."user_id" = u."id"), 0)
    - COALESCE((SELECT sum(e."amount") FROM "points_events" e WHERE e."user_id" = u."id"), 0) AS extra
) t ON true
WHERE t.extra > 0
ON CONFLICT DO NOTHING;
