import { getAIProvider, type ModelInfo } from "@repo/ai";

import {
  type CodexProblemCode,
  statusProblem,
} from "@/components/codex-problem";

/** Codex readiness + models for the drafting workspace. Call only from dynamic pages. */
export async function getCodexContext(): Promise<{
  models: ModelInfo[];
  problem: { code: CodexProblemCode; message?: string } | null;
}> {
  const ai = getAIProvider();
  const status = await ai.getStatus();
  const problem = statusProblem(status);
  if (problem) return { models: [], problem };
  try {
    return { models: await ai.listModels(), problem: null };
  } catch (error) {
    return {
      models: [],
      problem: {
        code: "unavailable",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
