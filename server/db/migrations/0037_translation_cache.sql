CREATE TABLE "translation_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"lang" text NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translation_cache_domain_lang_source_unique" UNIQUE("domain","lang","source")
);
--> statement-breakpoint
CREATE INDEX "translation_cache_lookup_idx" ON "translation_cache" USING btree ("domain","lang");