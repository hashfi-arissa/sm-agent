import path from "node:path";

import { contentSchema } from "@repo/types";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb, type Db } from "./client";
import {
  createContent,
  deleteContent,
  duplicateContent,
  getContent,
  listContents,
  saveContent,
} from "./contents";
import { contents, scheduleEntries } from "./schema";

const migrationsFolder = path.join(import.meta.dirname, "..", "drizzle");

let db: Db;
beforeEach(() => {
  db = createDb(":memory:", migrationsFolder);
});

describe("contents", () => {
  it("creates a content item and reads it back", () => {
    const content = createContent(db, { topic: "Morning routine" });
    expect(content).toMatchObject({
      topic: "Morning routine",
      status: "draft",
      beats: [],
      hashtags: [],
      targetLength: 30,
    });
    expect(contentSchema.safeParse(content).success).toBe(true);
    expect(getContent(db, content.id)).toMatchObject({ topic: "Morning routine" });
    expect(getContent(db, crypto.randomUUID())).toBeNull();
  });

  it("saves fields and marks the item saved", () => {
    const content = createContent(db, { topic: "Draft" });
    const saved = saveContent(db, content.id, {
      topic: "Saved topic",
      hook: "Hook",
      beats: [{ voiceover: "vo", onScreenText: "text", seconds: 5 }],
      cta: "Follow for more",
      caption: "Caption",
      hashtags: ["reels"],
      targetLength: 60,
    });
    expect(saved).toMatchObject({ topic: "Saved topic", status: "saved" });
    expect(saveContent(db, crypto.randomUUID(), { ...saved!, topic: "x" })).toBeNull();
  });

  it("duplicates an item as a new draft", () => {
    const content = createContent(db, {
      topic: "Original",
      hashtags: ["reels"],
      status: "saved",
    });
    const copy = duplicateContent(db, content.id);
    expect(copy).toMatchObject({ topic: "Original", hashtags: ["reels"], status: "draft" });
    expect(copy?.id).not.toBe(content.id);
    expect(duplicateContent(db, crypto.randomUUID())).toBeNull();
  });

  it("lists newest first, filters by search and derived status", () => {
    const draft = createContent(db, { topic: "Draft item" });
    const saved = createContent(db, { topic: "Saved item", status: "saved" });
    const scheduled = createContent(db, {
      topic: "Scheduled item",
      status: "saved",
    });
    db.insert(scheduleEntries)
      .values({ contentId: scheduled.id, date: "2026-10-01", status: "planned" })
      .run();
    // Timestamps can collide within a millisecond; make the update order unambiguous.
    const touch = (id: string, updatedAt: string) =>
      db.update(contents).set({ updatedAt }).where(eq(contents.id, id)).run();
    touch(draft.id, "2026-01-01T00:00:00.000Z");
    touch(saved.id, "2026-01-02T00:00:00.000Z");
    touch(scheduled.id, "2026-01-03T00:00:00.000Z");

    expect(listContents(db, { status: "draft" }).map((c) => c.topic)).toEqual([
      "Draft item",
    ]);
    expect(listContents(db, { status: "saved" }).map((c) => c.topic)).toEqual([
      "Saved item",
    ]);
    expect(listContents(db, { status: "scheduled" }).map((c) => c.topic)).toEqual([
      "Scheduled item",
    ]);
    expect(listContents(db, { search: "sched" }).map((c) => c.topic)).toEqual([
      "Scheduled item",
    ]);
    expect(listContents(db).map((c) => c.topic)).toEqual([
      "Scheduled item",
      "Saved item",
      "Draft item",
    ]);
  });

  it("deletes an item", () => {
    const content = createContent(db, { topic: "Gone soon" });
    expect(deleteContent(db, content.id)?.id).toBe(content.id);
    expect(getContent(db, content.id)).toBeNull();
    expect(deleteContent(db, crypto.randomUUID())).toBeNull();
  });
});
