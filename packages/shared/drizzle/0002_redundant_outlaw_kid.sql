PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`method` text DEFAULT 'GET' NOT NULL,
	`timeout_ms` integer DEFAULT 8000 NOT NULL,
	`interval_seconds` integer DEFAULT 60 NOT NULL,
	`failure_threshold` integer DEFAULT 3 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`next_run_at` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'http' NOT NULL,
	`webhook_token` text,
	`external_config` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_monitors`("id", "team_id", "name", "url", "method", "timeout_ms", "interval_seconds", "failure_threshold", "enabled", "next_run_at", "locked_until", "type", "webhook_token", "external_config", "created_at") SELECT "id", "team_id", "name", "url", "method", "timeout_ms", "interval_seconds", "failure_threshold", "enabled", "next_run_at", "locked_until", "type", "webhook_token", "external_config", "created_at" FROM `monitors`;--> statement-breakpoint
DROP TABLE `monitors`;--> statement-breakpoint
ALTER TABLE `__new_monitors` RENAME TO `monitors`;--> statement-breakpoint
PRAGMA foreign_keys=ON;