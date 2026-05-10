CREATE TABLE `notification_delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`alert_id` text,
	`job_id` text,
	`rule_id` text,
	`channel_id` text,
	`channel_type` text NOT NULL,
	`recipient` text,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`subject` text,
	`error_message` text,
	`provider_message_id` text,
	`source_type` text NOT NULL,
	`trigger_type` text,
	`issue_id` text,
	`monitor_id` text,
	`incident_id` text,
	`status_page_id` text,
	`details_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notification_delivery_attempts_team_created_idx` ON `notification_delivery_attempts` (`team_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_delivery_attempts_alert_idx` ON `notification_delivery_attempts` (`alert_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_attempts_rule_idx` ON `notification_delivery_attempts` (`rule_id`);--> statement-breakpoint
ALTER TABLE `alert_rule_fires` ADD `alert_id` text;