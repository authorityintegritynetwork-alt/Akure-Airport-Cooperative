CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"staff_id" text,
	"member_type" text,
	"employee_no" text,
	"pending_clerk_user_id" text,
	"pending_email" text,
	"pending_name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"organization" text DEFAULT 'FAAN' NOT NULL,
	"shares_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"savings_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"provident_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"christmas_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"real_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"emergency_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"electronics_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"s_electronics_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"furniture_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"commodity_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"ghl_form_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"fire_fund_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"fuel_venture_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"land_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_store_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"failed_step_up_attempts" integer DEFAULT 0 NOT NULL,
	"step_up_locked_until" timestamp with time zone,
	"ob_shares_balance" numeric(15, 2),
	"ob_savings_balance" numeric(15, 2),
	"ob_provident_balance" numeric(15, 2),
	"ob_christmas_balance" numeric(15, 2),
	"ob_real_loan_balance" numeric(15, 2),
	"ob_emergency_loan_balance" numeric(15, 2),
	"ob_total_loan_balance" numeric(15, 2),
	"ob_electronics_debt" numeric(15, 2),
	"ob_s_electronics_debt" numeric(15, 2),
	"ob_furniture_debt" numeric(15, 2),
	"ob_commodity_debt" numeric(15, 2),
	"ob_ghl_form_debt" numeric(15, 2),
	"ob_fire_fund_balance" numeric(15, 2),
	"ob_fuel_venture_balance" numeric(15, 2),
	"ob_land_loan_balance" numeric(15, 2),
	"ob_total_store_debt" numeric(15, 2),
	"ob_uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "members_email_unique" UNIQUE("email"),
	CONSTRAINT "members_staff_id_unique" UNIQUE("staff_id"),
	CONSTRAINT "members_pending_clerk_user_id_unique" UNIQUE("pending_clerk_user_id"),
	CONSTRAINT "members_shares_non_neg" CHECK ("members"."shares_balance" >= 0),
	CONSTRAINT "members_savings_non_neg" CHECK ("members"."savings_balance" >= 0),
	CONSTRAINT "members_provident_non_neg" CHECK ("members"."provident_balance" >= 0),
	CONSTRAINT "members_christmas_non_neg" CHECK ("members"."christmas_balance" >= 0),
	CONSTRAINT "members_real_loan_non_neg" CHECK ("members"."real_loan_balance" >= 0),
	CONSTRAINT "members_emergency_loan_non_neg" CHECK ("members"."emergency_loan_balance" >= 0),
	CONSTRAINT "members_total_loan_non_neg" CHECK ("members"."total_loan_balance" >= 0),
	CONSTRAINT "members_electronics_debt_non_neg" CHECK ("members"."electronics_debt" >= 0),
	CONSTRAINT "members_s_electronics_debt_non_neg" CHECK ("members"."s_electronics_debt" >= 0),
	CONSTRAINT "members_furniture_debt_non_neg" CHECK ("members"."furniture_debt" >= 0),
	CONSTRAINT "members_commodity_debt_non_neg" CHECK ("members"."commodity_debt" >= 0),
	CONSTRAINT "members_ghl_form_debt_non_neg" CHECK ("members"."ghl_form_debt" >= 0),
	CONSTRAINT "members_fire_fund_non_neg" CHECK ("members"."fire_fund_balance" >= 0),
	CONSTRAINT "members_fuel_venture_non_neg" CHECK ("members"."fuel_venture_balance" >= 0),
	CONSTRAINT "members_land_loan_non_neg" CHECK ("members"."land_loan_balance" >= 0),
	CONSTRAINT "members_store_debt_non_neg" CHECK ("members"."total_store_debt" >= 0),
	CONSTRAINT "members_failed_step_ups_non_neg" CHECK ("members"."failed_step_up_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"excel_format" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"type" text NOT NULL,
	"category" text,
	"amount" numeric(15, 2) NOT NULL,
	"description" text,
	"upload_record_id" integer,
	"month" text,
	"year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_non_neg" CHECK ("transactions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"loan_product_id" integer,
	"amount" numeric(15, 2) NOT NULL,
	"interest_rate" numeric(5, 2) NOT NULL,
	"interest_amount" numeric(15, 2) NOT NULL,
	"total_repayable" numeric(15, 2) NOT NULL,
	"monthly_repayment" numeric(15, 2) NOT NULL,
	"tenure_months" integer NOT NULL,
	"purpose" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"outstanding_balance" numeric(15, 2) NOT NULL,
	"loan_type" text DEFAULT 'real' NOT NULL,
	"admin_approved_at" timestamp with time zone,
	"admin_approved_by" integer,
	"auditor_approved_at" timestamp with time zone,
	"auditor_approved_by" integer,
	"super_admin_approved_at" timestamp with time zone,
	"super_admin_approved_by" integer,
	"disbursed_at" timestamp with time zone,
	"disbursed_by" integer,
	"rejected_at" timestamp with time zone,
	"rejected_by" integer,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_amount_positive" CHECK ("loans"."amount" > 0),
	CONSTRAINT "loans_interest_rate_non_neg" CHECK ("loans"."interest_rate" >= 0),
	CONSTRAINT "loans_interest_amount_non_neg" CHECK ("loans"."interest_amount" >= 0),
	CONSTRAINT "loans_total_repayable_positive" CHECK ("loans"."total_repayable" > 0),
	CONSTRAINT "loans_monthly_repayment_non_neg" CHECK ("loans"."monthly_repayment" >= 0),
	CONSTRAINT "loans_outstanding_non_neg" CHECK ("loans"."outstanding_balance" >= 0),
	CONSTRAINT "loans_tenure_positive" CHECK ("loans"."tenure_months" > 0)
);
--> statement-breakpoint
CREATE TABLE "loan_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"interest_rate" numeric(5, 2) NOT NULL,
	"default_tenure_months" integer NOT NULL,
	"max_tenure_months" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loan_products_code_unique" UNIQUE("code"),
	CONSTRAINT "loan_products_interest_rate_non_neg" CHECK ("loan_products"."interest_rate" >= 0),
	CONSTRAINT "loan_products_default_tenure_positive" CHECK ("loan_products"."default_tenure_months" > 0),
	CONSTRAINT "loan_products_max_tenure_positive" CHECK ("loan_products"."max_tenure_months" > 0),
	CONSTRAINT "loan_products_tenure_order" CHECK ("loan_products"."max_tenure_months" >= "loan_products"."default_tenure_months")
);
--> statement-breakpoint
CREATE TABLE "store_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(15, 2) NOT NULL,
	"image_object_path" text,
	"quantity_available" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_items_price_non_neg" CHECK ("store_items"."price" >= 0),
	CONSTRAINT "store_items_qty_non_neg" CHECK ("store_items"."quantity_available" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"store_item_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"total_price" numeric(15, 2) NOT NULL,
	"outstanding_balance" numeric(15, 2) NOT NULL,
	"status" text DEFAULT 'outstanding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_purchases_quantity_positive" CHECK ("store_purchases"."quantity" > 0),
	CONSTRAINT "store_purchases_unit_price_non_neg" CHECK ("store_purchases"."unit_price" >= 0),
	CONSTRAINT "store_purchases_total_price_non_neg" CHECK ("store_purchases"."total_price" >= 0),
	CONSTRAINT "store_purchases_outstanding_non_neg" CHECK ("store_purchases"."outstanding_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"type" text NOT NULL,
	"link" text,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_name" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" integer,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_interest_rate" numeric(5, 2) DEFAULT '10' NOT NULL,
	"max_loan_amount" numeric(15, 2),
	"max_loan_tenure_months" integer DEFAULT 24 NOT NULL,
	"cooperative_name" text DEFAULT 'Akure Airport Staff Cooperative Multipurpose Society' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_singleton" CHECK ("system_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "upload_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_by" integer NOT NULL,
	"month" text NOT NULL,
	"year" integer NOT NULL,
	"organization" text NOT NULL,
	"file_object_path" text NOT NULL,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_balance_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_by" integer NOT NULL,
	"organization" text,
	"sheet_name" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"members_synced" integer DEFAULT 0 NOT NULL,
	"skipped_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"organization" text,
	"status" text DEFAULT 'unclaimed' NOT NULL,
	"linked_member_id" integer,
	"reconcile_note" text,
	"employee_no" text,
	"shares_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"savings_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"provident_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"christmas_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"real_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"emergency_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"electronics_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"s_electronics_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"furniture_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"commodity_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"ghl_form_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"fire_fund_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"fuel_venture_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"land_loan_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_store_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ob_shares_non_neg" CHECK ("opening_balances"."shares_balance" >= 0),
	CONSTRAINT "ob_savings_non_neg" CHECK ("opening_balances"."savings_balance" >= 0),
	CONSTRAINT "ob_provident_non_neg" CHECK ("opening_balances"."provident_balance" >= 0),
	CONSTRAINT "ob_christmas_non_neg" CHECK ("opening_balances"."christmas_balance" >= 0),
	CONSTRAINT "ob_real_loan_non_neg" CHECK ("opening_balances"."real_loan_balance" >= 0),
	CONSTRAINT "ob_emergency_loan_non_neg" CHECK ("opening_balances"."emergency_loan_balance" >= 0),
	CONSTRAINT "ob_total_loan_non_neg" CHECK ("opening_balances"."total_loan_balance" >= 0),
	CONSTRAINT "ob_electronics_debt_non_neg" CHECK ("opening_balances"."electronics_debt" >= 0),
	CONSTRAINT "ob_s_electronics_debt_non_neg" CHECK ("opening_balances"."s_electronics_debt" >= 0),
	CONSTRAINT "ob_furniture_debt_non_neg" CHECK ("opening_balances"."furniture_debt" >= 0),
	CONSTRAINT "ob_commodity_debt_non_neg" CHECK ("opening_balances"."commodity_debt" >= 0),
	CONSTRAINT "ob_ghl_form_debt_non_neg" CHECK ("opening_balances"."ghl_form_debt" >= 0),
	CONSTRAINT "ob_fire_fund_non_neg" CHECK ("opening_balances"."fire_fund_balance" >= 0),
	CONSTRAINT "ob_fuel_venture_non_neg" CHECK ("opening_balances"."fuel_venture_balance" >= 0),
	CONSTRAINT "ob_land_loan_non_neg" CHECK ("opening_balances"."land_loan_balance" >= 0),
	CONSTRAINT "ob_store_debt_non_neg" CHECK ("opening_balances"."total_store_debt" >= 0)
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"purpose" text DEFAULT 'step_up' NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_up_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"clerk_session_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_member_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"category" text DEFAULT 'announcement' NOT NULL,
	"audience" jsonb NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"send_email" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender_member_id" integer NOT NULL,
	"body" text NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"subject" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_to_member_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"error" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_upload_record_id_upload_records_id_fk" FOREIGN KEY ("upload_record_id") REFERENCES "public"."upload_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_loan_product_id_loan_products_id_fk" FOREIGN KEY ("loan_product_id") REFERENCES "public"."loan_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_purchases" ADD CONSTRAINT "store_purchases_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_purchases" ADD CONSTRAINT "store_purchases_store_item_id_store_items_id_fk" FOREIGN KEY ("store_item_id") REFERENCES "public"."store_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_records" ADD CONSTRAINT "upload_records_uploaded_by_members_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_imports" ADD CONSTRAINT "opening_balance_imports_uploaded_by_members_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_linked_member_id_members_id_fk" FOREIGN KEY ("linked_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_up_grants" ADD CONSTRAINT "step_up_grants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_sender_member_id_members_id_fk" FOREIGN KEY ("sender_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_member_id_members_id_fk" FOREIGN KEY ("sender_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_member_id_members_id_fk" FOREIGN KEY ("assigned_to_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_member_idx" ON "transactions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_period_idx" ON "transactions" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "transactions_created_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "loans_member_idx" ON "loans" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "loans_status_idx" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "loans_product_idx" ON "loans" USING btree ("loan_product_id");--> statement-breakpoint
CREATE INDEX "loans_created_idx" ON "loans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "loan_products_active_idx" ON "loan_products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "store_purchases_member_idx" ON "store_purchases" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "store_purchases_item_idx" ON "store_purchases" USING btree ("store_item_id");--> statement-breakpoint
CREATE INDEX "store_purchases_status_idx" ON "store_purchases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_member_idx" ON "notifications" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "notifications_member_unread_idx" ON "notifications" USING btree ("member_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_type_link_idx" ON "notifications" USING btree ("type","link");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "upload_records_uploader_idx" ON "upload_records" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "upload_records_period_org_idx" ON "upload_records" USING btree ("year","month","organization");--> statement-breakpoint
CREATE INDEX "opening_balance_imports_created_idx" ON "opening_balance_imports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "opening_balance_imports_org_idx" ON "opening_balance_imports" USING btree ("organization");--> statement-breakpoint
CREATE INDEX "opening_balances_status_idx" ON "opening_balances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opening_balances_name_idx" ON "opening_balances" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "opening_balances_linked_member_idx" ON "opening_balances" USING btree ("linked_member_id");--> statement-breakpoint
CREATE INDEX "otp_codes_member_idx" ON "otp_codes" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "step_up_grants_member_idx" ON "step_up_grants" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "broadcasts_sender_idx" ON "broadcasts" USING btree ("sender_member_id");--> statement-breakpoint
CREATE INDEX "broadcasts_created_idx" ON "broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_idx" ON "support_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_messages_sender_idx" ON "support_messages" USING btree ("sender_member_id");--> statement-breakpoint
CREATE INDEX "support_tickets_member_idx" ON "support_tickets" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "support_tickets_assignee_idx" ON "support_tickets" USING btree ("assigned_to_member_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_tickets_last_message_idx" ON "support_tickets" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "email_failures_unresolved_idx" ON "email_failures" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "email_failures_created_idx" ON "email_failures" USING btree ("created_at");