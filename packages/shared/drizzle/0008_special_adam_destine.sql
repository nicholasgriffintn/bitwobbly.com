CREATE TABLE `queue_dedupe` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_pages_team_slug_unique` ON `status_pages` (`team_id`,`slug`);