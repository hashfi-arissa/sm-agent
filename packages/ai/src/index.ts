// AIProvider interface and the Codex app-server implementation.
import { CodexProvider } from "./codex/provider";
import type { AIProvider } from "./provider";

export { CodexProvider, type CodexProviderOptions } from "./codex/provider";
export { type CodexLaunch, resolveCodexLaunch } from "./codex/launch";
export { CONTENT_STRUCTURE_INSTRUCTIONS, DRAFTING_INSTRUCTIONS } from "./prompts";
export type * from "./provider";

// One Codex process per server process; kept on globalThis so Next.js dev reloads reuse it.
const globalForAI = globalThis as unknown as { __smaAI?: AIProvider };

export function getAIProvider(): AIProvider {
  if (!globalForAI.__smaAI) {
    const provider = new CodexProvider();
    globalForAI.__smaAI = provider;
    process.once("exit", () => void provider.dispose());
  }
  return globalForAI.__smaAI;
}
