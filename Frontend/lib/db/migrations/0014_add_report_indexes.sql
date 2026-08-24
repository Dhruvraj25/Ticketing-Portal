-- Report Query Performance Indexes
-- Migration 0014: Add indexes for report generation query patterns

CREATE INDEX IF NOT EXISTS idx_ticket_estimated_hours ON ticket ("estimatedHours");
CREATE INDEX IF NOT EXISTS idx_ticket_additional_hours_requested ON ticket ("additionalHoursRequested");
CREATE INDEX IF NOT EXISTS idx_ticket_client_created ON ticket ("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_ticket_assignee_created ON ticket ("assignedToId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type_date ON wallet_transaction ("transactionType", "performedAt");
CREATE INDEX IF NOT EXISTS idx_time_log_billable_date ON time_log ("isBillable", "startTime");
