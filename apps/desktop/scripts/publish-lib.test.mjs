import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseLatestYml,
  parsePublishTarget,
  planRelease,
  resolveToken,
  verifyInstaller,
} from "./publish-lib.mjs";

describe("parsePublishTarget", () => {
  it("reads owner and repo from the real electron-builder.yml", () => {
    const yml = readFileSync(
      path.join(import.meta.dirname, "..", "electron-builder.yml"),
      "utf8",
    );
    expect(parsePublishTarget(yml)).toEqual({
      owner: "hashfi-arissa",
      repo: "sm-agent",
    });
  });

  it("rejects a non-GitHub or incomplete publish block", () => {
    expect(() =>
      parsePublishTarget("publish:\n  provider: generic\n  url: x\n"),
    ).toThrow();
    expect(() =>
      parsePublishTarget("publish:\n  provider: github\n  owner: a\n"),
    ).toThrow();
  });
});

describe("parseLatestYml", () => {
  it("reads electron-builder's NSIS update info", () => {
    const yml = `version: 0.1.1
files:
  - url: Social-Media-Agent-Setup-0.1.1.exe
    sha512: abc==
    size: 1234
path: Social-Media-Agent-Setup-0.1.1.exe
sha512: abc==
releaseDate: '2026-09-28T03:41:13.039Z'
`;
    expect(parseLatestYml(yml)).toEqual({
      version: "0.1.1",
      path: "Social-Media-Agent-Setup-0.1.1.exe",
      sha512: "abc==",
      size: 1234,
    });
  });

  it("fails on incomplete files", () => {
    expect(() => parseLatestYml("version: 1.0.0\n")).toThrow();
  });
});

describe("resolveToken", () => {
  it("prefers the environment, then electron-builder.env, ignoring the placeholder", () => {
    expect(resolveToken({ GH_TOKEN: "env" }, "GH_TOKEN=file")).toBe("env");
    expect(resolveToken({}, "# note\r\nGH_TOKEN = 'file'\r\n")).toBe("file");
    expect(resolveToken({}, "GH_TOKEN=paste-your-token-here")).toBeNull();
    expect(resolveToken({}, undefined)).toBeNull();
  });
});

describe("verifyInstaller", () => {
  const data = Buffer.from("installer bytes");
  const sha512 = createHash("sha512").update(data).digest("base64");
  const latest = { version: "1", path: "x.exe", sha512, size: data.length };

  it("returns the SHA-256 when size and SHA-512 match", () => {
    expect(verifyInstaller(data, latest)).toBe(
      createHash("sha256").update(data).digest("hex"),
    );
  });

  it("rejects a stale latest.yml", () => {
    expect(() => verifyInstaller(data, { ...latest, size: 1 })).toThrow(
      /bytes/,
    );
    expect(() => verifyInstaller(data, { ...latest, sha512: "nope" })).toThrow(
      /SHA-512/,
    );
  });
});

describe("planRelease", () => {
  it("creates, reuses a draft, or refuses a published release", () => {
    expect(planRelease(null)).toBe("create");
    expect(planRelease({ draft: true })).toBe("reuse-draft");
    expect(planRelease({ draft: false })).toBe("already-published");
  });
});
