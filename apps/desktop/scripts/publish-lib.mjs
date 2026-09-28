// Pure helpers for scripts/publish.mjs (kept separate so they can be unit-tested).
import { createHash } from "node:crypto";

/** Reads `publish.owner` / `publish.repo` from electron-builder.yml (flat keys only). */
export function parsePublishTarget(yml) {
  const block = yml.match(/^publish:\s*\n((?:[ \t]+.*\n?)*)/m)?.[1] ?? "";
  const field = (name) =>
    block.match(new RegExp(`^\\s+${name}:\\s*["']?([^"'\\s#]+)`, "m"))?.[1];
  const provider = field("provider");
  const owner = field("owner");
  const repo = field("repo");
  if (provider !== "github" || !owner || !repo)
    throw new Error(
      "electron-builder.yml needs `publish: { provider: github, owner, repo }`",
    );
  return { owner, repo };
}

/** The fields of electron-builder's latest.yml that the upload depends on. */
export function parseLatestYml(yml) {
  const scalar = (name) =>
    yml.match(new RegExp(`^${name}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, "m"))?.[1];
  const version = scalar("version");
  const path = scalar("path");
  const sha512 = scalar("sha512");
  const size = Number(yml.match(/^\s+size:\s*(\d+)\s*$/m)?.[1]);
  if (!version || !path || !sha512 || !size)
    throw new Error("latest.yml is missing version, path, sha512 or size");
  return { version, path, sha512, size };
}

/** Reads GH_TOKEN from the environment, else from electron-builder.env (KEY=value lines). */
export function resolveToken(env, envFileText) {
  if (env.GH_TOKEN) return env.GH_TOKEN;
  const line = envFileText
    ?.split(/\r?\n/)
    .find((l) => /^\s*GH_TOKEN\s*=/.test(l));
  const token = line
    ?.replace(/^\s*GH_TOKEN\s*=\s*/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!token || token === "paste-your-token-here") return null;
  return token;
}

/** Checks that the installer on disk is exactly the one latest.yml describes. */
export function verifyInstaller(buffer, latest) {
  if (buffer.length !== latest.size)
    throw new Error(
      `Installer is ${buffer.length} bytes but latest.yml says ${latest.size}`,
    );
  const sha512 = createHash("sha512").update(buffer).digest("base64");
  if (sha512 !== latest.sha512)
    throw new Error("Installer SHA-512 doesn't match latest.yml — rebuild");
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * What to do with an existing release for this tag:
 * create a new draft, reuse an existing draft, or stop (already published).
 */
export function planRelease(existing) {
  if (!existing) return "create";
  if (existing.draft) return "reuse-draft";
  return "already-published";
}
