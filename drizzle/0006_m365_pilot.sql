CREATE TABLE `sharepoint_files` (
	`file_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`section` text NOT NULL,
	`status` text NOT NULL,
	`sp_item_id` text,
	`sp_name` text,
	`last_error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sharepoint_files_job_idx` ON `sharepoint_files` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `sharepoint_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`sampling_id` text,
	`lab_id` text,
	`folder_url` text,
	`register_item_id` text,
	`status` text NOT NULL,
	`last_error` text,
	`updated_at` text NOT NULL
);
