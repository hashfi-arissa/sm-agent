// End-to-end check against the real Codex CLI and the user's ChatGPT plan.
// Skipped unless CODEX_LIVE=1, since it uses subscription quota:
//   CODEX_LIVE=1 pnpm --filter @repo/ai test
import { afterAll, describe, expect, it } from "vitest";

import { DRAFTING_INSTRUCTIONS } from "../prompts";
import type { ChatEvent } from "../provider";
import { CodexProvider } from "./provider";

const provider = new CodexProvider();
afterAll(() => provider.dispose());

describe.skipIf(!process.env.CODEX_LIVE)("CodexProvider (live)", () => {
  it("is signed in and streams a reply from the default model", async () => {
    const status = await provider.getStatus();
    expect(status.state).toBe("ready");

    const models = await provider.listModels();
    const model = models.find((m) => m.isDefault) ?? models[0]!;
    const effort = model.efforts[0]!.value;

    const { threadId } = await provider.startThread({
      model: model.id,
      instructions: DRAFTING_INSTRUCTIONS,
    });
    const events: ChatEvent[] = [];
    for await (const e of provider.sendMessage({
      threadId,
      model: model.id,
      effort,
      instructions: DRAFTING_INSTRUCTIONS,
      text: "Reply with exactly one word: pong",
    })) {
      events.push(e);
    }

    const last = events.at(-1);
    console.log(
      `[live] ${model.id} @ ${effort}:`,
      events.filter((e) => e.type === "delta").length,
      "deltas",
      last,
    );
    expect(last?.type).toBe("done");
    expect(last?.type === "done" && last.text.toLowerCase()).toContain("pong");
  }, 120_000);
});
