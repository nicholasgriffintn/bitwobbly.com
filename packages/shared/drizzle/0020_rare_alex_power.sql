CREATE TABLE `team_ai_github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`installation_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer,
	`repository_selection` text DEFAULT 'selected' NOT NULL,
	`app_slug` text,
	`connected_by_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_ai_github_installations_team_installation_unique` ON `team_ai_github_installations` (`team_id`,`installation_id`);--> statement-breakpoint
CREATE INDEX `team_ai_github_installations_team_updated_idx` ON `team_ai_github_installations` (`team_id`,`updated_at`);