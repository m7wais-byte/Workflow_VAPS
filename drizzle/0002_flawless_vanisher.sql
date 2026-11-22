CREATE TABLE `browser_archive` (
	`export_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`sha256` text NOT NULL,
	`exported_at` text NOT NULL,
	`imported_by` text NOT NULL,
	`imported_at` text NOT NULL,
	PRIMARY KEY(`export_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`no` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
