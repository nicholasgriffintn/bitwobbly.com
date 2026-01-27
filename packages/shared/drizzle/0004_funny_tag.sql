ALTER TABLE `users` ADD `auth_provider` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `cognito_sub` text;--> statement-breakpoint
ALTER TABLE `users` ADD `mfa_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX `users_cognito_sub_unique` ON `users` (`cognito_sub`);