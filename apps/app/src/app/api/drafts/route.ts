import { getAIProvider } from "@repo/ai";
import { createDraft, getDb } from "@repo/db";
import { createDraftInputSchema } from "@repo/types";

import { checkModel, parseBody } from "@/lib/api";

/** Creates a draft session. Its model + effort can't change afterwards. */
export async function POST(request: Request) {
  const body = await parseBody(request, createDraftInputSchema);
  if ("response" in body) return body.response;
  const { model, effort, title, body: docBody } = body.data;

  const invalid = await checkModel(getAIProvider(), model, effort);
  if (invalid) return invalid;

  const { session } = createDraft(getDb(), {
    model,
    effort,
    title,
    body: docBody,
  });
  return Response.json({ id: session.id }, { status: 201 });
}
