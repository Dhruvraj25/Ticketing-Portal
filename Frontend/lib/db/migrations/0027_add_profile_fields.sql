-- SupportHub: Add profile fields (phone with country code, timezone, about,
-- language/time/date formats, email notification preference) to the user table.
-- All columns are nullable or have defaults so existing rows remain intact.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "countryCode" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "about" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'en';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timeFormat" text DEFAULT '12h';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "dateFormat" text DEFAULT 'MM/dd/yyyy';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailNotificationsEnabled" boolean NOT NULL DEFAULT true;
