-- Notification Dispatch Log + Dedup Table
-- Migration 0026: Created by the unified Notification Dispatcher (lib/notify-all.ts)
--
-- Stores ONE row per (event, scope, recipient) dispatch with a UNIQUE index on
-- dedup_key providing database-level duplicate protection.

CREATE TABLE IF NOT EXISTS notification_log (
  id serial PRIMARY KEY,
  event_type text NOT NULL,
  dedup_key text NOT NULL,
  recipient_user_id text NOT NULL,
  recipient_email text,
  triggered_by text NOT NULL DEFAULT 'system',
  channels text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'dispatched',
  metadata text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_log_dedup_key_unique_idx
ON notification_log (dedup_key);

CREATE INDEX IF NOT EXISTS notification_log_event_type_idx
ON notification_log (event_type);

CREATE INDEX IF NOT EXISTS notification_log_recipient_created_idx
ON notification_log (recipient_user_id, created_at);
