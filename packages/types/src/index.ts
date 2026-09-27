// Shared zod schemas — the source of truth for entity shapes across db, API routes and UI.
// Timestamps are ISO-8601 UTC strings; schedule dates are local `YYYY-MM-DD` (+ optional `HH:mm`).
import { z } from "zod";

const id = z.uuid();
const timestamp = z.iso.datetime();

// ── Drafting ─────────────────────────────────────────────────────────────────

export const draftSessionSchema = z.object({
  id,
  /** Codex thread backing this chat; null until the first message starts it. */
  codexThreadId: z.string().nullable(),
  /** Locked once the first message is sent. */
  model: z.string().min(1),
  /** Reasoning effort as reported by Codex `model/list` (e.g. "low", "medium", "high"). */
  effort: z.string().min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type DraftSession = z.infer<typeof draftSessionSchema>;

export const chatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  id,
  sessionId: id,
  role: chatRoleSchema,
  text: z.string(),
  /** User messages: the Codex turn they started (used to regenerate the reply). */
  codexTurnId: z.string().nullable(),
  /** Assistant messages: stopped before the reply finished. */
  interrupted: z.boolean(),
  createdAt: timestamp,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const draftDocumentSchema = z.object({
  id,
  sessionId: id,
  title: z.string(),
  /** Markdown. */
  body: z.string(),
  saved: z.boolean(),
  updatedAt: timestamp,
});
export type DraftDocument = z.infer<typeof draftDocumentSchema>;

// ── Content (Reel) ───────────────────────────────────────────────────────────

export const beatSchema = z.object({
  voiceover: z.string(),
  onScreenText: z.string(),
  /** Approximate duration of this beat in seconds. */
  seconds: z.number().int().min(0).max(180),
});
export type Beat = z.infer<typeof beatSchema>;

export const REEL_LENGTHS = [15, 30, 60, 90] as const;
export const reelLengthSchema = z.union(REEL_LENGTHS.map((n) => z.literal(n)));
export type ReelLength = z.infer<typeof reelLengthSchema>;

/** Scheduling state is not stored here — see ScheduleEntry. */
export const contentStatusSchema = z.enum(["draft", "saved"]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const contentSchema = z.object({
  id,
  sourceDraftId: id.nullable(),
  topic: z.string(),
  hook: z.string(),
  beats: z.array(beatSchema),
  cta: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  targetLength: reelLengthSchema,
  status: contentStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Content = z.infer<typeof contentSchema>;

// ── Calendar ─────────────────────────────────────────────────────────────────

export const platformSchema = z.enum(["instagram_reels"]);
export type Platform = z.infer<typeof platformSchema>;

export const scheduleStatusSchema = z.enum(["planned", "posted", "missed"]);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

export const scheduleEntrySchema = z.object({
  id,
  contentId: id,
  platform: platformSchema,
  /** Local calendar date, `YYYY-MM-DD`. */
  date: z.iso.date(),
  /** Local time `HH:mm`; null for an all-day entry. */
  time: z.iso.time({ precision: -1 }).nullable(),
  status: scheduleStatusSchema,
  postedAt: timestamp.nullable(),
});
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;

/** A schedule entry plus the content fields the calendar shows. */
export interface CalendarEntry extends ScheduleEntry {
  content: Pick<Content, "id" | "topic" | "hook" | "targetLength">;
}

/** Status shown in the UI, derived from Content + its ScheduleEntry. */
export type DisplayStatus =
  "draft" | "saved" | "scheduled" | "posted" | "missed";

export function displayStatus(
  content: Pick<Content, "status">,
  entry: Pick<ScheduleEntry, "status"> | null | undefined,
): DisplayStatus {
  if (content.status === "draft") return "draft";
  if (!entry) return "saved";
  if (entry.status === "planned") return "scheduled";
  return entry.status;
}

// ── API inputs ───────────────────────────────────────────────────────────────

const draftTitle = z.string().trim().max(200);
const draftBody = z.string().max(200_000);

/** POST /api/drafts — creates a session; model + effort are locked from here on. */
export const createDraftInputSchema = z.object({
  model: z.string().min(1),
  effort: z.string().min(1),
  title: draftTitle.default(""),
  body: draftBody.default(""),
});
export type CreateDraftInput = z.input<typeof createDraftInputSchema>;

/** PATCH /api/drafts/[id] — only allowed before the first message. */
export const updateDraftModelInputSchema = z.object({
  model: z.string().min(1),
  effort: z.string().min(1),
});
export type UpdateDraftModelInput = z.infer<typeof updateDraftModelInputSchema>;

/** POST /api/drafts/[id]/messages — sends a chat message and streams the reply. */
export const sendDraftMessageInputSchema = z.object({
  text: z.string().trim().min(1, "Write a message first").max(20_000),
});
export type SendDraftMessageInput = z.infer<typeof sendDraftMessageInputSchema>;

/** PUT /api/drafts/[id]/document — saves the draft document. */
export const saveDraftDocumentInputSchema = z.object({
  title: draftTitle,
  body: draftBody,
});
export type SaveDraftDocumentInput = z.infer<
  typeof saveDraftDocumentInputSchema
>;

/** POST /api/codex/test — one-off prompt from the Connect screen. */
export const codexTestInputSchema = z.object({
  model: z.string().min(1),
  effort: z.string().min(1),
  prompt: z.string().trim().min(1, "Write a prompt first").max(4000),
});
export type CodexTestInput = z.infer<typeof codexTestInputSchema>;

const contentTopic = z.string().trim().max(200);
const contentField = z.string().max(4000);
const hashtag = z.string().trim().min(1).max(100);

/** POST /api/contents — creates a content item, from scratch or pre-filled (e.g. by Convert). */
export const createContentInputSchema = z.object({
  sourceDraftId: id.nullable().default(null),
  topic: contentTopic.default(""),
  hook: contentField.default(""),
  beats: z.array(beatSchema).default([]),
  cta: contentField.default(""),
  caption: contentField.default(""),
  hashtags: z.array(hashtag).default([]),
  targetLength: reelLengthSchema.default(30),
});
export type CreateContentInput = z.input<typeof createContentInputSchema>;

/** PUT /api/contents/[id] — saves the content's fields and marks it `saved`. */
export const updateContentInputSchema = z.object({
  topic: contentTopic,
  hook: contentField,
  beats: z.array(beatSchema),
  cta: contentField,
  caption: contentField,
  hashtags: z.array(hashtag),
  targetLength: reelLengthSchema,
});
export type UpdateContentInput = z.infer<typeof updateContentInputSchema>;

/** Library search/filter — `status` filters on the derived DisplayStatus, "all" means no filter. */
export const contentLibraryFilterSchema = z.enum([
  "all",
  "draft",
  "saved",
  "scheduled",
  "posted",
  "missed",
]);
export type ContentLibraryFilter = z.infer<typeof contentLibraryFilterSchema>;

const scheduleDate = z.iso.date();
const scheduleTime = z.iso.time({ precision: -1 });

/** POST /api/schedule — puts a saved content item on the calendar. */
export const scheduleContentInputSchema = z.object({
  contentId: id,
  date: scheduleDate,
  /** null = all-day. */
  time: scheduleTime.nullable().default(null),
});
export type ScheduleContentInput = z.input<typeof scheduleContentInputSchema>;

/** PATCH /api/schedule/[id] — reschedules and/or marks the entry planned/posted/missed. */
export const updateScheduleEntryInputSchema = z
  .object({
    date: scheduleDate.optional(),
    time: scheduleTime.nullable().optional(),
    status: scheduleStatusSchema.optional(),
  })
  .refine(
    (v) =>
      v.date !== undefined || v.time !== undefined || v.status !== undefined,
    "Nothing to update",
  );
export type UpdateScheduleEntryInput = z.infer<
  typeof updateScheduleEntryInputSchema
>;

// ── Backup (GET /api/export, POST /api/import) ──────────────────────────────

/** A full snapshot of the local database, restorable via POST /api/import. */
export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: timestamp,
  draftSessions: z.array(draftSessionSchema),
  draftDocuments: z.array(draftDocumentSchema),
  chatMessages: z.array(chatMessageSchema),
  contents: z.array(contentSchema),
  scheduleEntries: z.array(scheduleEntrySchema),
});
export type Backup = z.infer<typeof backupSchema>;
