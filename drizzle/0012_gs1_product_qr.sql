CREATE TABLE `product_qrs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`linkId` int NOT NULL,
	`domainId` int,
	`gtin` varchar(14) NOT NULL,
	`sourceGtin` varchar(14) NOT NULL,
	`productName` varchar(255) NOT NULL,
	`brand` varchar(255),
	`batchLot` varchar(20),
	`serialNumber` varchar(20),
	`expiryDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_qrs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `product_qrs_workspace_idx` ON `product_qrs` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `product_qrs_gtin_idx` ON `product_qrs` (`gtin`);--> statement-breakpoint
CREATE INDEX `product_qrs_link_idx` ON `product_qrs` (`linkId`);