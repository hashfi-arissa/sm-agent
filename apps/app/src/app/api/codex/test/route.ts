import { DRAFTING_INSTRUCTIONS, getAIProvider } from "@repo/ai";
import { codexTestInputSchema } from "@repo/types";

import { checkModel, parseBody, providerError } from "@/lib/api";
import { ndjsonResponse } from "@/lib/ndjson";

/**
 * Sends one prompt on a fresh drafting thread and streams ChatEvents back as NDJSON.
 * Closing the request (client Stop / navigation) interrupts the Codex turn.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, codexTestInputSchema);
  if ("response" in body) return body.response;
  const { model, effort, prompt } = body.data;
  const ai = getAIProvider();

  const invalid = await checkModel(ai, model, effort);
  if (invalid) return invalid;

  let threadId: string;
  try {
    ({ threadId } = await ai.startThread({
      model,
      instructions: DRAFTING_INSTRUCTIONS,
    }));
  } catch (error) {
    return providerError(ai, error);
  }

  return ndjsonResponse(
    ai.sendMessage({
      threadId,
      model,
      effort,
      text: prompt,
      instructions: DRAFTING_INSTRUCTIONS,
      signal: request.signal,
    }),
  );
}
