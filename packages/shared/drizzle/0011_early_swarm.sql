CREATE TABLE `status_page_subscriber_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`status_page_id` text NOT NULL,
	`subscriber_id` text,
	`action` text NOT NULL,
	`meta` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscriber_id`) REFERENCES `status_page_subscribers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `status_page_subscriber_events` (
	`id` text PRIMARY KEY NOT NULL,
	`status_page_id` text NOT NULL,
	`subscriber_id` text NOT NULL,
	`event_type` text NOT NULL,
	`incident_id` text NOT NULL,
	`incident_update_id` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscriber_id`) REFERENCES `status_page_subscribers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_update_id`) REFERENCES `incident_updates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `status_page_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`status_page_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`endpoint` text NOT NULL,
	`digest_cadence` text DEFAULT 'immediate' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirm_token_hash` text,
	`confirm_expires_at` integer,
	`confirmed_at` text,
	`unsubscribed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_page_subscribers_status_page_channel_endpoint_unique` ON `status_page_subscribers` (`status_page_id`,`channel_type`,`endpoint`);