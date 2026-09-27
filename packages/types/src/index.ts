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

/** Status shown in the UI, derived from Content + its ScheduleEntry. */
export type DisplayStatus = "draft" | "saved" | "scheduled" | "posted" | "missed";

export function displayStatus(
  content: Pick<Content, "status">,
  entry: Pick<ScheduleEntry, "status"> | null | undefined,
): DisplayStatus {
  if (content.status === "draft") return "draft";
  if (!entry) return "saved";
  if (entry.status === "planned") return "scheduled";
  return entry.status;
}
