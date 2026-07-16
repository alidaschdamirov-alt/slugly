CREATE TABLE `clicks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`linkId` int NOT NULL,
	`timestamp` bigint NOT NULL,
	`country` varchar(100),
	`city` varchar(255),
	`deviceType` varchar(50),
	`browser` varchar(100),
	`os` varchar(100),
	`referrer` text,
	CONSTRAINT `clicks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`verified` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `domains_id` PRIMARY KEY(`id`),
	CONSTRAINT `domains_hostname_unique` UNIQUE(`hostname`)
);
--> statement-breakpoint
CREATE TABLE `links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`destinationUrl` text NOT NULL,
	`shortCode` varchar(32) NOT NULL,
	`title` varchar(500),
	`tags` json DEFAULT ('[]'),
	`utmSource` varchar(255),
	`utmMedium` varchar(255),
	`utmCampaign` varchar(255),
	`utmTerm` varchar(255),
	`utmContent` varchar(255),
	`domainId` int,
	`status` enum('active','paused') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `links_id` PRIMARY KEY(`id`),
	CONSTRAINT `links_shortCode_unique` UNIQUE(`shortCode`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`color` varchar(7) NOT NULL DEFAULT '#6366f1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `plan` enum('free','pro') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `stripeCustomerId` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `stripeSubscriptionId` varchar(255);