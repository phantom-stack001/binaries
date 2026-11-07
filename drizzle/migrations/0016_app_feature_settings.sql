CREATE TABLE IF NOT EXISTS "app_feature_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"features" jsonb NOT NULL,
	"allow_list_creation" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_feature_settings" ADD CONSTRAINT "app_feature_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
INSERT INTO "app_feature_settings" ("id", "features", "allow_list_creation") VALUES (
	'global',
	'{"compose":true,"drafts":true,"campaigns":true,"recipients":true,"templates":true,"history":true,"roles":true,"auditLog":true}'::jsonb,
	true
) ON CONFLICT ("id") DO NOTHING;
