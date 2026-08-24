-- Migration: Add critical Better Auth session performance indexes
--
-- Only ONE index was actually needed:
--
-- 1. session_user_expires_idx (CREATED) ✓
--    Composite btree index on session(userId, expiresAt) for session
--    expiry validation queries that filter by userId + range on expiresAt.
--
-- 2. session_token_idx (SKIPPED — already covered)
--    The session table already has session_token_unique, a UNIQUE btree
--    constraint on session(token). PostgreSQL's UNIQUE constraints create
--    btree indexes automatically, so an additional btree index on token
--    would be redundant and add INSERT/UPDATE overhead.
--
-- Why only one index was needed:
-- EXPLAIN ANALYZE showed execution times of 0.029-0.048ms for session
-- lookups (13 rows total). The bottleneck is Neon cold start
-- (2000-5000ms connection wait), not SQL execution.
-- These indexes become valuable when the session table grows to
-- thousands of rows.

-- Composite index on session(userId, expiresAt) for session expiry validation
CREATE INDEX IF NOT EXISTS session_user_expires_idx ON "session" ("userId", "expiresAt");

-- Verify the index was created
DO $$
DECLARE
  idx_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'session' AND indexname = 'session_user_expires_idx'
  ) INTO idx_exists;

  IF idx_exists THEN
    RAISE NOTICE 'session_user_expires_idx created successfully.';
  ELSE
    RAISE WARNING 'session_user_expires_idx was NOT created.';
  END IF;
END $$;
