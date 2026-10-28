CREATE TABLE `job_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`edit_hash` text NOT NULL,
	`audience` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
