CREATE TABLE "branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" text DEFAULT 'default' NOT NULL,
	"companyName" text DEFAULT 'SupportHub' NOT NULL,
	"logoUrl" text,
	"logoPublicId" text,
	"faviconUrl" text,
	"faviconPublicId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"subject" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"html_content" text,
	"from_address" text,
	"sent_at" timestamp,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"error_message" text,
	"dedup_key" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"revisionNumber" integer NOT NULL,
	"requestedById" text NOT NULL,
	"requestedByName" text NOT NULL,
	"requestedByRole" text NOT NULL,
	"revisionNotes" text NOT NULL,
	"priority" text,
	"attachmentIds" integer[],
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewedById" text,
	"reviewedByName" text,
	"reviewedAt" timestamp,
	"rejectionReason" text,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_wallet" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"projectId" integer,
	"totalPurchasedHours" integer DEFAULT 0 NOT NULL,
	"reservedHours" integer DEFAULT 0 NOT NULL,
	"consumedHours" integer DEFAULT 0 NOT NULL,
	"remainingHours" integer DEFAULT 0 NOT NULL,
	"contractStartDate" date,
	"contractEndDate" date,
	"contract_type" text,
	"hypercare_duration" integer,
	"contract_status" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_review" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"assigned_to_id" text,
	"project_id" integer,
	"overall_rating" integer NOT NULL,
	"communication_rating" integer,
	"resolution_rating" integer,
	"response_time_rating" integer,
	"technical_rating" integer,
	"review_comment" text,
	"suggestions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_review_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"walletId" integer NOT NULL,
	"alertType" text NOT NULL,
	"message" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "wallet_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"walletId" integer NOT NULL,
	"transactionType" text NOT NULL,
	"hours" integer NOT NULL,
	"previousBalance" integer NOT NULL,
	"newBalance" integer NOT NULL,
	"reason" text,
	"remarks" text,
	"performedBy" text NOT NULL,
	"performedAt" timestamp DEFAULT now() NOT NULL,
	"validFrom" date,
	"validTo" date
);
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "isOverrideTicket" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "overrideReason" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "overrideBy" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "overrideDate" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimatedHours" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimatedCompletionDate" date;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateNotes" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateSubmittedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateApprovedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateApprovedBy" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "autoApproved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "autoApprovedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "approvalDeadline" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursRequested" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursApproved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursApprovedBy" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursAutoApproved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursDeadline" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "reservedHours" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "consumedHours" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "revisionCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatarUrl" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "user_type" text DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE "revision_history" ADD CONSTRAINT "revision_history_ticketId_ticket_id_fk" FOREIGN KEY ("ticketId") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_wallet" ADD CONSTRAINT "support_wallet_clientId_user_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_wallet" ADD CONSTRAINT "support_wallet_projectId_project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_review" ADD CONSTRAINT "ticket_review_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_review" ADD CONSTRAINT "ticket_review_client_id_user_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_review" ADD CONSTRAINT "ticket_review_assigned_to_id_user_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_review" ADD CONSTRAINT "ticket_review_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_alert" ADD CONSTRAINT "wallet_alert_walletId_support_wallet_id_fk" FOREIGN KEY ("walletId") REFERENCES "public"."support_wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transaction" ADD CONSTRAINT "wallet_transaction_walletId_support_wallet_id_fk" FOREIGN KEY ("walletId") REFERENCES "public"."support_wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_ticket_id_idx" ON "attachment" USING btree ("ticketId");--> statement-breakpoint
CREATE INDEX "module_project_id_idx" ON "module" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "module_status_idx" ON "module" USING btree ("status");--> statement-breakpoint
CREATE INDEX "module_project_status_idx" ON "module" USING btree ("projectId","status");--> statement-breakpoint
CREATE INDEX "notification_user_id_idx" ON "notification" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("userId","isRead");--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "project" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_client_id_idx" ON "project" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "project_manager_id_idx" ON "project" USING btree ("managerId");--> statement-breakpoint
CREATE INDEX "project_created_at_idx" ON "project" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "ticket_status_idx" ON "ticket" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ticket_priority_idx" ON "ticket" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "ticket_project_id_idx" ON "ticket" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "ticket_module_id_idx" ON "ticket" USING btree ("moduleId");--> statement-breakpoint
CREATE INDEX "ticket_assigned_to_id_idx" ON "ticket" USING btree ("assignedToId");--> statement-breakpoint
CREATE INDEX "ticket_client_id_idx" ON "ticket" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "ticket_created_at_idx" ON "ticket" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "ticket_client_status_idx" ON "ticket" USING btree ("clientId","status");--> statement-breakpoint
CREATE INDEX "ticket_assigned_status_idx" ON "ticket" USING btree ("assignedToId","status");--> statement-breakpoint
CREATE INDEX "ticket_history_ticket_id_idx" ON "tickethistory" USING btree ("ticketId");--> statement-breakpoint
CREATE INDEX "time_log_ticket_id_idx" ON "time_log" USING btree ("ticketId");--> statement-breakpoint
CREATE INDEX "time_log_user_id_idx" ON "time_log" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "time_log_end_time_idx" ON "time_log" USING btree ("endTime");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");