CREATE TABLE `link_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`linkId` int NOT NULL,
	`type` enum('geo','device','ab','deeplink','pixel') NOT NULL,
	`config` json NOT NULL,
	`priority` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `link_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `retargeting_pixels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('facebook','google','tiktok','linkedin','custom') NOT NULL,
	`pixelId` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retargeting_pixels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `utm_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`utmSource` varchar(255),
	`utmMedium` varchar(255),
	`utmCampaign` varchar(255),
	`utmTerm` varchar(255),
	`utmContent` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `utm_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('admin','editor','viewer') NOT NULL DEFAULT 'editor',
	`token` varchar(64) NOT NULL,
	`invitedBy` int NOT NULL,
	`status` enum('pending','accepted','expired') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` bigint NOT NULL,
	CONSTRAINT `workspace_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','editor','viewer') NOT NULL DEFAULT 'editor',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`plan` enum('free','starter','pro','team') NOT NULL DEFAULT 'free',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `plan` enum('free','starter','pro','team') NOT NULL DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `clicks` ADD `variant` varchar(64);--> statement-breakpoint
ALTER TABLE `domains` ADD `workspaceId` int;--> statement-breakpoint
ALTER TABLE `links` ADD `createdBy` int;--> statement-breakpoint
ALTER TABLE `links` ADD `updatedBy` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `workspaceId` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `createdBy` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `updatedBy` int;--> statement-breakpoint
CREATE INDEX `link_rules_linkId_idx` ON `link_rules` (`linkId`);--> statement-breakpoint
CREATE INDEX `wm_workspace_user_idx` ON `workspace_members` (`workspaceId`,`userId`);--> statement-breakpoint
CREATE INDEX `wm_user_idx` ON `workspace_members` (`userId`);