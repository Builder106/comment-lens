CREATE TABLE "comment_lens_scan_improvement" (
	"scan_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"identity_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"context_scope" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"retention_until" timestamp with time zone,
	CONSTRAINT "comment_lens_scan_improvement_scan_id_comment_id_pk" PRIMARY KEY("scan_id", "comment_id"),
	CONSTRAINT "comment_lens_scan_improvement_scan_id_comment_lens_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."comment_lens_scan"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "comment_lens_scan_improvement_identity_id_comment_lens_comment_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."comment_lens_comment_identity"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint

CREATE INDEX "comment_lens_scan_improvement_retention_idx"
	ON "comment_lens_scan_improvement" ("retention_until");
