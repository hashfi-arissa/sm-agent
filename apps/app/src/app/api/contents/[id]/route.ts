import { deleteContent, getContent, getDb, saveContent } from "@repo/db";
import { updateContentInputSchema } from "@repo/types";

import { jsonError, parseBody } from "@/lib/api";

/** The content item. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/contents/[id]">,
) {
  const { id } = await ctx.params;
  const content = getContent(getDb(), id);
  if (!content) return jsonError("Content not found", 404);
  return Response.json(content);
}

/** Saves the content's fields and marks it `saved`. */
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/contents/[id]">,
) {
  const { id } = await ctx.params;
  const body = await parseBody(request, updateContentInputSchema);
  if ("response" in body) return body.response;

  const content = saveContent(getDb(), id, body.data);
  if (!content) return jsonError("Content not found", 404);
  return Response.json({ content });
}

/** Deletes the content item (its schedule entry, if any, cascades). */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/contents/[id]">,
) {
  const { id } = await ctx.params;
  const content = deleteContent(getDb(), id);
  if (!content) return jsonError("Content not found", 404);
  return new Response(null, { status: 204 });
}
