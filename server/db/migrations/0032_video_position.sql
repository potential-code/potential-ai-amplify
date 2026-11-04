ALTER TABLE "user_learning_block_progress" ADD COLUMN "video_position_sec" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "cod_user_content_progress" ADD COLUMN "video_position_sec" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "both_user_item_progress" ADD COLUMN "video_position_sec" integer DEFAULT 0;