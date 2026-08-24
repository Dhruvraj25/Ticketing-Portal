-- Fix: Rename valid_from → "validFrom" and valid_to → "validTo" to match Drizzle schema
-- The original migration 0016 used snake_case but Drizzle expects camelCase (double-quoted).
-- All other columns in wallet_transaction use camelCase: "walletId", "transactionType", etc.

DO $$
BEGIN
  -- Rename valid_from → "validFrom" if it exists with the old snake_case name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transaction' AND column_name = 'valid_from'
  ) THEN
    ALTER TABLE wallet_transaction RENAME COLUMN valid_from TO "validFrom";
  END IF;

  -- Rename valid_to → "validTo" if it exists with the old snake_case name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transaction' AND column_name = 'valid_to'
  ) THEN
    ALTER TABLE wallet_transaction RENAME COLUMN valid_to TO "validTo";
  END IF;

  -- Add columns with correct camelCase names if they don't exist at all
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transaction' AND column_name = 'validFrom'
  ) THEN
    ALTER TABLE wallet_transaction ADD COLUMN "validFrom" date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_transaction' AND column_name = 'validTo'
  ) THEN
    ALTER TABLE wallet_transaction ADD COLUMN "validTo" date;
  END IF;
END $$;
