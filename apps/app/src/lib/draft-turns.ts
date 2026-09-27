// Server-only helpers that run one Codex turn for a draft session and persist the result.
import { type AIProvider, DRAFTING_INSTRUCTIONS } from "@repo/ai";
import { addChatMessage, type Db, type Draft, setMessageTurn } from "@repo/db";
import type { ChatMessage } from "@repo/types";

import type { DraftStreamEvent } from "./draft-events";

// One turn at a time per draft. Kept on globalThis so Next.js dev reloads share it.
const globalForTurns = globalThis as unknown as {
  __smaDraftTurns?: Map<string, Promise<void>>;
};
const running = (globalForTurns.__smaDraftTurns ??= new Map());

/**
 * Takes the draft's turn lock. If a turn is still finishing (e.g. just stopped), waits up to
 * `waitMs` for it. Returns a release function, or null if the draft is still busy.
 */
export async function lockDraft(
  id: string,
  waitMs = 10_000,
): Promise<(() => void) | null> {
  const deadline = Date.now() + waitMs;
  while (running.has(id)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await Promise.race([
      running.get(id),
      new Promise((r) => setTimeout(r, remaining)),
    ]);
  }
  let resolve!: () => void;
  const turn = new Promise<void>((r) => (resolve = r));
  running.set(id, turn);
  return () => {
    if (running.get(id) === turn) running.delete(id);
    resolve();
  };
}

/**
 * Streams a reply to `userMessage` and saves it (partial replies too, flagged interrupted).
 * Records the Codex turn id on the user message so the reply can be regenerated later.
 * Always calls `release` when done.
 */
export async function* runDraftTurn({
  db,
  ai,
  draft,
  threadId,
  userMessage,
  signal,
  release,
}: {
  db: Db;
  ai: AIProvider;
  draft: Draft;
  threadId: string;
  userMessage: ChatMessage;
  signal: AbortSignal;
  release: () => void;
}): AsyncGenerator<DraftStreamEvent> {
  try {
    const events = ai.sendMessage({
      threadId,
      model: draft.session.model,
      effort: draft.session.effort,
      instructions: DRAFTING_INSTRUCTIONS,
      text: userMessage.text,
      signal,
    });
    for await (const event of events) {
      if (event.type === "started") {
        setMessageTurn(db, userMessage.id, event.turnId);
      }
      yield event;
      if (event.type === "done" && event.text.trim()) {
        const reply = addChatMessage(db, {
          sessionId: draft.session.id,
          role: "assistant",
          text: event.text,
          interrupted: event.interrupted,
        });
        yield { type: "message", message: reply };
      }
    }
  } finally {
    release();
  }
}
