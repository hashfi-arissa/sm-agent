import { getDb, saveDraftDocument } from "@repo/db";
import { saveDraftDocumentInputSchema } from "@repo/types";

import { jsonError, parseBody } from "@/lib/api";

/** Saves the draft document (title + markdown body). */
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/drafts/[id]/document">,
) {
  const { id } = await ctx.params;
  const body = await parseBody(request, saveDraftDocumentInputSchema);
  if ("response" in body) return body.response;

  const document = saveDraftDocument(getDb(), id, body.data);
  if (!document) return jsonError("Draft not found", 404);
  return Response.json({ document });
}
