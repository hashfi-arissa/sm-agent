ALTER TABLE `chat_messages` ADD `codex_turn_id` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `interrupted` integer DEFAULT false NOT NULL;