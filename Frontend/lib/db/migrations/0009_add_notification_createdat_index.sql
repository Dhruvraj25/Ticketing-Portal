-- Notification Query Performance Index
-- Migration 0009: Add composite index for the getNotifications() query pattern
--
-- The existing idx_notification_user_id index filters by userId but requires a
-- separate sort by createdAt DESC. This composite index eliminates the sort
-- step, allowing PostgreSQL to walk the index in order and stop after LIMIT 50.

CREATE INDEX IF NOT EXISTS idx_notification_user_createdat
ON notification ("userId", "createdAt" DESC);
