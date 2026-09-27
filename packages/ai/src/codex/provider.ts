import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { AsyncQueue } from "../async-queue";
import type {
  AccountInfo,
  AIErrorCode,
  AIProvider,
  ChatEvent,
  ModelInfo,
  ProviderStatus,
  RevertThreadOptions,
  SendMessageOptions,
  ThreadOptions,
} from "../provider";
import { type CodexLaunch, resolveCodexLaunch } from "./launch";
import type { InitializeParams } from "./protocol/InitializeParams";
import type { InitializeResponse } from "./protocol/InitializeResponse";
import type { Account } from "./protocol/v2/Account";
import type { CodexErrorInfo } from "./protocol/v2/CodexErrorInfo";
import type { AgentMessageDeltaNotification } from "./protocol/v2/AgentMessageDeltaNotification";
import type { GetAccountResponse } from "./protocol/v2/GetAccountResponse";
import type { ItemCompletedNotification } from "./protocol/v2/ItemCompletedNotification";
import type { ItemStartedNotification } from "./protocol/v2/ItemStartedNotification";
import type { LoginAccountResponse } from "./protocol/v2/LoginAccountResponse";
import type { ModelListResponse } from "./protocol/v2/ModelListResponse";
import type { ThreadResumeParams } from "./protocol/v2/ThreadResumeParams";
import type { ThreadRevertParams } from "./protocol/v2/ThreadRevertParams";
import type { ThreadStartParams } from "./protocol/v2/ThreadStartParams";
import type { ThreadStartResponse } from "./protocol/v2/ThreadStartResponse";
import type { TurnCompletedNotification } from "./protocol/v2/TurnCompletedNotification";
import type { TurnStartParams } from "./protocol/v2/TurnStartParams";
import type { TurnStartedNotification } from "./protocol/v2/TurnStartedNotification";
import type { TurnStartResponse } from "./protocol/v2/TurnStartResponse";
import { JsonRpcConnection } from "./rpc";

export interface CodexProviderOptions {
  /** How to start Codex. Defaults to resolveCodexLaunch(); null means "not installed". */
  launch?: CodexLaunch | null;
  /** Empty working directory for threads, so Codex never sees a real project. */
  scratchDir?: string;
  clientVersion?: string;
}

interface Session {
  child: ChildProcessWithoutNullStreams;
  rpc: JsonRpcConnection;
  version: string | null;
  /** Threads loaded in this app-server process; others need thread/resume first. */
  loadedThreads: Set<string>;
}

const INSTALL_HINT =
  "Codex CLI not found. Install it with: npm i -g @openai/codex";

export class CodexProvider implements AIProvider {
  private session: Promise<Session> | null = null;
  private generation = 0;

  constructor(private readonly options: CodexProviderOptions = {}) {}

