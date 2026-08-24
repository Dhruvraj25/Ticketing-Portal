-- SupportHub: Add customer-level Microsoft Teams notification preference.
-- Default OFF. Existing customers automatically backfill to false (disabled)
-- because the column default applies to pre-existing rows.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "enable_teams_notifications" boolean NOT NULL DEFAULT false;
