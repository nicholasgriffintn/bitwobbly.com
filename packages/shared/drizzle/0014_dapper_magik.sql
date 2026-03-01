CREATE UNIQUE INDEX `alert_rule_states_rule_issue_unique` ON `alert_rule_states` (`rule_id`,`issue_id`);--> statement-breakpoint
CREATE INDEX `alert_rules_monitor_trigger_idx` ON `alert_rules` (`monitor_id`,`source_type`,`trigger_type`,`enabled`);--> statement-breakpoint
CREATE INDEX `alert_rules_project_source_idx` ON `alert_rules` (`team_id`,`source_type`,`enabled`);--> statement-breakpoint
CREATE INDEX `incidents_team_page_status_idx` ON `incidents` (`team_id`,`status_page_id`,`status`);--> statement-breakpoint
CREATE INDEX `monitors_scheduling_idx` ON `monitors` (`enabled`,`next_run_at`,`locked_until`);--> statement-breakpoint
CREATE INDEX `sentry_events_issue_received_idx` ON `sentry_events` (`issue_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `sub_events_subscriber_sent_idx` ON `status_page_subscriber_events` (`subscriber_id`,`sent_at`);