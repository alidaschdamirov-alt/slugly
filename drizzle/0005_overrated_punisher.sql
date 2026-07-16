CREATE INDEX `clicks_linkId_timestamp_idx` ON `clicks` (`linkId`,`timestamp`);--> statement-breakpoint
CREATE INDEX `links_userId_idx` ON `links` (`userId`);--> statement-breakpoint
CREATE INDEX `links_projectId_idx` ON `links` (`projectId`);