CREATE TABLE `slo_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`target_ppm` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slo_targets_team_scope_unique` ON `slo_targets` (`team_id`,`scope_type`,`scope_id`);