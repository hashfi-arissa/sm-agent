import net from "node:net";

import { describe, expect, it } from "vitest";

import { findPort, HOST, serverEnv, waitForPort } from "./server";

describe("serverEnv", () => {
  it("runs the server as Node on loopback with the app's paths and token", () => {
    const env = serverEnv(
      { PATH: "/bin", SMA_AUTH_TOKEN: "stale" },
      {
        port: 1234,
        token: "secret",
        appVersion: "1.2.3",
        paths: {
          serverScript: "/r/server/apps/app/server.js",
          migrationsDir: "/r/migrations",
          bundledCodex: "/r/codex/bin/codex",
          dataDir: "/u/data",
        },
      },
    );
    expect(env).toMatchObject({
      PATH: "/bin",
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: "1234",
      HOSTNAME: "127.0.0.1",
      SMA_AUTH_TOKEN: "secret",
      SMA_APP_VERSION: "1.2.3",
      SMA_DATA_DIR: "/u/data",
      SMA_MIGRATIONS_DIR: "/r/migrations",
      SMA_BUNDLED_CODEX: "/r/codex/bin/codex",
    });
  });

  it("omits the bundled Codex path when there is none", () => {
    const env = serverEnv(
      {},
      {
        port: 1,
        token: "t",
        appVersion: "0",
        paths: {
          serverScript: "s",
          migrationsDir: "m",
          bundledCodex: null,
          dataDir: "d",
        },
      },
    );
    expect(env).not.toHaveProperty("SMA_BUNDLED_CODEX");
  });
});

describe("findPort / waitForPort", () => {
  it("falls back to a free port when the preferred one is taken", async () => {
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, HOST, r));
    const taken = (blocker.address() as net.AddressInfo).port;
    try {
      const port = await findPort(taken);
      expect(port).not.toBe(taken);
      expect(port).toBeGreaterThan(0);
    } finally {
      blocker.close();
    }
  });

  it("resolves once something listens, and fails fast if the process died", async () => {
    const port = await findPort(0);
    const srv = net.createServer();
    setTimeout(() => srv.listen(port, HOST), 200);
    await expect(
      waitForPort(port, { timeoutMs: 5000 }),
    ).resolves.toBeUndefined();
    srv.close();

    const closed = await findPort(0);
    await expect(
      waitForPort(closed, { timeoutMs: 5000, isAlive: () => false }),
    ).rejects.toThrow(/exited/);
  });
});
