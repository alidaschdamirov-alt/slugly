CREATE TABLE `rate_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(255) NOT NULL,
	`windowStart` bigint NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `rate_limits_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limits_key_unique` UNIQUE(`key`)
);
