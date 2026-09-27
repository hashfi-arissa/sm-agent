import path from "node:path";

import { backupSchema } from "@repo/types";
import { beforeEach, describe, expect, it } from "vitest";

import { exportBackup, importBackup } from "./backup";
import { createDb, type Db } from "./client";
import { createContent, getContent, listContents } from "./contents";
import { addChatMessage, createDraft, getDraft, listDrafts } from "./drafts";
import { scheduleContent } from "./schedule";

const migrationsFolder = path.join(import.meta.dirname, "..", "drizzle");

let db: Db;
beforeEach(() => {
  db = createDb(":memory:", migrationsFolder);
});

describe("backup", () => {
  it("exports every row as a schema-valid snapshot", () => {
    const { session } = createDraft(db, {
      model: "m",
      effort: "low",
      title: "Draft",
    });
    addChatMessage(db, { sessionId: session.id, role: "user", text: "hi" });
    const content = createContent(db, { topic: "Reel", status: "saved" });
    scheduleContent(db, {
      contentId: content.id,
      date: "2026-10-05",
      time: null,
    });

    const backup = exportBackup(db);
    expect(backupSchema.safeParse(backup).success).toBe(true);
    expect(backup.draftSessions).toHaveLength(1);
    expect(backup.chatMessages).toHaveLength(1);
    expect(backup.contents).toHaveLength(1);
    expect(backup.scheduleEntries).toHaveLength(1);
  });

  it("restores a backup, replacing everything currently stored", () => {
    createDraft(db, { model: "m", effort: "low", title: "Stale" });
    createContent(db, { topic: "Stale content" });

    const other = createDb(":memory:", migrationsFolder);
    const { session } = createDraft(other, {
      model: "m",
      effort: "low",
      title: "Fresh",
    });
    const content = createContent(other, { topic: "Fresh content" });
    const backup = exportBackup(other);

    importBackup(db, backup);

    expect(listDrafts(db).map((d) => d.title)).toEqual(["Fresh"]);
    expect(listContents(db).map((c) => c.topic)).toEqual(["Fresh content"]);
    expect(getDraft(db, session.id)?.document.title).toBe("Fresh");
    expect(getContent(db, content.id)?.topic).toBe("Fresh content");
  });
});
