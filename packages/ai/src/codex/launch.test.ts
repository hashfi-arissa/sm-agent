import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveCodexLaunch } from "./launch";

const exe = process.platform === "win32" ? "codex.exe" : "codex";

describe("resolveCodexLaunch", () => {
  let dir: string;
  let emptyPath: string;
  let systemPath: string;
  let bundled: string;

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "codex-launch-")));
    emptyPath = path.join(dir, "empty");
    systemPath = path.join(dir, "system");
    for (const d of [emptyPath, systemPath, path.join(dir, "bundled")])
      mkdirSync(d, { recursive: true });
    writeFileSync(path.join(systemPath, exe), "");
    bundled = path.join(dir, "bundled", exe);
    writeFileSync(bundled, "");
    vi.stubEnv("CODEX_BIN", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when nothing is installed", () => {
    vi.stubEnv("PATH", emptyPath);
    vi.stubEnv("SMA_BUNDLED_CODEX", undefined);
    expect(resolveCodexLaunch()).toBeNull();
  });

  it("falls back to the desktop app's bundled binary", () => {
    vi.stubEnv("PATH", emptyPath);
    vi.stubEnv("SMA_BUNDLED_CODEX", bundled);
    expect(resolveCodexLaunch()).toEqual({
      command: bundled,
      args: [],
      bundled: true,
    });
  });

  it("prefers a system install over the bundled binary", () => {
    vi.stubEnv("PATH", systemPath);
    vi.stubEnv("SMA_BUNDLED_CODEX", bundled);
    expect(resolveCodexLaunch()).toEqual({
      command: path.join(systemPath, exe),
      args: [],
    });
  });

  it("ignores a bundled path that doesn't exist", () => {
    vi.stubEnv("PATH", emptyPath);
    vi.stubEnv("SMA_BUNDLED_CODEX", path.join(dir, "missing", exe));
    expect(resolveCodexLaunch()).toBeNull();
  });
});
