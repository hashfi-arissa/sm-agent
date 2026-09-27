import path from "node:path";

import { chatMessageSchema, draftDocumentSchema } from "@repo/types";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb, type Db } from "./client";
import {
  addChatMessage,
  createDraft,
  deleteDraft,
  deleteMessagesAfter,
  getDraft,
  getLastUserMessage,
  listDrafts,
  saveDraftDocument,
  setDraftModel,
  setDraftThread,
  setMessageTurn,
} from "./drafts";
import { draftSessions } from "./schema";

const migrationsFolder = path.join(import.meta.dirname, "..", "drizzle");

let db: Db;
beforeEach(() => {
  db = createDb(":memory:", migrationsFolder);
});

describe("drafts", () => {
  it("creates a session with its document and reads it back", () => {
    const { session } = createDraft(db, {
      model: "gpt-x",
      effort: "high",
      title: "Morning routine",
    });
    expect(
      setDraftModel(db, session.id, { model: "gpt-y", effort: "high" }),
    ).toBe(true);
    setDraftThread(db, session.id, "thr_1");
    // Locked once the chat has a Codex thread.
    expect(
      setDraftModel(db, session.id, { model: "gpt-z", effort: "low" }),
    ).toBe(false);

    const draft = getDraft(db, session.id);
    expect(draft?.session).toMatchObject({
      model: "gpt-y",
      effort: "high",
      codexThreadId: "thr_1",
    });
    expect(draft?.document).toMatchObject({
      title: "Morning routine",
      body: "",
      saved: false,
    });
    expect(draftDocumentSchema.safeParse(draft?.document).success).toBe(true);
    expect(getDraft(db, crypto.randomUUID())).toBeNull();
  });

  it("keeps messages in insertion order and truncates after a message", () => {
    const { session } = createDraft(db, { model: "m", effort: "low" });
    const add = (role: "user" | "assistant", text: string) =>
      addChatMessage(db, { sessionId: session.id, role, text });

    add("user", "one");
    add("assistant", "reply one");
    const second = add("user", "two");
    setMessageTurn(db, second.id, "turn_2");
    add("assistant", "reply two");

    const last = getLastUserMessage(db, session.id);
    expect(last).toMatchObject({ text: "two", codexTurnId: "turn_2" });
    expect(chatMessageSchema.safeParse(last).success).toBe(true);

    deleteMessagesAfter(db, last!);
    expect(getDraft(db, session.id)?.messages.map((m) => m.text)).toEqual([
      "one",
      "reply one",
      "two",
    ]);
  });

  it("lists drafts newest first with message counts", () => {
    const a = createDraft(db, { model: "m", effort: "low", title: "A" });
    const b = createDraft(db, { model: "m", effort: "low", title: "B" });
    addChatMessage(db, { sessionId: a.session.id, role: "user", text: "hi" });
    // Timestamps can collide within a millisecond; make the order unambiguous.
    db.update(draftSessions)
      .set({ updatedAt: "2099-01-01T00:00:00.000Z" })
      .where(eq(draftSessions.id, a.session.id))
      .run();

    const list = listDrafts(db);
    expect(list.map((d) => [d.title, d.messageCount])).toEqual([
      ["A", 1],
      ["B", 0],
    ]);
    expect(list[1]?.id).toBe(b.session.id);
  });

  it("saves the document and deletes the whole draft", () => {
    const { session } = createDraft(db, { model: "m", effort: "low" });
    addChatMessage(db, { sessionId: session.id, role: "user", text: "hi" });

    expect(
      saveDraftDocument(db, session.id, { title: "T", body: "# Hook" }),
    ).toMatchObject({ title: "T", body: "# Hook", saved: true });
    expect(
      saveDraftDocument(db, crypto.randomUUID(), { title: "", body: "" }),
    ).toBeNull();

    expect(deleteDraft(db, session.id)?.id).toBe(session.id);
    expect(getDraft(db, session.id)).toBeNull();
    expect(listDrafts(db)).toEqual([]);
  });
});
