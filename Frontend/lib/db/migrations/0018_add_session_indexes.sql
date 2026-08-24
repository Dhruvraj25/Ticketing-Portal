-- Migration: Add session table performance indexes
-- Better Auth's Kysely adapter queries session by token (already indexed via UNIQUE)
-- and by userId for session listing and user lookups.
-- These indexes improve JOIN performance and session expiry/refresh queries.

-- Index on session.userId for faster user→session lookups
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session" ("userId");

-- Index on session.expiresAt for session expiry queries (used by cleanup)
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON "session" ("expiresAt");

-- Index on session.updatedAt for session refresh check (updateAge comparison)
CREATE INDEX IF NOT EXISTS idx_session_updated_at ON "session" ("updatedAt");
