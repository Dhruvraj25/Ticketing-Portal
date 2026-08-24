-- Add validFrom and validTo columns to wallet_transaction for audit trail
-- NOTE: Column names must match Drizzle schema (camelCase, double-quoted)
ALTER TABLE wallet_transaction ADD COLUMN IF NOT EXISTS "validFrom" date;
ALTER TABLE wallet_transaction ADD COLUMN IF NOT EXISTS "validTo" date;
