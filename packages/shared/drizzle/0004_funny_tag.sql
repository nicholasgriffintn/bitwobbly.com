PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`team_id` text NOT NULL,
	`current_team_id` text,
	`auth_provider` text DEFAULT 'custom' NOT NULL,
	`cognito_sub` text,
	`mfa_enabled` integer DEFAULT 0 NOT NULL,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "password_hash", "team_id", "current_team_id", "auth_provider", "cognito_sub", "mfa_enabled", "email_verified", "created_at") SELECT "id", "email", "password_hash", "team_id", "current_team_id", "auth_provider", "cognito_sub", "mfa_enabled", "email_verified", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_cognito_sub_unique` ON `users` (`cognito_sub`);