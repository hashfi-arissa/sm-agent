// Drizzle schema for the local SQLite database. Column names are snake_case in SQL
// (via `casing: "snake_case"`), camelCase in TypeScript. Mirrors the zod schemas in @repo/types.
import type { Beat } from "@repo/types";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const now = () => new Date().toISOString();
const createdAt = () => text().notNull().$defaultFn(now);
const updatedAt = () => text().notNull().$defaultFn(now).$onUpdateFn(now);

// ── Drafting ─────────────────────────────────────────────────────────────────

export const draftSessions = sqliteTable("draft_sessions", {
  id: id(),
  codexThreadId: text(),
  model: text().notNull(),
  effort: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    sessionId: text()
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    role: text({ enum: ["user", "assistant"] }).notNull(),
    text: text().notNull(),
    /** User messages: the Codex turn they started, so it can be reverted to regenerate. */
    codexTurnId: text(),
    /** Assistant messages: the reply was stopped before it finished. */
    interrupted: integer({ mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId, t.createdAt)],
);

export const draftDocuments = sqliteTable("draft_documents", {
  id: id(),
  sessionId: text()
    .notNull()
    .unique()
    .references(() => draftSessions.id, { onDelete: "cascade" }),
  title: text().notNull().default(""),
  body: text().notNull().default(""),
  saved: integer({ mode: "boolean" }).notNull().default(false),
  updatedAt: updatedAt(),
});

// ── Content (Reel) ───────────────────────────────────────────────────────────

export const contents = sqliteTable(
  "contents",
  {
    id: id(),
    sourceDraftId: text().references(() => draftDocuments.id, {
      onDelete: "set null",
    }),
    topic: text().notNull().default(""),
    hook: text().notNull().default(""),
    beats: text({ mode: "json" }).$type<Beat[]>().notNull().default([]),
    cta: text().notNull().default(""),
    caption: text().notNull().default(""),
    hashtags: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    targetLength: integer().$type<15 | 30 | 60 | 90>().notNull().default(30),
    status: text({ enum: ["draft", "saved"] })
      .notNull()
      .default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contents_status_idx").on(t.status)],
);

// ── Calendar ─────────────────────────────────────────────────────────────────

export const scheduleEntries = sqliteTable(
  "schedule_entries",
  {
    id: id(),
    contentId: text()
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    platform: text({ enum: ["instagram_reels"] })
      .notNull()
      .default("instagram_reels"),
    /** Local date `YYYY-MM-DD`. */
    date: text().notNull(),
    /** Local time `HH:mm`; null = all-day. */
    time: text(),
    status: text({ enum: ["planned", "posted", "missed"] })
      .notNull()
      .default("planned"),
    postedAt: text(),
  },
  (t) => [
    uniqueIndex("schedule_entries_content_platform_uq").on(
      t.contentId,
      t.platform,
    ),
    index("schedule_entries_date_idx").on(t.date),
  ],
);
