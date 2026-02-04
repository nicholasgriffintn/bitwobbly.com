ALTER TABLE `status_pages` ADD `access_mode` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `status_pages` ADD `password_hash` text;