-- SupportHub: Persistent "estimate workflow skipped" flag.
-- Set when a manager uses "Assign Directly" on a NEW ticket, which explicitly
-- SKIPS the estimate workflow. All worklogs logged against such tickets must be
-- classified NON-BILLABLE (business rule: Skipped Estimate Workflow → Non-billable).
-- Default false keeps every existing ticket and every normal workflow unchanged.
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "estimateWorkflowSkipped" boolean NOT NULL DEFAULT false;
