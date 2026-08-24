-- Worklog Query Performance Index
-- Migration 0013: Partial index for getAllWorklogs() query
--
-- The worklogs page executes:
--   SELECT ... FROM "time_log"
--   WHERE "endTime" IS NOT NULL
--   ORDER BY "startTime" DESC
--   LIMIT 200
--
-- A full index on (startTime DESC) would require scanning ALL time_log rows
-- and filtering those with endTime IS NOT NULL. A partial index with the
-- WHERE condition built in is half the size and perfectly matches the query.
--
-- Existing time_log indexes:
--   idx_time_log_ticket_id       (ticketId)
--   idx_time_log_user_id         (userId)
--   idx_time_log_start_time      (startTime)
--   idx_time_log_user_start      (userId, startTime)
--   idx_time_log_end_time        (endTime)
--   idx_time_log_ticket_user     (ticketId, userId)
--   idx_time_log_user_completed  (userId, startTime) WHERE endTime IS NOT NULL
--
-- This new index is distinct from all of the above — no duplication.

CREATE INDEX IF NOT EXISTS idx_time_log_completed_recent
ON "time_log" ("startTime" DESC)
WHERE "endTime" IS NOT NULL;
