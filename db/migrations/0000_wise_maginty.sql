CREATE TABLE "comment_lens_assessment" (
	"comment_id" text,
	"identity_id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"context_scope" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comment_lens_chunk" (
	"scan_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"payload_sha256" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_lens_chunk_scan_id_chunk_id_pk" PRIMARY KEY("scan_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "comment_lens_comment_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_installation_id" text NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"normalized_body" text NOT NULL,
	"symbol_anchor" text,
	"placement" text NOT NULL,
	"collision_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_lens_comment" (
	"id" text NOT NULL,
	"scan_id" text NOT NULL,
	"identity_id" text NOT NULL,
	"path" text NOT NULL,
	"language" text,
	"kind" text NOT NULL,
	"placement" text NOT NULL,
	"body_text" text NOT NULL,
	"raw_text" text NOT NULL,
	"context" text,
	"payload" jsonb NOT NULL,
	"priority_score" integer,
	"stale" boolean DEFAULT false NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"generated" boolean DEFAULT false NOT NULL,
	"license" boolean DEFAULT false NOT NULL,
	"todo_only" boolean DEFAULT false NOT NULL,
	"author_name" text,
	"author_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_lens_comment_scan_id_id_pk" PRIMARY KEY("scan_id","id")
);
--> statement-breakpoint
CREATE TABLE "comment_lens_repository_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"owner_login" text NOT NULL,
	"owner_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"repository" text NOT NULL,
	"default_branch" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comment_lens_review" (
	"comment_id" text,
	"identity_id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"status" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_lens_scan" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text,
	"owner_id" text NOT NULL,
	"owner_login" text NOT NULL,
	"repository_installation_id" text NOT NULL,
	"repository" text NOT NULL,
	"ref" text NOT NULL,
	"head_commit" text,
	"resolved_commit" text,
	"status" text NOT NULL,
	"workflow_run_id" text,
	"workflow_dispatch_id" text,
	"config_hash" text,
	"extractor_version" text,
	"parser_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"content_sha256" text,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"retention_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comment_lens_assessment" ADD CONSTRAINT "comment_lens_assessment_identity_id_comment_lens_comment_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."comment_lens_comment_identity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_lens_chunk" ADD CONSTRAINT "comment_lens_chunk_scan_id_comment_lens_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."comment_lens_scan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_lens_comment_identity" ADD CONSTRAINT "comment_lens_comment_identity_repository_installation_id_comment_lens_repository_installation_id_fk" FOREIGN KEY ("repository_installation_id") REFERENCES "public"."comment_lens_repository_installation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_lens_comment" ADD CONSTRAINT "comment_lens_comment_scan_id_comment_lens_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."comment_lens_scan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_lens_comment" ADD CONSTRAINT "comment_lens_comment_identity_id_comment_lens_comment_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."comment_lens_comment_identity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_lens_review" ADD CONSTRAINT "comment_lens_review_identity_id_comment_lens_comment_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."comment_lens_comment_identity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_lens_scan" ADD CONSTRAINT "comment_lens_scan_repository_installation_id_comment_lens_repository_installation_id_fk" FOREIGN KEY ("repository_installation_id") REFERENCES "public"."comment_lens_repository_installation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_lens_chunk_sequence_idx" ON "comment_lens_chunk" USING btree ("scan_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_lens_scan_identity_idx" ON "comment_lens_comment" USING btree ("scan_id","identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_lens_installation_repo_idx" ON "comment_lens_repository_installation" USING btree ("installation_id","repository_id");