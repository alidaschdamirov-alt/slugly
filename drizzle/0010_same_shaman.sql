CREATE TABLE `notification_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` int NOT NULL,
	`userId` int NOT NULL,
	`read` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	CONSTRAINT `notification_recipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`category` enum('system','update','promo','alert') NOT NULL DEFAULT 'system',
	`audience` json,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_notif_recipient_user` ON `notification_recipients` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_notif_recipient_notif` ON `notification_recipients` (`notificationId`);