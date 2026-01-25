CREATE TABLE `incident_components` (
	`incident_id` text NOT NULL,
	`component_id` text NOT NULL,
	`impact_level` text NOT NULL,
	PRIMARY KEY(`incident_id`, `component_id`),
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `components` ADD `current_status` text DEFAULT 'operational' NOT NULL;--> statement-breakpoint
ALTER TABLE `components` ADD `status_updated_at` integer;