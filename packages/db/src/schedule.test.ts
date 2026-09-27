import path from "node:path";

import { scheduleEntrySchema } from "@repo/types";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb, type Db } from "./client";
import { createContent, deleteContent } from "./contents";
import {
  getScheduleEntryForContent,
  listCalendarEntries,
  listUnscheduledContents,
  scheduleContent,
  unscheduleEntry,
  updateScheduleEntry,
} from "./schedule";

const migrationsFolder = path.join(import.meta.dirname, "..", "drizzle");

let db: Db;
beforeEach(() => {
  db = createDb(":memory:", migrationsFolder);
});

function schedule(
  contentId: string,
  date = "2026-10-01",
  time: string | null = null,
) {
  const result = scheduleContent(db, { contentId, date, time });
  if (!("entry" in result)) throw new Error(result.error);
  return result.entry;
}

describe("schedule", () => {
  it("schedules saved content and returns it with its content fields", () => {
    const content = createContent(db, { topic: "Launch", status: "saved" });
    const entry = schedule(content.id, "2026-10-05", "09:30");
    expect(entry).toMatchObject({
      contentId: content.id,
      platform: "instagram_reels",
      date: "2026-10-05",
      time: "09:30",
      status: "planned",
      postedAt: null,
      content: { id: content.id, topic: "Launch", targetLength: 30 },
    });
    expect(scheduleEntrySchema.strip().safeParse(entry).success).toBe(true);
    expect(getScheduleEntryForContent(db, content.id)?.id).toBe(entry.id);
  });

  it("refuses unsaved, missing and already scheduled content", () => {
    const draft = createContent(db, { topic: "Draft" });
    const saved = createContent(db, { topic: "Saved", status: "saved" });
    const input = { date: "2026-10-01", time: null };
    expect(scheduleContent(db, { contentId: draft.id, ...input })).toEqual({
      error: "not_saved",
    });
    expect(
      scheduleContent(db, { contentId: crypto.randomUUID(), ...input }),
    ).toEqual({ error: "not_found" });
    schedule(saved.id);
    expect(scheduleContent(db, { contentId: saved.id, ...input })).toEqual({
      error: "already_scheduled",
    });
  });

  it("lists the tray: saved content without an entry", () => {
    createContent(db, { topic: "Draft" });
    const saved = createContent(db, { topic: "Saved", status: "saved" });
    const scheduled = createContent(db, {
      topic: "Scheduled",
      status: "saved",
    });
    schedule(scheduled.id);
    expect(listUnscheduledContents(db).map((c) => c.id)).toEqual([saved.id]);
  });

  it("lists entries in date/time order", () => {
    const [a, b, c] = ["A", "B", "C"].map((topic) =>
      createContent(db, { topic, status: "saved" }),
    );
    schedule(a!.id, "2026-10-02", "10:00");
    schedule(b!.id, "2026-10-01", null);
    schedule(c!.id, "2026-10-02", "08:00");
    expect(listCalendarEntries(db).map((e) => e.content.topic)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it("reschedules and stamps postedAt only while posted", () => {
    const content = createContent(db, { topic: "Reel", status: "saved" });
    const entry = schedule(content.id, "2026-10-01", "09:00");

    const moved = updateScheduleEntry(db, entry.id, {
      date: "2026-10-03",
      time: null,
    });
    expect(moved).toMatchObject({
      date: "2026-10-03",
      time: null,
      status: "planned",
    });

    const posted = updateScheduleEntry(db, entry.id, { status: "posted" });
    expect(posted?.postedAt).toEqual(expect.any(String));
    // Rescheduling a posted entry keeps its posted timestamp.
    expect(
      updateScheduleEntry(db, entry.id, { date: "2026-10-04" })?.postedAt,
    ).toBe(posted?.postedAt);

    expect(
      updateScheduleEntry(db, entry.id, { status: "missed" }),
    ).toMatchObject({
      status: "missed",
      postedAt: null,
    });
    expect(
      updateScheduleEntry(db, crypto.randomUUID(), { status: "posted" }),
    ).toBeNull();
  });

  it("unschedules back to the tray, and cascades when content is deleted", () => {
    const content = createContent(db, { topic: "Reel", status: "saved" });
    const entry = schedule(content.id);
    expect(unscheduleEntry(db, entry.id)?.id).toBe(entry.id);
    expect(unscheduleEntry(db, entry.id)).toBeNull();
    expect(listUnscheduledContents(db).map((c) => c.id)).toEqual([content.id]);

    schedule(content.id);
    deleteContent(db, content.id);
    expect(listCalendarEntries(db)).toEqual([]);
  });
});
