-- SupportHub: Admin Email Management sender settings (single row, id = 1).
-- Mirror of Backend/src/migrations/0019_email_management.sql (email_settings
-- part); the email_log table is created by the existing 0015_add_email_log.
-- Additive and idempotent. Credentials are never stored here.
CREATE TABLE IF NOT EXISTS email_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sender_email TEXT,
  sender_name TEXT,
  sender_status TEXT NOT NULL DEFAULT 'unverified',
  sender_last_verified_at TIMESTAMP,
  last_verification_email TEXT,
  last_verification_error TEXT,
  last_verification_at TIMESTAMP,
  provider_status TEXT,
  provider_last_checked_at TIMESTAMP,
  provider_last_error TEXT,
  updated_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);