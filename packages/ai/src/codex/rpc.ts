// JSON-RPC over newline-delimited JSON, as spoken by `codex app-server` on stdio.
// Codex omits the "jsonrpc": "2.0" field; messages are {id, method, params} / {id, result|error}.
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

type RequestId = number | string;

interface IncomingMessage {
  id?: RequestId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type NotificationHandler = (method: string, params: unknown) => void;
export type ServerRequestHandler = (
  method: string,
  params: unknown,
) => Promise<unknown>;

const rejectServerRequest: ServerRequestHandler = (method) =>
  Promise.reject(
    new RpcError(-32601, `${method} is not supported by this client`),
  );

interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export class JsonRpcConnection {
  private nextId = 1;
  private readonly pending = new Map<RequestId, Pending>();
  private readonly notificationHandlers = new Set<NotificationHandler>();
  private closedWith: Error | null = null;

  constructor(
    input: Readable,
    private readonly output: Writable,
    private readonly onServerRequest: ServerRequestHandler = rejectServerRequest,
  ) {
    const lines = createInterface({ input, crlfDelay: Infinity });
    lines.on("line", (line) => this.handleLine(line));
    lines.on("close", () =>
      this.close(new Error("Codex app-server closed the connection")),
    );
  }

  get closed(): boolean {
    return this.closedWith !== null;
  }

  request<T>(
    method: string,
    params: unknown,
    { timeoutMs = 60_000 } = {},
  ): Promise<T> {
    if (this.closedWith) return Promise.reject(this.closedWith);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(
                new Error(
                  `Codex request ${method} timed out after ${timeoutMs}ms`,
                ),
              );
            }, timeoutMs)
          : undefined;
      this.pending.set(id, {
        method,
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      this.send({ id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.send(params === undefined ? { method } : { method, params });
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  close(error: Error = new Error("Connection closed")): void {
    if (this.closedWith) return;
    this.closedWith = error;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private send(message: object): void {
    if (this.closedWith) return;
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let message: IncomingMessage;
    try {
      message = JSON.parse(line) as IncomingMessage;
    } catch {
      return; // Not JSON-RPC (e.g. stray log output); ignore.
    }

    if (message.method !== undefined && message.id !== undefined) {
      void this.answerServerRequest(message.id, message.method, message.params);
    } else if (message.method !== undefined) {
      for (const handler of this.notificationHandlers)
        handler(message.method, message.params);
    } else if (message.id !== undefined) {
      this.settle(message);
    }
  }

  private settle(message: IncomingMessage): void {
    const pending = this.pending.get(message.id!);
    if (!pending) return;
    this.pending.delete(message.id!);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(
        new RpcError(
          message.error.code,
          message.error.message,
          message.error.data,
        ),
      );
    } else {
      pending.resolve(message.result);
    }
  }

  private async answerServerRequest(
    id: RequestId,
    method: string,
    params: unknown,
  ) {
    try {
      const result = await this.onServerRequest(method, params);
      this.send({ id, result });
    } catch (error) {
      const code = error instanceof RpcError ? error.code : -32603;
      const message = error instanceof Error ? error.message : String(error);
      this.send({ id, error: { code, message } });
    }
  }
}
