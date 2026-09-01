CREATE TABLE `pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('bio','landing') NOT NULL,
	`slug` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`headline` varchar(255),
	`description` text,
	`avatarUrl` text,
	`heroImageUrl` text,
	`accentColor` varchar(7) NOT NULL DEFAULT '#5A3FF0',
	`backgroundColor` varchar(7) NOT NULL DEFAULT '#F7F7FC',
	`textColor` varchar(7) NOT NULL DEFAULT '#14152B',
	`buttonStyle` enum('rounded','pill','square') NOT NULL DEFAULT 'rounded',
	`domainId` int,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `pages_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `pages_workspace_idx` ON `pages` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `pages_domain_idx` ON `pages` (`domainId`);--> statement-breakpoint
CREATE TABLE `page_buttons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pageId` int NOT NULL,
	`linkId` int NOT NULL,
	`label` varchar(255) NOT NULL,
	`subtitle` varchar(500),
	`style` enum('primary','secondary','outline') NOT NULL DEFAULT 'primary',
	`position` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `page_buttons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `page_buttons_page_idx` ON `page_buttons` (`pageId`);--> statement-breakpoint
CREATE INDEX `page_buttons_link_idx` ON `page_buttons` (`linkId`);--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pageId` int NOT NULL,
	`timestamp` bigint NOT NULL,
	`country` varchar(100),
	`deviceType` varchar(50),
	`isBot` boolean NOT NULL DEFAULT false,
	`ipHash` varchar(64),
	CONSTRAINT `page_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `page_views_page_ts_idx` ON `page_views` (`pageId`,`timestamp`);