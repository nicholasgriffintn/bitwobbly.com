CREATE TABLE `sentry_issue_grouping_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`matchers` text,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `sentry_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sentry_issue_grouping_rules_project_created_idx` ON `sentry_issue_grouping_rules` (`project_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `sentry_events` ADD `transaction` text;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `assigned_to_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `assigned_at` integer;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `snoozed_until` integer;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `ignored_until` integer;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `resolved_in_release` text;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `regressed_at` integer;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `regressed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `last_seen_release` text;--> statement-breakpoint
ALTER TABLE `sentry_issues` ADD `last_seen_environment` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sentry_issues_project_fingerprint_unique` ON `sentry_issues` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `sentry_issues_project_last_seen_idx` ON `sentry_issues` (`project_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `sentry_issues_project_status_idx` ON `sentry_issues` (`project_id`,`status`);