import { type ChildProcess, fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import type { Logger } from "./logger";

/**
 * Tried first so the app keeps the same origin between launches (the theme and other
 * per-origin browser storage survive a restart). Falls back to any free port.
 */
export const PREFERRED_PORT = 47831;
export const HOST = "127.0.0.1";
/** Request header the server requires on every request (see apps/app/src/proxy.ts). */
export const TOKEN_HEADER = "x-sma-token";

export interface ServerPaths {
  /** Next.js standalone `server.js`. */
  serverScript: string;
  migrationsDir: string;
  /** Codex binary shipped with the app; used when no system install is found. */
  bundledCodex: string | null;
  dataDir: string;
}

export interface RunningServer {
  url: string;
  token: string;
  child: ChildProcess;
  stop(): Promise<void>;
}

/** Resolves with `preferred` if it is free on 127.0.0.1, else with a random free port. */
export async function findPort(preferred = PREFERRED_PORT): Promise<number> {
  const tryListen = (port: number) =>
    new Promise<number | null>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(null));
      srv.listen(port, HOST, () => {
        const { port: bound } = srv.address() as net.AddressInfo;
        srv.close(() => resolve(bound));
      });
    });
  return (await tryListen(preferred)) ?? (await tryListen(0))!;
}

/** Environment for the Next.js server process. */
export function serverEnv(
  base: NodeJS.ProcessEnv,
  opts: {
    port: number;
    token: string;
    paths: ServerPaths;
    appVersion: string;
  },
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    // The server is forked from the Electron binary; run it as plain Node. Codex launched
    // through an npm shim (`process.execPath bin/codex.js`) inherits this as well.
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(opts.port),
    HOSTNAME: HOST,
    SMA_AUTH_TOKEN: opts.token,
    SMA_APP_VERSION: opts.appVersion,
    SMA_DATA_DIR: opts.paths.dataDir,
    SMA_MIGRATIONS_DIR: opts.paths.migrationsDir,
  };
  if (opts.paths.bundledCodex) env.SMA_BUNDLED_CODEX = opts.paths.bundledCodex;
  return env;
}

/** Polls until something accepts TCP connections on host:port. */
export async function waitForPort(
  port: number,
  {
    timeoutMs = 60_000,
    isAlive = () => true,
  }: { timeoutMs?: number; isAlive?: () => boolean } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error("The app server exited during startup");
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect(port, HOST);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`The app server did not start within ${timeoutMs / 1000}s`);
}

/**
 * Forks the Next.js standalone server with the Electron binary in Node mode and waits
 * until it listens. `onExit` fires for exits after startup that weren't requested via
 * `stop()`; a failed startup rejects instead.
 */
export async function startServer(opts: {
  paths: ServerPaths;
  appVersion: string;
  log: Logger;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}): Promise<RunningServer> {
  const { paths, log } = opts;
  if (!existsSync(paths.serverScript)) {
    throw new Error(
      `App server not found at ${paths.serverScript}. Run \`pnpm --filter desktop stage\` first.`,
    );
  }

  const port = await findPort();
  const token = randomBytes(32).toString("hex");
  const child = fork(paths.serverScript, [], {
    cwd: path.dirname(paths.serverScript),
    env: serverEnv(process.env, {
      port,
      token,
      paths,
      appVersion: opts.appVersion,
    }),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  child.stdout?.setEncoding("utf8").on("data", (s: string) => log.raw(s));
  child.stderr?.setEncoding("utf8").on("data", (s: string) => log.raw(s));

  let started = false;
  let stopping = false;
  let exited = false;
  child.once("exit", (code, signal) => {
    exited = true;
    log.info(`server exited (code ${code}, signal ${signal})`);
    if (started && !stopping) opts.onExit(code, signal);
  });

  log.info(`starting server on ${HOST}:${port}`);
  try {
    await waitForPort(port, { isAlive: () => !exited });
    started = true;
  } catch (error) {
    stopping = true;
    child.kill();
    throw error;
  }

  return {
    url: `http://${HOST}:${port}`,
    token,
    child,
    async stop() {
      if (exited) return;
      stopping = true;
      const done = once(child, "exit").catch(() => undefined);
      child.kill();
      await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
    },
  };
}
