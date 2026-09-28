-- SupportHub: Admin-customized email templates. Mirror of
-- Backend/src/migrations/0020_email_templates.sql. Stores only reusable template
-- text with {{placeholders}} (no recipient data, credentials or tokens).
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One customized template per event type.
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_event_type_unique_idx ON email_templates (event_type);