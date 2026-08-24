-- Migration: Make support_wallet.projectId nullable
-- Allows creating support wallets for clients without requiring a project reference

ALTER TABLE support_wallet ALTER COLUMN "projectId" DROP NOT NULL;
