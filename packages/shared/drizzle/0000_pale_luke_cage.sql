CREATE TABLE `component_monitors` (
	`component_id` text NOT NULL,
	`monitor_id` text NOT NULL,
	PRIMARY KEY(`component_id`, `monitor_id`),
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `components` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incident_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`status_page_id` text,
	`monitor_id` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monitor_state` (
	`monitor_id` text PRIMARY KEY NOT NULL,
	`last_checked_at` integer DEFAULT 0 NOT NULL,
	`last_status` text DEFAULT 'unknown' NOT NULL,
	`last_latency_ms` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`incident_open` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`timeout_ms` integer DEFAULT 8000 NOT NULL,
	`interval_seconds` integer DEFAULT 60 NOT NULL,
	`failure_threshold` integer DEFAULT 3 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`next_run_at` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`type` text NOT NULL,
	`config_json` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`monitor_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`threshold_failures` integer DEFAULT 3 NOT NULL,
	`notify_on_recovery` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `status_page_components` (
	`status_page_id` text NOT NULL,
	`component_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`status_page_id`, `component_id`),
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `status_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`is_public` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`team_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);