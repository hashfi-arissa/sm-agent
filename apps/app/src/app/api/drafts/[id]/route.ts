import { getAIProvider } from "@repo/ai";
import { deleteDraft, getDb, getDraft, setDraftModel } from "@repo/db";
import { updateDraftModelInputSchema } from "@repo/types";

import { checkModel, jsonError, parseBody } from "@/lib/api";

/** The draft with its messages and document. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/drafts/[id]">,
) {
  const { id } = await ctx.params;
  const draft = getDraft(getDb(), id);
  if (!draft) return jsonError("Draft not found", 404);
  return Response.json(draft);
}

/** Changes model + effort. Refused once the chat has started — both are locked then. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/drafts/[id]">,
) {
  const { id } = await ctx.params;
  const body = await parseBody(request, updateDraftModelInputSchema);
  if ("response" in body) return body.response;

  const invalid = await checkModel(
    getAIProvider(),
    body.data.model,
    body.data.effort,
  );
  if (invalid) return invalid;

  const db = getDb();
  if (!getDraft(db, id)) return jsonError("Draft not found", 404);
  if (!setDraftModel(db, id, body.data)) {
    return jsonError(
      "Model and effort are locked once the chat has started",
      409,
    );
  }
  return new Response(null, { status: 204 });
}

/** Deletes the draft, its chat and document, and the backing Codex thread. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/drafts/[id]">,
) {
  const { id } = await ctx.params;
  const session = deleteDraft(getDb(), id);
  if (!session) return jsonError("Draft not found", 404);

  if (session.codexThreadId) {
    // Best effort: the draft is gone either way; this only tidies Codex's own history.
    await getAIProvider()
      .deleteThread(session.codexThreadId)
      .catch(() => {});
  }
  return new Response(null, { status: 204 });
}
