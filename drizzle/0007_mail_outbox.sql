CREATE TABLE `mail_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`audience` text NOT NULL,
	`event` text NOT NULL,
	`job_id` text,
	`employee_id` text,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`text_body` text,
	`html_body` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_outbox_dedupe_idx` ON `mail_outbox` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `mail_outbox_status_idx` ON `mail_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `mail_outbox_job_idx` ON `mail_outbox` (`job_id`);