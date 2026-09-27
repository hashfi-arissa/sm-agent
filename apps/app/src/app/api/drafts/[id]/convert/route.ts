import { CONTENT_STRUCTURE_INSTRUCTIONS, getAIProvider } from "@repo/ai";
import { createContent, getDb, getDraft } from "@repo/db";
import { contentSchema } from "@repo/types";

import { jsonError, providerError } from "@/lib/api";

const structuredContentSchema = contentSchema.pick({
  topic: true,
  hook: true,
  beats: true,
  cta: true,
  caption: true,
  hashtags: true,
});

/**
 * Codex-assisted structuring: turns a draft document into a Content item (hook/beats/CTA/…).
 * Runs one turn on a fresh thread, using the draft's own (locked) model + effort.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/drafts/[id]/convert">,
) {
  const { id } = await ctx.params;
  const draft = getDraft(getDb(), id);
  if (!draft) return jsonError("Draft not found", 404);
  if (!draft.document.body.trim()) {
    return jsonError("Nothing to convert — the draft document is empty", 400);
  }

  const ai = getAIProvider();
  const { model, effort } = draft.session;

  let threadId: string;
  try {
    ({ threadId } = await ai.startThread({
      model,
      instructions: CONTENT_STRUCTURE_INSTRUCTIONS,
    }));
  } catch (error) {
    return providerError(ai, error);
  }

  const prompt = `Title: ${draft.document.title || "(untitled)"}\n\n${draft.document.body}`;
  let text = "";
  try {
    for await (const event of ai.sendMessage({
      threadId,
      model,
      effort,
      text: prompt,
      instructions: CONTENT_STRUCTURE_INSTRUCTIONS,
      signal: request.signal,
    })) {
      if (event.type === "done") text = event.text;
      if (event.type === "error") return jsonError(event.message, 502, event.code);
    }
  } catch (error) {
    return providerError(ai, error);
  }

  const jsonText = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return jsonError("Codex didn't return structured JSON — try again", 502);
  }
  const result = structuredContentSchema.safeParse(parsed);
  if (!result.success) {
    return jsonError(
      "Codex's reply didn't match the expected shape — try again",
      502,
    );
  }

  const content = createContent(getDb(), {
    sourceDraftId: draft.document.id,
    ...result.data,
    status: "draft",
  });
  return Response.json({ id: content.id }, { status: 201 });
}
