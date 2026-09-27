// Queries for draft sessions: the chat, its messages and the draft document.
import type { ChatMessage, DraftDocument, DraftSession } from "@repo/types";
import { and, asc, count, desc, eq, gt, isNull, sql } from "drizzle-orm";

import type { Db } from "./client";
import { chatMessages, draftDocuments, draftSessions } from "./schema";

export interface Draft {
  session: DraftSession;
  document: DraftDocument;
  messages: ChatMessage[];
}

export interface DraftListItem {
  id: string;
  title: string;
  model: string;
  effort: string;
  saved: boolean;
  messageCount: number;
  /** Latest change to the chat or the document. */
  updatedAt: string;
}

// Messages can share a millisecond timestamp, so order by rowid (insertion order) instead.
const rowid = sql<number>`rowid`;

/** Creates a session with its (empty or pre-filled) document. Model + effort are fixed here. */
export function createDraft(
  db: Db,
  input: { model: string; effort: string; title?: string; body?: string },
): Draft {
  return db.transaction((tx) => {
    const session = tx
      .insert(draftSessions)
      .values({ model: input.model, effort: input.effort })
      .returning()
      .get();
    const document = tx
      .insert(draftDocuments)
      .values({
        sessionId: session.id,
        title: input.title ?? "",
        body: input.body ?? "",
      })
      .returning()
      .get();
    return { session, document, messages: [] };
  });
}

export function getDraft(db: Db, id: string): Draft | null {
  const session = db
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.id, id))
    .get();
  if (!session) return null;
  const document = db
    .select()
    .from(draftDocuments)
    .where(eq(draftDocuments.sessionId, id))
    .get();
  if (!document) return null;
  const messages = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, id))
    .orderBy(asc(rowid))
    .all();
  return { session, document, messages };
}

/** Newest first. */
export function listDrafts(db: Db): DraftListItem[] {
  const messageCount = db
    .select({ sessionId: chatMessages.sessionId, n: count().as("n") })
    .from(chatMessages)
    .groupBy(chatMessages.sessionId)
    .as("message_count");
  const updatedAt = sql<string>`max(${draftSessions.updatedAt}, ${draftDocuments.updatedAt})`;

  return db
    .select({
      id: draftSessions.id,
      title: draftDocuments.title,
      model: draftSessions.model,
      effort: draftSessions.effort,
      saved: draftDocuments.saved,
      messageCount: sql<number>`coalesce(${messageCount.n}, 0)`,
      updatedAt,
    })
    .from(draftSessions)
    .innerJoin(draftDocuments, eq(draftDocuments.sessionId, draftSessions.id))
    .leftJoin(messageCount, eq(messageCount.sessionId, draftSessions.id))
    .orderBy(desc(updatedAt))
    .all();
}

/**
 * Changes model + effort while the chat hasn't started. Returns false once it has
 * (a Codex thread exists), since both are locked from the first message on.
 */
export function setDraftModel(
  db: Db,
  id: string,
  input: { model: string; effort: string },
): boolean {
  const updated = db
    .update(draftSessions)
    .set(input)
    .where(and(eq(draftSessions.id, id), isNull(draftSessions.codexThreadId)))
    .returning({ id: draftSessions.id })
    .get();
  return updated !== undefined;
}

export function setDraftThread(db: Db, id: string, codexThreadId: string) {
  db.update(draftSessions)
    .set({ codexThreadId })
    .where(eq(draftSessions.id, id))
    .run();
}

/** Appends a chat message and bumps the session's `updatedAt`. */
export function addChatMessage(
  db: Db,
  input: Pick<ChatMessage, "sessionId" | "role" | "text"> &
    Partial<Pick<ChatMessage, "codexTurnId" | "interrupted">>,
): ChatMessage {
  return db.transaction((tx) => {
    const message = tx.insert(chatMessages).values(input).returning().get();
    tx.update(draftSessions)
      .set({ updatedAt: message.createdAt })
      .where(eq(draftSessions.id, input.sessionId))
      .run();
    return message;
  });
}

export function setMessageTurn(db: Db, messageId: string, codexTurnId: string) {
  db.update(chatMessages)
    .set({ codexTurnId })
    .where(eq(chatMessages.id, messageId))
    .run();
}

/** The session's last user message — the one Regenerate / Retry answers again. */
export function getLastUserMessage(
  db: Db,
  sessionId: string,
): ChatMessage | null {
  return (
    db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.sessionId, sessionId),
          eq(chatMessages.role, "user"),
        ),
      )
      .orderBy(desc(rowid))
      .get() ?? null
  );
}

/** Deletes every message that comes after `messageId` in its session. */
export function deleteMessagesAfter(db: Db, message: ChatMessage) {
  const row = db
    .select({ rowid })
    .from(chatMessages)
    .where(eq(chatMessages.id, message.id))
    .get();
  if (!row) return;
  db.delete(chatMessages)
    .where(
      and(eq(chatMessages.sessionId, message.sessionId), gt(rowid, row.rowid)),
    )
    .run();
}

/** Saves the document and marks it saved. Returns null if the draft doesn't exist. */
export function saveDraftDocument(
  db: Db,
  sessionId: string,
  input: { title: string; body: string },
): DraftDocument | null {
  return (
    db
      .update(draftDocuments)
      .set({ ...input, saved: true })
      .where(eq(draftDocuments.sessionId, sessionId))
      .returning()
      .get() ?? null
  );
}

/** Resolves a draft document id (Content.sourceDraftId) to its session id, for linking back. */
export function getDraftSessionIdForDocument(
  db: Db,
  documentId: string,
): string | null {
  const document = db
    .select({ sessionId: draftDocuments.sessionId })
    .from(draftDocuments)
    .where(eq(draftDocuments.id, documentId))
    .get();
  return document?.sessionId ?? null;
}

/** Deletes the draft (messages and document cascade). Returns the deleted session. */
export function deleteDraft(db: Db, id: string): DraftSession | null {
  return (
    db
      .delete(draftSessions)
      .where(eq(draftSessions.id, id))
      .returning()
      .get() ?? null
  );
}
