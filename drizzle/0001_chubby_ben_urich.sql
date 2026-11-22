CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_record` ON `audit_log` (`record_type`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_actor` ON `audit_log` (`actor_id`,`at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_number` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`trashed` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_job_number` ON `jobs` (`job_number`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
