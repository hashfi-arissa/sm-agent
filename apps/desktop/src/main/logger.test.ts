import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "./logger";

describe("createLogger", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "sma-logs-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const flush = async (log: { close(): void }) => log.close();

  it("writes timestamped, levelled lines", async () => {
    const log = createLogger(dir, "main");
    log.info("hello %s", "world");
    log.error(new Error("boom"));
    log.raw("line one\r\nline two\n");
    await flush(log);

    const lines = readFileSync(path.join(dir, "main.log"), "utf8")
      .trim()
      .split("\n");
    expect(lines[0]).toMatch(/^\[\d{4}-\d\d-\d\dT.+Z\] \[info\] hello world$/);
    expect(lines[1]).toContain("[error] Error: boom");
    expect(lines.slice(-2).map((l) => l.replace(/^\[[^\]]+\] /, ""))).toEqual([
      "line one",
      "line two",
    ]);
  });

  it("rotates to <name>.old.log once the file is too big", async () => {
    const log = createLogger(dir, "server", { maxBytes: 200 });
    for (let i = 0; i < 10; i++) log.info(`entry ${i} ${"x".repeat(20)}`);
    await flush(log);

    expect(existsSync(path.join(dir, "server.old.log"))).toBe(true);
    const current = readFileSync(path.join(dir, "server.log"), "utf8");
    expect(current.length).toBeLessThan(200);
    expect(current).toContain("entry 9");
  });
});
