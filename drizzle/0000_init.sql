CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(20) NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portal" varchar(10) NOT NULL,
	"csrf_token" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(64) DEFAULT '' NOT NULL,
	"user_agent" varchar(300) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" varchar(64),
	"name" varchar(120) NOT NULL,
	"phone" varchar(20) DEFAULT '' NOT NULL,
	"email" varchar(200) DEFAULT '' NOT NULL,
	"city" varchar(120) DEFAULT '' NOT NULL,
	"address" varchar(300) DEFAULT '' NOT NULL,
	"state" varchar(60) DEFAULT '' NOT NULL,
	"pincode" varchar(6) DEFAULT '' NOT NULL,
	"service" varchar(200) NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"source" varchar(20) NOT NULL,
	"origin" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"enquiry_type" varchar(12),
	"property_type" varchar(20),
	"capacity_kw" numeric(10, 2),
	"monthly_bill" integer,
	"notes" text DEFAULT '' NOT NULL,
	"estimate" jsonb,
	"follow_up_on" date,
	"assigned_to" text,
	"last_contacted_at" timestamp with time zone,
	"contact_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "enquiries_status_ck" CHECK (status in ('new','pending','contacted','follow-up','interested','site-visit','proposal','quoted','converted','not-interested','closed')),
	CONSTRAINT "enquiries_source_ck" CHECK (source in ('contact','calculator','pricing','service','whatsapp','phone','walk-in','referral','social','other','manual','import')),
	CONSTRAINT "enquiries_origin_ck" CHECK (origin in ('website','admin','import')),
	CONSTRAINT "enquiries_contact_ck" CHECK ("enquiries"."phone" <> '' or "enquiries"."email" <> ''),
	CONSTRAINT "enquiries_capacity_ck" CHECK ("enquiries"."capacity_kw" is null or ("enquiries"."capacity_kw" >= 0 and "enquiries"."capacity_kw" <= 100000))
);
--> statement-breakpoint
CREATE TABLE "enquiry_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"enquiry_id" text NOT NULL,
	"type" varchar(24) NOT NULL,
	"outcome" varchar(24),
	"from_status" varchar(20),
	"to_status" varchar(20),
	"note" text DEFAULT '' NOT NULL,
	"meta" jsonb,
	"actor_id" text,
	"actor_name" varchar(120) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiry_activities_type_ck" CHECK (type in ('created','updated','status','call','whatsapp','email','meeting','note','follow-up-scheduled','follow-up-done','follow-up-cancelled','assigned','imported'))
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" text PRIMARY KEY NOT NULL,
	"enquiry_id" text NOT NULL,
	"due_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"assigned_to" text,
	"created_by" text,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_ups_status_ck" CHECK ("follow_ups"."status" in ('pending','done','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"badge" varchar(60) DEFAULT '' NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"slabs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"booking_amount" integer,
	"lucky_draw_text" text DEFAULT '' NOT NULL,
	"cta_label" varchar(60) DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"terms" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_dates_ck" CHECK ("offers"."valid_from" is null or "offers"."valid_until" is null or "offers"."valid_from" <= "offers"."valid_until"),
	CONSTRAINT "offers_booking_ck" CHECK ("offers"."booking_amount" is null or "offers"."booking_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "site_items" (
	"collection" varchar(20) NOT NULL,
	"id" text NOT NULL,
	"status" varchar(10) DEFAULT 'published' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"slug" varchar(120),
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_items_collection_id_pk" PRIMARY KEY("collection","id"),
	CONSTRAINT "site_items_collection_ck" CHECK (collection in ('pricingPlans','capacityPlans','services','projects','testimonials','faqs','heroSlides','gallery')),
	CONSTRAINT "site_items_status_ck" CHECK ("site_items"."status" in ('published','draft'))
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"sku" varchar(60) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hsn" varchar(12) DEFAULT '' NOT NULL,
	"unit" varchar(20) DEFAULT 'Nos' NOT NULL,
	"rate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT 18 NOT NULL,
	"category" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_category_ck" CHECK ("catalog_items"."category" in ('kit','bos','service','expense')),
	CONSTRAINT "catalog_rate_ck" CHECK ("catalog_items"."rate" >= 0 and "catalog_items"."gst_rate" >= 0 and "catalog_items"."gst_rate" <= 28)
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_number" varchar(40) NOT NULL,
	"enquiry_id" text,
	"quotation_id" text,
	"status" varchar(12) NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"phone" varchar(20) DEFAULT '' NOT NULL,
	"city" varchar(120) DEFAULT '' NOT NULL,
	"capacity_kw" numeric(10, 2) NOT NULL,
	"grand_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"proposal_date" date NOT NULL,
	"valid_until" date,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_status_ck" CHECK ("proposals"."status" in ('draft','sent','accepted','rejected','converted'))
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_number" varchar(40),
	"enquiry_id" text,
	"proposal_id" text,
	"status" varchar(12) NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"phone" varchar(20) DEFAULT '' NOT NULL,
	"city" varchar(120) DEFAULT '' NOT NULL,
	"capacity_kw" numeric(10, 2) NOT NULL,
	"grand_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"net_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"quote_date" date,
	"valid_until" date,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_status_ck" CHECK ("quotations"."status" in ('pending','sent','accepted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" varchar(20) NOT NULL,
	"reference" varchar(120) DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_amount_ck" CHECK ("invoice_payments"."amount" > 0),
	CONSTRAINT "invoice_payments_method_ck" CHECK ("invoice_payments"."method" in ('cash','upi','bank_transfer','cheque','card','loan','other'))
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" varchar(40) NOT NULL,
	"quotation_id" text,
	"status" varchar(12) NOT NULL,
	"payment_status" varchar(10) NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"phone" varchar(20) DEFAULT '' NOT NULL,
	"gstin" varchar(15) DEFAULT '' NOT NULL,
	"city" varchar(120) DEFAULT '' NOT NULL,
	"reference" varchar(120) DEFAULT '' NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"grand_total" numeric(14, 2) NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount_due" numeric(14, 2) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_ck" CHECK ("invoices"."status" in ('draft','issued','cancelled')),
	CONSTRAINT "invoices_payment_ck" CHECK ("invoices"."payment_status" in ('unpaid','partial','paid')),
	CONSTRAINT "invoices_amounts_ck" CHECK ("invoices"."amount_paid" >= 0 and "invoices"."amount_due" >= 0)
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" varchar(120) NOT NULL,
	"mime" varchar(40) NOT NULL,
	"size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_file_name_unique" UNIQUE("file_name")
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_migrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"report" jsonb NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_activities" ADD CONSTRAINT "enquiry_activities_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_activities" ADD CONSTRAINT "enquiry_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enquiries_submission_uq" ON "enquiries" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status") WHERE "enquiries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "enquiries_created_idx" ON "enquiries" USING btree ("created_at" DESC NULLS LAST) WHERE "enquiries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "enquiries_follow_up_idx" ON "enquiries" USING btree ("follow_up_on") WHERE "enquiries"."deleted_at" is null and "enquiries"."follow_up_on" is not null;--> statement-breakpoint
CREATE INDEX "enquiries_assigned_idx" ON "enquiries" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "enquiries_source_idx" ON "enquiries" USING btree ("source");--> statement-breakpoint
CREATE INDEX "enquiries_phone_idx" ON "enquiries" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "enquiries_search_trgm" ON "enquiries" USING gin ((lower("name" || ' ' || "phone" || ' ' || "email" || ' ' || "city" || ' ' || "address" || ' ' || "service" || ' ' || "message" || ' ' || "notes")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "enquiry_activities_enquiry_idx" ON "enquiry_activities" USING btree ("enquiry_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "enquiry_activities_type_idx" ON "enquiry_activities" USING btree ("type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "enquiry_activities_actor_idx" ON "enquiry_activities" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "follow_ups_one_pending_uq" ON "follow_ups" USING btree ("enquiry_id") WHERE "follow_ups"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "follow_ups_due_idx" ON "follow_ups" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "follow_ups_assigned_idx" ON "follow_ups" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "offers_active_idx" ON "offers" USING btree ("enabled","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "site_items_slug_uq" ON "site_items" USING btree ("collection","slug");--> statement-breakpoint
CREATE INDEX "site_items_list_idx" ON "site_items" USING btree ("collection","status","sort_order");--> statement-breakpoint
CREATE INDEX "companies_order_idx" ON "companies" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "catalog_category_idx" ON "catalog_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "catalog_name_trgm" ON "catalog_items" USING gin ((lower("name" || ' ' || "sku" || ' ' || "hsn" || ' ' || "description")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_number_uq" ON "proposals" USING btree ("proposal_number");--> statement-breakpoint
CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "proposals_enquiry_idx" ON "proposals" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "proposals_created_idx" ON "proposals" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "proposals_search_trgm" ON "proposals" USING gin ((lower("proposal_number" || ' ' || "customer_name" || ' ' || "phone" || ' ' || "city")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_uq" ON "quotations" USING btree ("quote_number");--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotations_enquiry_idx" ON "quotations" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "quotations_proposal_idx" ON "quotations" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "quotations_created_idx" ON "quotations" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quotations_search_trgm" ON "quotations" USING gin ((lower(coalesce("quote_number", '') || ' ' || "customer_name" || ' ' || "phone" || ' ' || "city")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_idx" ON "invoice_payments" USING btree ("invoice_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_date_idx" ON "invoices" USING btree ("invoice_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","payment_status");--> statement-breakpoint
CREATE INDEX "invoices_due_idx" ON "invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "invoices_quotation_idx" ON "invoices" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "invoices_search_trgm" ON "invoices" USING gin ((lower("invoice_number" || ' ' || "customer_name" || ' ' || "phone" || ' ' || "gstin" || ' ' || "city" || ' ' || "reference")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "uploads_sha_idx" ON "uploads" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "data_migrations_uq" ON "data_migrations" USING btree ("name","checksum");