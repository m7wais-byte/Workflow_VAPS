CREATE TABLE `onedrive_auth` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`account` text,
	`sealed` text,
	`pending` text,
	`pending_expires` text,
	`pending_interval` integer,
	`connected_at` text,
	`last_error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `onedrive_files` (
	`file_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`purpose` text NOT NULL,
	`section` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`item_id` text,
	`copy_name` text,
	`last_error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `onedrive_files_job_idx` ON `onedrive_files` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `onedrive_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`sampling_id` text,
	`lab_id` text,
	`folder_url` text,
	`status` text NOT NULL,
	`last_error` text,
	`updated_at` text NOT NULL
);
