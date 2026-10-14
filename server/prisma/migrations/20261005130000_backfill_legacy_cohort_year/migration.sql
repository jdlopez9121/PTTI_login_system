-- The existing legacy roster belongs to 2026. Keep explicitly imported years.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "cohort_start_year" INTEGER;

UPDATE "students"
SET "cohort_start_year" = 2026
WHERE "cohort_start_year" IS NULL;
