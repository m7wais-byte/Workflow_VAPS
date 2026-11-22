CREATE TABLE `invitations` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `invitations_account_idx` ON `invitations` (`account_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `activated_at` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `invited_at` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `last_sign_in_at` text;--> statement-breakpoint
-- Accounts created before invitations were set up with a password already: they count as activated.
UPDATE `accounts` SET `activated_at` = COALESCE(`password_changed_at`, `created_at`) WHERE `activated_at` IS NULL;
