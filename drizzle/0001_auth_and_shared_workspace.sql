CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`employee_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`password_changed_at` text,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_employee_id_unique` ON `accounts` (`employee_id`);--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`action` text NOT NULL,
	`job_id` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_log_at_idx` ON `activity_log` (`at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`account_id` text,
	`employee_id` text,
	`action` text NOT NULL,
	`target` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_events_target_idx` ON `audit_events` (`target`);--> statement-breakpoint
CREATE TABLE `auth_throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`type` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `request_records` (
	`no` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`revoke_reason` text
);
--> statement-breakpoint
CREATE INDEX `sessions_account_idx` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE TABLE `workspace_records` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
