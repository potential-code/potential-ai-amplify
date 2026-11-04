CREATE TABLE "ai_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"message_id" text NOT NULL,
	"question" text,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_turns" ADD CONSTRAINT "ai_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_turns_user_message_idx" ON "ai_turns" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "ai_turns_user_created_idx" ON "ai_turns" USING btree ("user_id","created_at");