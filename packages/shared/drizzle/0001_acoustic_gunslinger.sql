CREATE TABLE `sentry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`level` text,
	`message` text,
	`fingerprint` text,
	`issue_id` text,
	`release` text,
	`environment` text,
	`r2_key` text NOT NULL,
	`received_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `sentry_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`issue_id`) REFERENCES `sentry_issues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sentry_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`culprit` text,
	`level` text NOT NULL,
	`status` text DEFAULT 'unresolved' NOT NULL,
	`event_count` integer DEFAULT 1 NOT NULL,
	`user_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`resolved_at` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `sentry_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sentry_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`public_key` text NOT NULL,
	`secret_key` text,
	`label` text,
	`status` text DEFAULT 'active' NOT NULL,
	`rate_limit_per_minute` integer DEFAULT 1000,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `sentry_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sentry_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`sentry_project_id` integer NOT NULL,
	`name` text NOT NULL,
	`platform` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sentry_projects_sentry_project_id_unique` ON `sentry_projects` (`sentry_project_id`);