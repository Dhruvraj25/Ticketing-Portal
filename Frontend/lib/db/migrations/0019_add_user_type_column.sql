ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "user_type" text DEFAULT 'standard';

-- Update existing client users to 'standard' if null
UPDATE "user" SET "user_type" = 'standard' WHERE "role" = 'client' AND "user_type" IS NULL;

-- Set user_type to NOT NULL for future rows
ALTER TABLE "user" ALTER COLUMN "user_type" SET NOT NULL;
