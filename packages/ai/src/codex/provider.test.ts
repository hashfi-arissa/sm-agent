import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ChatEvent } from "../provider";
import { CodexProvider } from "./provider";

const fakeServer = path.join(
  import.meta.dirname,
  "..",
  "..",
  "test",
  "fake-app-server.mjs",
);
const scratchDir = path.join(os.tmpdir(), "sma-ai-test-scratch");

let provider: CodexProvider;
function makeProvider() {
  provider = new CodexProvider({
    launch: { command: process.execPath, args: [fakeServer] },
    scratchDir,
  });
  return provider;
}
afterEach(() => provider?.dispose());

async function collect(events: AsyncIterable<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const turn = { model: "alpha", effort: "high" };

describe("CodexProvider (fake app-server)", () => {
  it("reports not_installed when Codex can't be found", async () => {
    const p = new CodexProvider({ launch: null });
    expect(await p.getStatus()).toMatchObject({ state: "not_installed" });
  });

  it("reports ready with the ChatGPT account and CLI version", async () => {
    expect(await makeProvider().getStatus()).toEqual({
      state: "ready",
      version: "9.9.9",
      account: { type: "chatgpt", email: "me@example.com", plan: "plus" },
    });
  });

  it("lists visible models across pages", async () => {
    const models = await makeProvider().listModels();
    expect(models.map((m) => m.id)).toEqual(["alpha", "beta"]);
    expect(models[0]).toMatchObject({
      displayName: "ALPHA",
      defaultEffort: "low",
      isDefault: true,
      efforts: [
        { value: "low", description: "fast" },
        { value: "high", description: "thorough" },
      ],
    });
  });

  it("starts drafting threads read-only in the scratch dir, never asking for approval", async () => {
    const p = makeProvider();
    await p.startThread({ model: "alpha", instructions: "Be a writer." });
    const calls = await rpcCalls(p);
    expect(calls.find((c) => c.method === "thread/start")?.params).toEqual({
      cwd: scratchDir,
      sandbox: "read-only",
      approvalPolicy: "never",
      developerInstructions: "Be a writer.",
      model: "alpha",
    });
  });

  it("streams only final-answer text and passes model + effort on each turn", async () => {
    const p = makeProvider();
    const { threadId } = await p.startThread({ model: "alpha" });
    const events = await collect(
      p.sendMessage({ ...turn, threadId, text: "hi" }),
    );

    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "delta", text: ", world" },
      { type: "done", text: "Hello, world", interrupted: false },
    ]);
    const turnStart = (await rpcCalls(p)).find(
      (c) => c.method === "turn/start",
    );
    expect(turnStart?.params).toMatchObject({
      threadId,
      model: "alpha",
      effort: "high",
    });
  });

  it("interrupts the turn when the signal aborts", async () => {
    const p = makeProvider();
    const { threadId } = await p.startThread({ model: "alpha" });
    const controller = new AbortController();
    const events: ChatEvent[] = [];
    for await (const e of p.sendMessage({
      ...turn,
      threadId,
      text: "slow",
      signal: controller.signal,
    })) {
      events.push(e);
      if (e.type === "delta") controller.abort();
    }
    expect(events.at(-1)).toEqual({
      type: "done",
      text: "partial",
      interrupted: true,
    });
  });

  it("surfaces failed turns as an error event", async () => {
    const p = makeProvider();
    const { threadId } = await p.startThread({ model: "alpha" });
    const events = await collect(
      p.sendMessage({ ...turn, threadId, text: "fail" }),
    );
    expect(events).toEqual([{ type: "error", message: "boom" }]);
  });

  it("recovers after a crash by restarting and resuming the thread", async () => {
    const p = makeProvider();
    const { threadId } = await p.startThread({ model: "alpha" });

    const crashed = await collect(
      p.sendMessage({ ...turn, threadId, text: "crash" }),
    );
    expect(crashed.at(-1)?.type).toBe("error");

    const events = await collect(
      p.sendMessage({ ...turn, threadId, text: "hi again" }),
    );
    expect(events.at(-1)).toEqual({
      type: "done",
      text: "Hello, world",
      interrupted: false,
    });
    const methods = (await rpcCalls(p)).map((c) => c.method);
    expect(methods).toContain("thread/resume");
  });
});

// Reads the fake server's request log through the provider's live connection.
async function rpcCalls(p: CodexProvider) {
  const session = await (
    p as unknown as {
      connect(): Promise<{
        rpc: { request<T>(m: string, x: unknown): Promise<T> };
      }>;
    }
  ).connect();
  return session.rpc.request<{ method: string; params: unknown }[]>(
    "test/calls",
    {},
  );
}
