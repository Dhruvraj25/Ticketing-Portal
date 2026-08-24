-- Migration 0023: Add project_client junction table
-- Links all client users to projects they can access (not just the primary clientId).
-- Populated during customer onboarding for ALL created users.
-- Uses a UNIQUE constraint on (projectId, userId) to prevent duplicate assignments.

CREATE TABLE IF NOT EXISTS "project_client" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "assignedBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  "assignedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "project_client_project_user_unique" UNIQUE ("projectId", "userId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_client_project_user_unique_idx" ON "project_client" ("projectId", "userId");
CREATE INDEX IF NOT EXISTS "project_client_user_project_idx" ON "project_client" ("userId", "projectId");
