import { DRAFTING_INSTRUCTIONS, getAIProvider } from "@repo/ai";
import { codexTestInputSchema } from "@repo/types";

/**
 * Sends one prompt on a fresh drafting thread and streams ChatEvents back as NDJSON.
 * Closing the request (client Stop / navigation) interrupts the Codex turn.
 */
export async function POST(request: Request) {
  const parsed = codexTestInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { model, effort, prompt } = parsed.data;
  const ai = getAIProvider();

  const known = (await ai.listModels()).find((m) => m.id === model);
  if (!known?.efforts.some((e) => e.value === effort)) {
    return Response.json(
      { error: `Unsupported model/effort: ${model} @ ${effort}` },
      { status: 400 },
    );
  }

  let threadId: string;
  try {
    ({ threadId } = await ai.startThread({
      model,
      instructions: DRAFTING_INSTRUCTIONS,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502 });
  }

  const events = ai.sendMessage({
    threadId,
    model,
    effort,
    text: prompt,
    instructions: DRAFTING_INSTRUCTIONS,
    signal: request.signal,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