  async getStatus(): Promise<ProviderStatus> {
    if (!this.launch())
      return { state: "not_installed", message: INSTALL_HINT };
    try {
      const session = await this.connect();
      const res = await session.rpc.request<GetAccountResponse>(
        "account/read",
        {
          refreshToken: false,
        },
      );
      if (res.account) {
        return {
          state: "ready",
          version: session.version,
          account: toAccountInfo(res.account),
        };
      }
      if (!res.requiresOpenaiAuth) {
        return {
          state: "ready",
          version: session.version,
          account: { type: "other", label: "No sign-in required" },
        };
      }
      return { state: "signed_out", version: session.version };
    } catch (error) {
      return { state: "error", message: errorMessage(error) };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const { rpc } = await this.connect();
    const models: ModelInfo[] = [];
    let cursor: string | null = null;
    do {
      const page: ModelListResponse = await rpc.request<ModelListResponse>(
        "model/list",
        {
          cursor,
        },
      );
      for (const m of page.data) {
        if (m.hidden) continue;
        models.push({
          id: m.model,
          displayName: m.displayName,
          description: m.description,
          efforts: m.supportedReasoningEfforts.map((e) => ({
            value: e.reasoningEffort,
            description: e.description,
          })),
          defaultEffort: m.defaultReasoningEffort,
          isDefault: m.isDefault,
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
    return models;
  }

  async startLogin(): Promise<{ authUrl: string }> {
    const { rpc } = await this.connect();
    const res = await rpc.request<LoginAccountResponse>("account/login/start", {
      type: "chatgpt",
    });
    if (res.type !== "chatgpt")
      throw new Error(`Unexpected login response: ${res.type}`);
    return { authUrl: res.authUrl };
  }

  async startThread({
    model,
    instructions,
  }: ThreadOptions): Promise<{ threadId: string }> {
    const session = await this.connect();
    const params: ThreadStartParams = {
      ...this.threadConfig(instructions),
      model,
    };
    const res = await session.rpc.request<ThreadStartResponse>(
      "thread/start",
      params,
    );
    session.loadedThreads.add(res.thread.id);
    return { threadId: res.thread.id };
  }

  sendMessage(options: SendMessageOptions): AsyncIterable<ChatEvent> {
    const queue = new AsyncQueue<ChatEvent>();
    void this.runTurn(options, queue);
    return queue;
  }

  async revertThread({
    threadId,
    beforeTurnId,
    model,
    instructions,
  }: RevertThreadOptions): Promise<void> {
    const session = await this.connect();
    await this.ensureLoaded(session, threadId, model, instructions);
    const params: ThreadRevertParams = { threadId, beforeTurnId };
    await session.rpc.request("thread/revert", params);
  }

  async deleteThread(threadId: string): Promise<void> {
    const session = await this.connect();
    await session.rpc.request("thread/delete", { threadId });
    session.loadedThreads.delete(threadId);
  }

  async dispose(): Promise<void> {
    const pending = this.session;
    this.session = null;
    this.generation++;
    const session = await pending?.catch(() => null);
    if (!session) return;
    session.rpc.close();
    session.child.stdin.end(); // app-server exits on stdin EOF
    const exited = once(session.child, "exit").catch(() => undefined);
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    if (session.child.exitCode === null) session.child.kill();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private launch(): CodexLaunch | null {
    return this.options.launch === undefined
      ? resolveCodexLaunch()
      : this.options.launch;
  }

  private scratchDir(): string {
    return (
      this.options.scratchDir ??
      path.join(os.tmpdir(), "social-media-agent", "codex-scratch")
    );
  }

  /** Drafting threads: empty cwd, read-only sandbox, never ask for approval. */
  private threadConfig(instructions: string | undefined) {
    return {
      cwd: this.scratchDir(),
      sandbox: "read-only",
      approvalPolicy: "never",
      developerInstructions: instructions ?? null,
    } satisfies Partial<ThreadStartParams & ThreadResumeParams>;
  }

  /** Threads started by an earlier app-server process must be resumed before use. */
  private async ensureLoaded(
    session: Session,
    threadId: string,
    model: string,
    instructions: string | undefined,
  ) {
    if (session.loadedThreads.has(threadId)) return;
    const resume: ThreadResumeParams = {
      ...this.threadConfig(instructions),
      threadId,
      model,
      excludeTurns: true,
    };
    await session.rpc.request("thread/resume", resume);
    session.loadedThreads.add(threadId);
  }

  private connect(): Promise<Session> {
    this.session ??= this.start().catch((error: unknown) => {
      this.session = null;
      throw error;
    });
    return this.session;
  }

  private async start(): Promise<Session> {
    const launch = this.launch();
    if (!launch) throw new Error(INSTALL_HINT);
    mkdirSync(this.scratchDir(), { recursive: true });

    const generation = ++this.generation;
    const child = spawn(launch.command, [...launch.args, "app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stderr: string[] = [];
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr.push(chunk);
      if (stderr.length > 20) stderr.shift();
    });
    child.stdin.on("error", () => {}); // EPIPE when the process dies; surfaced via "exit".

    await once(child, "spawn"); // rejects if the executable can't be started
    child.on("error", () => {});

    const rpc = new JsonRpcConnection(child.stdout, child.stdin);
    child.once("exit", (code, signal) => {
      const detail = stderr.join("").trim().split("\n").slice(-3).join(" ");
      rpc.close(
        new Error(
          `Codex app-server exited (${signal ?? code})${detail ? `: ${detail}` : ""}`,
        ),
      );
      if (this.generation === generation) this.session = null;
    });

    try {
      const params: InitializeParams = {
        clientInfo: {
          name: "social_media_agent",
          title: "Social Media Agent",
          version: this.options.clientVersion ?? "0.1.0",
        },
        capabilities: { experimentalApi: false, requestAttestation: false },
      };
      const init = await rpc.request<InitializeResponse>("initialize", params, {
        timeoutMs: 30_000,
      });
      rpc.notify("initialized");
      return {
        child,
        rpc,
        version: parseVersion(init.userAgent),
        loadedThreads: new Set(),
      };
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  private async runTurn(
    options: SendMessageOptions,
    queue: AsyncQueue<ChatEvent>,
  ) {
    const { threadId, signal } = options;
    let finished = false;
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));
    const finish = (event: ChatEvent) => {
      if (finished) return;
      finished = true;
      queue.push(event);
      queue.end();
      resolveDone();
    };

    let session: Session;
    try {
      session = await this.connect();
    } catch (error) {
      finish({
        type: "error",
        message: errorMessage(error),
        code: this.launch() ? "other" : "not_installed",
      });
      return;
    }
    const { rpc, child } = session;

    let turnId: string | null = null;
    const phases = new Map<string, string | null>();
    let streamed = "";
    let lastItemId: string | null = null;
    let finalText = "";
    // The turn id arrives with the turn/start response or the turn/started notification,
    // whichever comes first.
    const markStarted = (id: string) => {
      if (turnId || finished) return;
      turnId = id;
      queue.push({ type: "started", turnId: id });
    };

    const unsubscribe = rpc.onNotification((method, params) => {
      const p = params as { threadId?: string; turnId?: string };
      if (p?.threadId !== threadId) return;
      if (turnId && p.turnId && p.turnId !== turnId) return;

      if (method === "turn/started") {
        markStarted((params as TurnStartedNotification).turn.id);
      } else if (method === "item/started") {
        const { item } = params as ItemStartedNotification;
        if (item.type === "agentMessage") phases.set(item.id, item.phase);
      } else if (method === "item/agentMessage/delta") {
        const n = params as AgentMessageDeltaNotification;
        if (phases.get(n.itemId) === "commentary") return;
        // Separate consecutive assistant messages within one turn.
        const delta =
          lastItemId && lastItemId !== n.itemId && streamed
            ? `\n\n${n.delta}`
            : n.delta;
        lastItemId = n.itemId;
        streamed += delta;
        queue.push({ type: "delta", text: delta });
      } else if (method === "item/completed") {
        const { item } = params as ItemCompletedNotification;
        if (item.type === "agentMessage" && item.phase !== "commentary") {
          finalText = finalText ? `${finalText}\n\n${item.text}` : item.text;
        }
      } else if (method === "turn/completed") {
        const { turn } = params as TurnCompletedNotification;
        if (turnId && turn.id !== turnId) return;
        if (turn.status === "failed") {
          finish({
            type: "error",
            message: turn.error?.message ?? "Codex turn failed",
            code: errorCode(turn.error?.codexErrorInfo ?? null),
          });
        } else {
          finish({
            type: "done",
            text: finalText || streamed,
            interrupted: turn.status === "interrupted",
          });
        }
      }
    });
    const onExit = () =>
      finish({
        type: "error",
        message: "Codex stopped unexpectedly",
        code: "other",
      });
    child.once("exit", onExit);

    const interrupt = () => {
      if (turnId && !finished) {
        rpc.request("turn/interrupt", { threadId, turnId }).catch(() => {});
      }
    };

    try {
      await this.ensureLoaded(
        session,
        threadId,
        options.model,
        options.instructions,
      );

      const turn: TurnStartParams = {
        threadId,
        input: [{ type: "text", text: options.text, text_elements: [] }],
        model: options.model,
        effort: options.effort,
      };
      const res = await rpc.request<TurnStartResponse>("turn/start", turn);
      markStarted(res.turn.id);

      if (signal?.aborted) interrupt();
      signal?.addEventListener("abort", interrupt, { once: true });
      await done;
    } catch (error) {
      finish({ type: "error", message: errorMessage(error), code: "other" });
    } finally {
      unsubscribe();
      child.removeListener("exit", onExit);
      signal?.removeEventListener("abort", interrupt);
    }
  }
}

function errorCode(info: CodexErrorInfo | null): AIErrorCode {
  switch (info) {
    case "usageLimitExceeded":
    case "rateLimitExceeded":
    case "sessionBudgetExceeded":
      return "rate_limited";
    case "unauthorized":
      return "signed_out";
    case "contextWindowExceeded":
      return "context_full";
    default:
      return "other";
  }
}

function toAccountInfo(account: Account): AccountInfo {
  switch (account.type) {
    case "chatgpt":
      return { type: "chatgpt", email: account.email, plan: account.planType };
    case "apiKey":
      return { type: "apiKey" };
    default:
      return { type: "other", label: account.type };
  }
}

/** userAgent looks like "social_media_agent/0.157.1 (Windows 10.0...; x86_64) ...". */
function parseVersion(userAgent: string): string | null {
  return /\/(\d+\.\d+\.\d+[\w.-]*)/.exec(userAgent)?.[1] ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
