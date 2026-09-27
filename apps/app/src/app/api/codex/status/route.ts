import { getAIProvider } from "@repo/ai";

export const dynamic = "force-dynamic";

/** Codex connection state + available models (models only when signed in). */
export async function GET() {
  const ai = getAIProvider();
  const status = await ai.getStatus();
  const models = status.state === "ready" ? await ai.listModels() : [];
  return Response.json({ status, models });
}
