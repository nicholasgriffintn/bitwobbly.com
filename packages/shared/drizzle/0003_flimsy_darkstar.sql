CREATE TABLE `sentry_client_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`discarded_events` text,
	`received_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `sentry_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sentry_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`distinct_id` text,
	`status` text NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`started` integer NOT NULL,
	`duration` integer,
	`release` text,
	`environment` text,
	`user_agent` text,
	`received_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `sentry_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `sentry_events` ADD `user` text;--> statement-breakpoint
ALTER TABLE `sentry_events` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `sentry_events` ADD `contexts` text;--> statement-breakpoint
ALTER TABLE `sentry_events` ADD `request` text;--> statement-breakpoint
ALTER TABLE `sentry_events` ADD `exception` text;--> statement-breakpoint
ALTER TABLE `sentry_events` ADD `breadcrumbs` text;