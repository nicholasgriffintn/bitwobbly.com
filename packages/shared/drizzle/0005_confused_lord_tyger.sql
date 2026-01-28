CREATE TABLE `alert_rule_fires` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`issue_id` text,
	`event_id` text,
	`severity` text NOT NULL,
	`trigger_reason` text NOT NULL,
	`fired_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alert_rule_states` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`status` text NOT NULL,
	`triggered_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`source_type` text NOT NULL,
	`project_id` text,
	`environment` text,
	`trigger_type` text NOT NULL,
	`conditions_json` text,
	`threshold_json` text,
	`channel_id` text NOT NULL,
	`action_interval_seconds` integer DEFAULT 3600 NOT NULL,
	`last_triggered_at` integer,
	`owner_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE no action
);
