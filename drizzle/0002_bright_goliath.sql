CREATE TABLE `retired_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shortCode` varchar(32) NOT NULL,
	`retiredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retired_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `retired_codes_shortCode_unique` UNIQUE(`shortCode`)
);
--> statement-breakpoint
ALTER TABLE `links` MODIFY COLUMN `tags` json;