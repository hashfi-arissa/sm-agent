// Queries for the calendar: schedule entries, the tray of unscheduled content, and the
// schedule / reschedule / mark posted / unschedule actions.
import type {
  CalendarEntry,
  Content,
  ScheduleEntry,
  ScheduleStatus,
} from "@repo/types";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";

import type { Db } from "./client";
import { contents, scheduleEntries } from "./schema";

const calendarColumns = {
  entry: scheduleEntries,
  content: {
    id: contents.id,
    topic: contents.topic,
    hook: contents.hook,
    targetLength: contents.targetLength,
  },
};

function toCalendarEntry(row: {
  entry: ScheduleEntry;
  content: CalendarEntry["content"];
}): CalendarEntry {
  return { ...row.entry, content: row.content };
}

/** Every schedule entry with its content, in date/time order. */
export function listCalendarEntries(db: Db): CalendarEntry[] {
  return db
    .select(calendarColumns)
    .from(scheduleEntries)
    .innerJoin(contents, eq(contents.id, scheduleEntries.contentId))
    .orderBy(asc(scheduleEntries.date), asc(scheduleEntries.time))
    .all()
    .map(toCalendarEntry);
}

/** Schedule entries with a date in `[from, to]` (inclusive, local `YYYY-MM-DD`), date/time order. */
export function listEntriesInRange(
  db: Db,
  range: { from: string; to: string },
): CalendarEntry[] {
  return db
    .select(calendarColumns)
    .from(scheduleEntries)
    .innerJoin(contents, eq(contents.id, scheduleEntries.contentId))
    .where(
      and(
        gte(scheduleEntries.date, range.from),
        lte(scheduleEntries.date, range.to),
      ),
    )
    .orderBy(asc(scheduleEntries.date), asc(scheduleEntries.time))
    .all()
    .map(toCalendarEntry);
}

export function getCalendarEntry(db: Db, id: string): CalendarEntry | null {
  const row = db
    .select(calendarColumns)
    .from(scheduleEntries)
    .innerJoin(contents, eq(contents.id, scheduleEntries.contentId))
    .where(eq(scheduleEntries.id, id))
    .get();
  return row ? toCalendarEntry(row) : null;
}

/** The content's schedule entry, if it has one. */
export function getScheduleEntryForContent(
  db: Db,
  contentId: string,
): ScheduleEntry | null {
  return (
    db
      .select()
      .from(scheduleEntries)
      .where(eq(scheduleEntries.contentId, contentId))
      .get() ?? null
  );
}

/** Saved content with no schedule entry — the calendar's side tray. Newest first. */
export function listUnscheduledContents(db: Db): Content[] {
  return db
    .select({ content: contents })
    .from(contents)
    .leftJoin(scheduleEntries, eq(scheduleEntries.contentId, contents.id))
    .where(and(eq(contents.status, "saved"), isNull(scheduleEntries.id)))
    .orderBy(desc(contents.updatedAt))
    .all()
    .map((r) => r.content);
}

export type ScheduleContentResult =
  | { entry: CalendarEntry }
  | { error: "not_found" | "not_saved" | "already_scheduled" };

/** Schedules a saved content item. Only `saved` content can go on the calendar. */
export function scheduleContent(
  db: Db,
  input: { contentId: string; date: string; time: string | null },
): ScheduleContentResult {
  // better-sqlite3 is synchronous, so nothing can interleave between the check and the insert.
  const content = db
    .select({ status: contents.status })
    .from(contents)
    .where(eq(contents.id, input.contentId))
    .get();
  if (!content) return { error: "not_found" };
  if (content.status !== "saved") return { error: "not_saved" };

  const entry = db
    .insert(scheduleEntries)
    .values(input)
    .onConflictDoNothing()
    .returning()
    .get();
  if (!entry) return { error: "already_scheduled" };
  return { entry: getCalendarEntry(db, entry.id)! };
}

/**
 * Reschedules the entry and/or changes its status. `postedAt` is stamped when the entry
 * becomes `posted` and cleared when it leaves it. Returns null if it doesn't exist.
 */
export function updateScheduleEntry(
  db: Db,
  id: string,
  input: { date?: string; time?: string | null; status?: ScheduleStatus },
): CalendarEntry | null {
  const current = db
    .select({ status: scheduleEntries.status })
    .from(scheduleEntries)
    .where(eq(scheduleEntries.id, id))
    .get();
  if (!current) return null;

  const postedAt =
    input.status === undefined || input.status === current.status
      ? undefined
      : input.status === "posted"
        ? new Date().toISOString()
        : null;

  db.update(scheduleEntries)
    .set({ ...input, ...(postedAt !== undefined && { postedAt }) })
    .where(eq(scheduleEntries.id, id))
    .run();
  return getCalendarEntry(db, id);
}

/** Removes the entry; the content goes back to the tray. Returns the deleted row. */
export function unscheduleEntry(db: Db, id: string): ScheduleEntry | null {
  return (
    db
      .delete(scheduleEntries)
      .where(eq(scheduleEntries.id, id))
      .returning()
      .get() ?? null
  );
}
