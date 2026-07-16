CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`actorName` varchar(255),
	`action` varchar(100) NOT NULL,
	`targetType` varchar(50),
	`targetId` varchar(255),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','support','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `suspended` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionStatus` enum('active','trialing','past_due','canceled');--> statement-breakpoint
ALTER TABLE `users` ADD `currentPeriodEnd` bigint;