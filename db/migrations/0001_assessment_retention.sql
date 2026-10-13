UPDATE "comment_lens_assessment"
SET "retention_until" = "created_at" + INTERVAL '30 days'
WHERE "retention_until" IS NULL;
