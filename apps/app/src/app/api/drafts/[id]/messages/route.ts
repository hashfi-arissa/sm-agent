import { DRAFTING_INSTRUCTIONS, getAIProvider } from "@repo/ai";
import { addChatMessage, getDb, getDraft, setDraftThread } from "@repo/db";
import { sendDraftMessageInputSchema } from "@repo/types";

import { jsonError, parseBody, providerError } from "@/lib/api";
import { lockDraft, runDraftTurn } from "@/lib/draft-turns";
import { ndjsonResponse } from "@/lib/ndjson";

/**
 * Sends a chat message and streams the reply as NDJSON DraftStreamEvents. The first message
 * starts the Codex thread. Closing the request interrupts the turn; the partial reply is kept.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/drafts/[id]/messages">,
) {
  const { id } = await ctx.params;
  const body = await parseBody(request, sendDraftMessageInputSchema);
  if ("response" in body) return body.response;

  const db = getDb();
  if (!getDraft(db, id)) return jsonError("Draft not found", 404);

  const release = await lockDraft(id);
  if (!release) {
    return jsonError("Codex is still replying in this draft.", 409, "busy");
  }

  try {
    const ai = getAIProvider();
    const draft = getDraft(db, id);
    if (!draft) {
      release();
      return jsonError("Draft not found", 404);
    }

    let threadId: string;
    if (draft.session.codexThreadId) {
      threadId = draft.session.codexThreadId;
    } else {
      try {
        ({ threadId } = await ai.startThread({
          model: draft.session.model,
          instructions: DRAFTING_INSTRUCTIONS,
        }));
      } catch (error) {
        release();
        return providerError(ai, error);
      }
      setDraftThread(db, id, threadId);
    }

    const userMessage = addChatMessage(db, {
      sessionId: id,
      role: "user",
      text: body.data.text,
    });

    const turn = runDraftTurn({
      db,
      ai,
      draft,
      threadId,
      userMessage,
      signal: request.signal,
      release,
    });
    return ndjsonResponse(
      (async function* () {
        yield { type: "message" as const, message: userMessage };
        yield* turn;
      })(),
    );
  } catch (error) {
    release();
    throw error;
  }
}
