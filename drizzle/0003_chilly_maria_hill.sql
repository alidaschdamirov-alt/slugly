CREATE TABLE `blocked_domains` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_domains_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_domains_hostname_unique` UNIQUE(`hostname`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shortCode` varchar(32) NOT NULL,
	`reason` text,
	`reporterEmail` varchar(320),
	`status` enum('pending','reviewed','actioned','dismissed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `clicks` ADD `isBot` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clicks` ADD `ipHash` varchar(64);--> statement-breakpoint
ALTER TABLE `links` ADD `activeFrom` bigint;--> statement-breakpoint
ALTER TABLE `links` ADD `expiresAt` bigint;