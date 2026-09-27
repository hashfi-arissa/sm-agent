import { DRAFTING_INSTRUCTIONS, getAIProvider } from "@repo/ai";
import {
  deleteMessagesAfter,
  getDb,
  getDraft,
  getLastUserMessage,
} from "@repo/db";

import { jsonError, providerError } from "@/lib/api";
import { lockDraft, runDraftTurn } from "@/lib/draft-turns";
import { ndjsonResponse } from "@/lib/ndjson";

/**
 * Answers the last user message again: rewinds the Codex thread to before that turn, drops
 * the old reply, and streams a new one (NDJSON DraftStreamEvents). Also used to retry a
 * failed or stopped turn.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/drafts/[id]/regenerate">,
) {
  const { id } = await ctx.params;
  const db = getDb();
  if (!getDraft(db, id)) return jsonError("Draft not found", 404);

  const release = await lockDraft(id);
  if (!release) {
    return jsonError("Codex is still replying in this draft.", 409, "busy");
  }

  try {
    const ai = getAIProvider();
    const draft = getDraft(db, id);
    const userMessage = getLastUserMessage(db, id);
    const threadId = draft?.session.codexThreadId;
    if (!draft || !userMessage || !threadId) {
      release();
      return jsonError("Nothing to regenerate yet", 400);
    }

    if (userMessage.codexTurnId) {
      try {
        await ai.revertThread({
          threadId,
          beforeTurnId: userMessage.codexTurnId,
          model: draft.session.model,
          instructions: DRAFTING_INSTRUCTIONS,
        });
      } catch (error) {
        release();
        return providerError(ai, error);
      }
    }
    deleteMessagesAfter(db, userMessage);

    return ndjsonResponse(
      runDraftTurn({
        db,
        ai,
        draft,
        threadId,
        userMessage,
        signal: request.signal,
        release,
      }),
    );
  } catch (error) {
    release();
    throw error;
  }
}
