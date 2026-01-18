CREATE TABLE `cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maskedName` varchar(100) NOT NULL,
	`originalName` varchar(100),
	`roleType` enum('家教','保母','才藝老師','補習班老師','學校老師','教練','其他') NOT NULL,
	`riskTags` json NOT NULL,
	`location` varchar(100) NOT NULL,
	`caseDate` varchar(20),
	`description` text,
	`sourceType` enum('政府公告','媒體報導','社群輿情') NOT NULL,
	`sourceLink` varchar(500),
	`verified` boolean NOT NULL DEFAULT false,
	`judicialJid` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dataSyncLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceName` varchar(100) NOT NULL,
	`syncStatus` enum('running','success','failed') NOT NULL,
	`recordCount` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `dataSyncLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`suspectName` varchar(100) NOT NULL,
	`location` varchar(200),
	`description` text NOT NULL,
	`attachments` json,
	`status` enum('pending','reviewing','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewNote` text,
	`reporterIp` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `searchLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`searchedName` varchar(100) NOT NULL,
	`searchedArea` varchar(50),
	`foundResults` boolean NOT NULL DEFAULT false,
	`resultCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `searchLogs_id` PRIMARY KEY(`id`)
);
