import { createContent, getDb } from "@repo/db";
import { createContentInputSchema } from "@repo/types";

import { parseBody } from "@/lib/api";

/** Creates a content item (from scratch, or pre-filled by Convert). */
export async function POST(request: Request) {
  const body = await parseBody(request, createContentInputSchema);
  if ("response" in body) return body.response;

  const content = createContent(getDb(), body.data);
  return Response.json({ id: content.id }, { status: 201 });
}
