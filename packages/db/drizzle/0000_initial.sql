CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `draft_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_session_idx` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `contents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_draft_id` text,
	`topic` text DEFAULT '' NOT NULL,
	`hook` text DEFAULT '' NOT NULL,
	`beats` text DEFAULT '[]' NOT NULL,
	`cta` text DEFAULT '' NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`hashtags` text DEFAULT '[]' NOT NULL,
	`target_length` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_draft_id`) REFERENCES `draft_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contents_status_idx` ON `contents` (`status`);--> statement-breakpoint
CREATE TABLE `draft_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`saved` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `draft_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_documents_sessionId_unique` ON `draft_documents` (`session_id`);--> statement-breakpoint
CREATE TABLE `draft_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`codex_thread_id` text,
	`model` text NOT NULL,
	`effort` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`platform` text DEFAULT 'instagram_reels' NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`posted_at` text,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_entries_content_platform_uq` ON `schedule_entries` (`content_id`,`platform`);--> statement-breakpoint
CREATE INDEX `schedule_entries_date_idx` ON `schedule_entries` (`date`);