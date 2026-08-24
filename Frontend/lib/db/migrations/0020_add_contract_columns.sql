ALTER TABLE "support_wallet" ADD COLUMN IF NOT EXISTS "contract_type" text;
ALTER TABLE "support_wallet" ADD COLUMN IF NOT EXISTS "hypercare_duration" integer;
ALTER TABLE "support_wallet" ADD COLUMN IF NOT EXISTS "contract_status" text;

-- Update existing wallets to 'active' if they have contract dates
UPDATE "support_wallet" SET "contract_status" = 'active' WHERE "contractStartDate" IS NOT NULL AND "contract_status" IS NULL;
