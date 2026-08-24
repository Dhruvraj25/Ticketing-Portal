-- Database Performance Optimization
-- Migration 0015: Add missing indexes for query performance

-- ============================================================================
-- 1. Foreign Key Column Indexes
-- ============================================================================

-- wallet_alert.walletId -> FK to support_wallet.id
CREATE INDEX IF NOT EXISTS idx_wallet_alert_wallet_id ON wallet_alert ("walletId");

-- comment.userId -> no FK constraint, but used in queries
CREATE INDEX IF NOT EXISTS idx_comment_user_id ON comment ("userId");

-- attachment.uploadedById -> no FK constraint
CREATE INDEX IF NOT EXISTS idx_attachment_uploaded_by ON attachment ("uploadedById");

-- ============================================================================
-- 2. Composite Indexes for Sort + Filter Patterns
-- ============================================================================

-- wallet_transaction: filter by walletId, sort by performedAt DESC
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_date
ON wallet_transaction ("walletId", "performedAt" DESC);

-- comment: filter by ticketId, sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_comment_ticket_created
ON comment ("ticketId", "createdAt" DESC);

-- time_log: filter by ticketId, sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_time_log_ticket_created
ON time_log ("ticketId", "createdAt" DESC);

-- ticket: filter by assignedToId + status, sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_ticket_assignee_status_created
ON ticket ("assignedToId", "status", "createdAt" DESC);

-- ticket: filter by clientId + status, sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_ticket_client_status_created
ON ticket ("clientId", "status", "createdAt" DESC);

-- ticket: filter by projectId + clientId, sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_ticket_project_client_created
ON ticket ("projectId", "clientId", "createdAt" DESC);

-- ============================================================================
-- 3. Sort-Only Indexes
-- ============================================================================

-- user: sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_user_created_at ON "user" ("createdAt" DESC);

-- ============================================================================
-- 4. Lookup Indexes
-- ============================================================================

-- branding: filter by companyId
CREATE INDEX IF NOT EXISTS idx_branding_company_id ON branding ("companyId");

-- ============================================================================
-- 5. Better Auth FK Indexes
-- ============================================================================

-- account.userId -> FK to user.id (Better Auth table)
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account ("userId");
