CREATE TABLE `deep_link_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`linkId` int NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`eventType` enum('attempt','app_open','store_fallback','web_fallback') NOT NULL,
	`platform` enum('ios','android','other') NOT NULL DEFAULT 'other',
	`source` varchar(32) NOT NULL DEFAULT 'web',
	`timestamp` bigint NOT NULL,
	CONSTRAINT `deep_link_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `deep_link_events_link_ts_idx` ON `deep_link_events` (`linkId`,`timestamp`);--> statement-breakpoint
CREATE INDEX `deep_link_events_session_idx` ON `deep_link_events` (`sessionId`);