ALTER TABLE `team_ai_assistant_runs` ADD `status` text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_runs` ADD `error` text;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_runs` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_runs` ADD `partial_answer` text;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_runs` ADD `latency_ms` integer;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_runs` ADD `token_usage_json` text;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_runs` ADD `previous_run_id` text;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_runs` ADD `diff_summary_json` text;--> statement-breakpoint
ALTER TABLE `team_ai_assistant_settings` ADD `manual_audit_rate_limit_per_hour` integer DEFAULT 6 NOT NULL;