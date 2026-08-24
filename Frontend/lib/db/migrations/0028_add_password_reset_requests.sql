-- SupportHub: Password reset request table.
-- Client/Developer "Reset Password" requests are routed to the Support team
-- for review (strict role-based password policy — these roles cannot change
-- their password directly). Stores only request metadata + a reference code;
-- NEVER stores passwords or reset tokens.
CREATE TABLE IF NOT EXISTS "password_reset_request" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "requester_name" text,
  "requester_email" text,
  "requester_role" text,
  "reference" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'pending',
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  "resolved_by" text,
  "note" text
);
CREATE INDEX IF NOT EXISTS "password_reset_request_user_status_idx" ON "password_reset_request" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "password_reset_request_status_requested_idx" ON "password_reset_request" ("status", "requested_at");
