// Minimal stand-in for `codex app-server` used by provider tests. Speaks the same
// newline-delimited JSON-RPC. Special turn inputs: "slow" (waits for interrupt),
// "fail" (turn fails), "limit" (usage limit reached), "crash" (process exits mid-turn).
import { createInterface } from "node:readline";

const calls = [];
const loadedThreads = new Set();
let turnCounter = 0;
let slowTurn = null;

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const notify = (method, params) => send({ method, params });

function agentMessage(threadId, turnId, id, phase, chunks) {
  notify("item/started", {
    threadId,
    turnId,
    startedAtMs: Date.now(),
    item: { type: "agentMessage", id, text: "", phase },
  });
  for (const delta of chunks)
    notify("item/agentMessage/delta", { threadId, turnId, itemId: id, delta });
  notify("item/completed", {
    threadId,
    turnId,
    completedAtMs: Date.now(),
    item: { type: "agentMessage", id, text: chunks.join(""), phase },
  });
}

function completeTurn(threadId, turnId, status, error = null) {
  notify("turn/completed", {
    threadId,
    turn: { id: turnId, items: [], status, error },
  });
}

const handlers = {
  initialize: () => ({
    userAgent: "social_media_agent/9.9.9 (test)",
    codexHome: "/tmp/codex",
    platformFamily: "unix",
    platformOs: "linux",
  }),
  "account/read": () =>
    process.env.FAKE_SIGNED_OUT
      ? { account: null, requiresOpenaiAuth: true }
      : {
          account: {
            type: "chatgpt",
            email: "me@example.com",
            planType: "plus",
          },
          requiresOpenaiAuth: true,
        },
  "model/list": ({ cursor }) => {
    const model = (id, hidden = false) => ({
      id,
      model: id,
      displayName: id.toUpperCase(),
      description: `${id} model`,
      hidden,
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "fast" },
        { reasoningEffort: "high", description: "thorough" },
      ],
      defaultReasoningEffort: "low",
      isDefault: id === "alpha",
    });
    return cursor === "p2"
      ? { data: [model("beta"), model("secret", true)], nextCursor: null }
      : { data: [model("alpha")], nextCursor: "p2" };
  },
  "account/login/start": () => ({
    type: "chatgpt",
    loginId: "l1",
    authUrl: "https://auth.example/login",
  }),
  "thread/start": () => {
    const id = `thr_${loadedThreads.size + 1}`;
    loadedThreads.add(id);
    return { thread: { id } };
  },
  "thread/resume": ({ threadId }) => {
    loadedThreads.add(threadId);
    return { thread: { id: threadId } };
  },
  "thread/revert": ({ threadId }) => {
    if (!loadedThreads.has(threadId))
      throw { code: -32600, message: `thread not loaded: ${threadId}` };
    return { thread: { id: threadId } };
  },
  "thread/delete": ({ threadId }) => {
    loadedThreads.delete(threadId);
    return {};
  },
  "turn/start": ({ threadId, input }) => {
    if (!loadedThreads.has(threadId))
      throw { code: -32600, message: `thread not found: ${threadId}` };
    const turnId = `turn_${++turnCounter}`;
    const text = input[0].text;
    setImmediate(() => {
      notify("turn/started", {
        threadId,
        turn: { id: turnId, items: [], status: "inProgress", error: null },
      });
      if (text === "crash") process.exit(1);
      if (text === "fail")
        return completeTurn(threadId, turnId, "failed", { message: "boom" });
      if (text === "limit") {
        return completeTurn(threadId, turnId, "failed", {
          message: "You've hit your usage limit.",
          codexErrorInfo: "usageLimitExceeded",
        });
      }
      if (text === "slow") {
        agentMessage(threadId, turnId, "m_slow", "final_answer", ["partial"]);
        slowTurn = { threadId, turnId };
        return;
      }
      agentMessage(threadId, turnId, "c1", "commentary", ["thinking..."]);
      agentMessage(threadId, turnId, "m1", "final_answer", [
        "Hello",
        ", world",
      ]);
      completeTurn(threadId, turnId, "completed");
    });
    return {
      turn: { id: turnId, items: [], status: "inProgress", error: null },
    };
  },
  "turn/interrupt": ({ turnId }) => {
    if (slowTurn?.turnId === turnId) {
      setImmediate(() =>
        completeTurn(slowTurn.threadId, turnId, "interrupted"),
      );
    }
    return {};
  },
  "test/calls": () => calls,
};

createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return; // notifications (e.g. "initialized")
  calls.push({ method: msg.method, params: msg.params });
  try {
    const handler = handlers[msg.method];
    if (!handler)
      throw { code: -32601, message: `unknown method ${msg.method}` };
    send({ id: msg.id, result: handler(msg.params ?? {}) });
  } catch (error) {
    send({
      id: msg.id,
      error: { code: error.code ?? -32603, message: error.message },
    });
  }
});
