import type { AIErrorCode, AIProvider } from "@repo/ai";
import type { z } from "zod";

/** Error body every API route returns: `{ error, code? }`. */
export interface ApiError {
  error: string;
  code?: AIErrorCode | "busy";
}

export function jsonError(
  error: string,
  status: number,
  code?: ApiError["code"],
): Response {
  return Response.json({ error, code } satisfies ApiError, { status });
}

/** Parses and validates a JSON body; returns the data or a 400 response. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: Response }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return { data: parsed.data };
  return {
    response: jsonError(
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
    ),
  };
}

/** Checks a model + effort pair against Codex `model/list`. Returns an error response if invalid. */
export async function checkModel(
  ai: AIProvider,
  model: string,
  effort: string,
): Promise<Response | null> {
  let models;
  try {
    models = await ai.listModels();
  } catch (error) {
    return providerError(ai, error);
  }
  const known = models.find((m) => m.id === model);
  if (known?.efforts.some((e) => e.value === effort)) return null;
  return jsonError(`Unsupported model/effort: ${model} @ ${effort}`, 400);
}

/** Maps a failed provider call to a 502 with a code the UI can act on. */
export async function providerError(
  ai: AIProvider,
  error: unknown,
): Promise<Response> {
  const message = error instanceof Error ? error.message : String(error);
  const status = await ai.getStatus();
  const code: AIErrorCode =
    status.state === "not_installed"
      ? "not_installed"
      : status.state === "signed_out"
        ? "signed_out"
        : "other";
  return jsonError(message, 502, code);
}
