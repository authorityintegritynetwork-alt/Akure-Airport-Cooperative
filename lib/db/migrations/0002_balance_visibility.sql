ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "balances_hidden" boolean NOT NULL DEFAULT false;
