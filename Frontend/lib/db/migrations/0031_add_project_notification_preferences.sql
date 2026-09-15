-- SupportHub: PROJECT-wise notification preferences.
-- Mirror of Backend/src/migrations/0016_project_notification_preferences.sql —
-- the shared database is migrated from either side, so the DDL is idempotent.
--
-- Authoritative order: project_notification_preferences → legacy
-- notification_preferences (client-wise inheritance fallback) → built-in
-- defaults. The legacy client table is deliberately left untouched.

CREATE TABLE IF NOT EXISTS "project_notification_preferences" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "eventType" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_notif_pref_project_channel_event_idx"
  ON "project_notification_preferences" ("projectId", "channel", "eventType");

CREATE INDEX IF NOT EXISTS "project_notif_pref_project_idx"
  ON "project_notification_preferences" ("projectId");
