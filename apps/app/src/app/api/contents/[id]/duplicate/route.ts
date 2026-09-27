import { duplicateContent, getDb } from "@repo/db";

import { jsonError } from "@/lib/api";

/** Copies a content item as a new, unsaved draft. */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/contents/[id]/duplicate">,
) {
  const { id } = await ctx.params;
  const content = duplicateContent(getDb(), id);
  if (!content) return jsonError("Content not found", 404);
  return Response.json({ id: content.id }, { status: 201 });
}
