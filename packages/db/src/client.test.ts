import path from "node:path";

import { contentSchema, scheduleEntrySchema } from "@repo/types";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb, type Db } from "./client";
import {
  chatMessages,
  contents,
  draftDocuments,
  draftSessions,
  scheduleEntries,
} from "./schema";

const migrationsFolder = path.join(import.meta.dirname, "..", "drizzle");

let db: Db;
beforeEach(() => {
  db = createDb(":memory:", migrationsFolder);
});

describe("db", () => {
  it("round-trips content with JSON columns and matches the zod schema", () => {
    const [row] = db
      .insert(contents)
      .values({
        topic: "Morning routine",
        hook: "Stop wasting your first hour",
        beats: [{ voiceover: "Wake up", onScreenText: "5:30", seconds: 3 }],
        hashtags: ["#routine"],
        targetLength: 30,
      })
      .returning()
      .all();

    expect(row?.beats[0]?.onScreenText).toBe("5:30");
    expect(row?.status).toBe("draft");
    expect(contentSchema.safeParse(row).success).toBe(true);
  });

  it("cascades session deletes to messages and the draft document", () => {
    const [session] = db
      .insert(draftSessions)
      .values({ model: "gpt-x", effort: "medium" })
      .returning()
      .all();
    db.insert(chatMessages)
      .values({ sessionId: session!.id, role: "user", text: "hi" })
      .run();
    db.insert(draftDocuments)
      .values({ sessionId: session!.id, title: "Draft" })
      .run();

    db.delete(draftSessions).where(eq(draftSessions.id, session!.id)).run();

    expect(db.select().from(chatMessages).all()).toHaveLength(0);
    expect(db.select().from(draftDocuments).all()).toHaveLength(0);
  });

  it("allows one schedule entry per content per platform", () => {
    const [content] = db
      .insert(contents)
      .values({ status: "saved" })
      .returning()
      .all();
    const [entry] = db
      .insert(scheduleEntries)
      .values({ contentId: content!.id, date: "2026-10-01", time: "09:30" })
      .returning()
      .all();

    expect(scheduleEntrySchema.safeParse(entry).success).toBe(true);
    expect(() =>
      db
        .insert(scheduleEntries)
        .values({ contentId: content!.id, date: "2026-10-02" })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it("enforces foreign keys", () => {
    expect(() =>
      db
        .insert(scheduleEntries)
        .values({ contentId: crypto.randomUUID(), date: "2026-10-01" })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});
