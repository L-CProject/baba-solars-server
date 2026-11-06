ALTER TABLE "enquiries" ALTER COLUMN "name" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "enquiries" ALTER COLUMN "service" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "capacity_choice" varchar(12);--> statement-breakpoint
CREATE INDEX "enquiries_type_idx" ON "enquiries" USING btree ("enquiry_type") WHERE "enquiries"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_capacity_choice_ck" CHECK ("enquiries"."capacity_choice" is null or "enquiries"."capacity_choice" in ('custom','not-sure'));