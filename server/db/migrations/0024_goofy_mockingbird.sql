ALTER TABLE "learning_questions" ALTER COLUMN "platform_id" SET DEFAULT 'ai-amplify';--> statement-breakpoint
ALTER TABLE "learning_themes" ALTER COLUMN "platform_id" SET DEFAULT 'ai-amplify';--> statement-breakpoint
ALTER TABLE "user_learning_path" ALTER COLUMN "platform_id" SET DEFAULT 'ai-amplify';--> statement-breakpoint
ALTER TABLE "cod_user_paths" ALTER COLUMN "platform_id" SET DEFAULT 'ai-amplify';--> statement-breakpoint
ALTER TABLE "both_user_paths" ALTER COLUMN "platform_id" SET DEFAULT 'ai-amplify';--> statement-breakpoint
UPDATE "learning_questions" SET "platform_id" = 'ai-amplify' WHERE "platform_id" = 'smeep';--> statement-breakpoint
UPDATE "learning_themes" SET "platform_id" = 'ai-amplify' WHERE "platform_id" = 'smeep';--> statement-breakpoint
UPDATE "user_learning_path" SET "platform_id" = 'ai-amplify' WHERE "platform_id" = 'smeep';--> statement-breakpoint
UPDATE "cod_user_paths" SET "platform_id" = 'ai-amplify' WHERE "platform_id" = 'smeep';--> statement-breakpoint
UPDATE "both_user_paths" SET "platform_id" = 'ai-amplify' WHERE "platform_id" = 'smeep';