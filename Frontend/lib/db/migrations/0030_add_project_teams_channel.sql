-- SupportHub: Per-project Microsoft Teams channel configuration.
-- Each project may point at its OWN Teams channel (Power Automate workflow
-- webhook or legacy Incoming Webhook). Teams notifications route to the
-- project's configured channel; when a project has no channel, the global
-- TEAMS_WEBHOOK_URL fallback (if configured) is used.
--
-- The webhook URL embeds a signature that authenticates the call, so it is
-- treated as a SECRET: it is never returned to the frontend and never logged.
CREATE TABLE IF NOT EXISTS "project_teams_channel" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL UNIQUE REFERENCES "project"("id") ON DELETE CASCADE,
  "webhookUrl" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "configuredBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_teams_channel_enabled_idx"
  ON "project_teams_channel" ("enabled");
