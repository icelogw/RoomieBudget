CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `bill_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`settled_at` integer,
	`settled_by` text,
	`settle_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_shares_user_outstanding_idx` ON `bill_shares` (`user_id`,`settled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_shares_bill_user_unique` ON `bill_shares` (`bill_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`category` text,
	`total_cents` integer NOT NULL,
	`notes` text,
	`issued_on` text NOT NULL,
	`due_on` text,
	`is_draft` integer DEFAULT false NOT NULL,
	`series_id` text,
	`created_by` text NOT NULL,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `recurring_series`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bills_due_idx` ON `bills` (`due_on`);--> statement-breakpoint
CREATE INDEX `bills_issued_idx` ON `bills` (`issued_on`);--> statement-breakpoint
CREATE INDEX `bills_series_idx` ON `bills` (`series_id`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`kind` text NOT NULL,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`entity_id` text,
	`sent_at` integer,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_log_dedupe_unique` ON `email_log` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invites_email_idx` ON `invites` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `recurring_series` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`category` text,
	`amount_mode` text DEFAULT 'fixed' NOT NULL,
	`total_cents` integer,
	`frequency` text NOT NULL,
	`anchor_date` text NOT NULL,
	`next_issue_on` text NOT NULL,
	`due_offset_days` integer DEFAULT 14 NOT NULL,
	`split_mode` text DEFAULT 'even' NOT NULL,
	`split_config` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recurring_next_issue_idx` ON `recurring_series` (`is_active`,`next_issue_on`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`pay_id` text,
	`pay_id_type` text,
	`payment_note` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);