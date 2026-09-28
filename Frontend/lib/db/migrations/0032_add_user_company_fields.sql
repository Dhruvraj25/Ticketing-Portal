-- SupportHub: Add the customer's company information to the user table.
-- Captured in Customer Onboarding (User section) and shown on Project Detail.
-- Both columns are nullable so existing users remain intact (the UI falls back
-- to the user's own name when companyName is empty). Idempotent: safe to run
-- more than once and never touches existing data.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "companyName" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "companyCode" text;
