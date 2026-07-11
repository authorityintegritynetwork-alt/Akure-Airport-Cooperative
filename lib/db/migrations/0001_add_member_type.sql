ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "member_type" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_staff_id_unique'
      AND conrelid = 'members'::regclass
  ) THEN
    ALTER TABLE "members" ADD CONSTRAINT "members_staff_id_unique" UNIQUE("staff_id");
  END IF;
END $$;
