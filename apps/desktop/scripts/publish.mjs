// Uploads the installer built by electron-builder (`--publish never`) to a GitHub release.
//
// electron-builder's own GitHub publisher races with itself (two publishers each try to
// create the release; the second fails with 422 before latest.yml is uploaded), so we
// upload with the GitHub API instead:
//
//   1. check the build: latest.yml version = package.json, installer SHA-512 matches it
//   2. check git: clean tree, HEAD pushed to origin (the tag points at HEAD)
//   3. create a *draft* release (or reuse the draft a failed run left behind)
//   4. upload installer, .blockmap and latest.yml; verify GitHub's SHA-256 of the installer
//   5. publish the draft — only now do users and the auto-updater see it
//
// Usage: node scripts/publish.mjs [--dry-run] [--draft]
//   --dry-run  run every check and the release lookup, change nothing on GitHub
//   --draft    stop after step 4 and leave the release as a draft
// Token: GH_TOKEN env var, or GH_TOKEN=… in electron-builder.env (git-ignored).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  parseLatestYml,
  parsePublishTarget,
  planRelease,
  resolveToken,
  verifyInstaller,
} from "./publish-lib.mjs";

const dryRun = process.argv.includes("--dry-run");
const keepDraft = process.argv.includes("--draft");
const desktopDir = path.resolve(import.meta.dirname, "..");
const releaseDir = path.join(desktopDir, "release");
const API = "https://api.github.com";

const step = (m) => console.log(`\n▸ ${m}`);
const fail = (m) => {
  console.error(`\n✗ ${m}`);
  process.exit(1);
};

// 1. Build output ─────────────────────────────────────────────────────────────
step("Checking build output");
const pkg = JSON.parse(
  readFileSync(path.join(desktopDir, "package.json"), "utf8"),
);
const { owner, repo } = parsePublishTarget(
  readFileSync(path.join(desktopDir, "electron-builder.yml"), "utf8"),
);
const latestPath = path.join(releaseDir, "latest.yml");
if (!existsSync(latestPath))
  fail("release/latest.yml not found — run `pnpm --filter desktop dist` first");
const latestYml = readFileSync(latestPath, "utf8");
const latest = parseLatestYml(latestYml);
if (latest.version !== pkg.version)
  fail(
    `latest.yml is for ${latest.version} but package.json says ${pkg.version} — rebuild`,
  );
const installerPath = path.join(releaseDir, latest.path);
const blockmapPath = `${installerPath}.blockmap`;
for (const f of [installerPath, blockmapPath])
  if (!existsSync(f)) fail(`Missing ${path.relative(desktopDir, f)}`);
const installer = readFileSync(installerPath);
const installerSha256 = verifyInstaller(installer, latest);
console.log(
  `  ${latest.path} (${(installer.length / 1024 / 1024).toFixed(1)} MB) matches latest.yml`,
);

// 2. Git ──────────────────────────────────────────────────────────────────────
step("Checking git");
const git = (...args) =>
  execFileSync("git", args, { cwd: desktopDir, encoding: "utf8" }).trim();
if (git("status", "--porcelain"))
  fail("Uncommitted changes — commit (and push) before releasing");
const head = git("rev-parse", "HEAD");
git("fetch", "--quiet", "origin");
if (!git("branch", "-r", "--contains", head))
  fail("HEAD isn't on origin yet — push before releasing");
console.log(`  clean, HEAD ${head.slice(0, 7)} is on origin`);

// 3. Release ──────────────────────────────────────────────────────────────────
const token = resolveToken(
  process.env,
  existsSync(path.join(desktopDir, "electron-builder.env"))
    ? readFileSync(path.join(desktopDir, "electron-builder.env"), "utf8")
    : undefined,
);
if (!token)
  fail(
    "No GH_TOKEN — set it in the environment or in apps/desktop/electron-builder.env",
  );

async function gh(method, url, { body, headers } = {}) {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body && !headers ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body && !headers ? JSON.stringify(body) : body,
  });
  if (!res.ok)
    throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const tag = `v${pkg.version}`;
step(`Looking up ${owner}/${repo} release ${tag}`);
const releases = await gh(
  "GET",
  `/repos/${owner}/${repo}/releases?per_page=100`,
);
let release = releases.find((r) => r.tag_name === tag) ?? null;
const plan = planRelease(release);
if (plan === "already-published")
  fail(
    `${tag} is already published (${release.html_url}) — bump the version in package.json`,
  );
console.log(
  `  ${plan === "create" ? "no release yet — will create a draft" : `reusing draft ${release.id}`}`,
);

if (dryRun) {
  console.log("\n✓ Dry run: all checks passed, nothing changed on GitHub.");
  process.exit(0);
}

if (!release) {
  release = await gh("POST", `/repos/${owner}/${repo}/releases`, {
    body: {
      tag_name: tag,
      target_commitish: head,
      name: pkg.version,
      draft: true,
      generate_release_notes: true,
    },
  });
  console.log(`  created draft ${release.id}`);
}

// 4. Assets ───────────────────────────────────────────────────────────────────
const uploads = [
  { file: installerPath, type: "application/octet-stream" },
  { file: blockmapPath, type: "application/octet-stream" },
  { file: latestPath, type: "text/yaml" },
];
for (const { file, type } of uploads) {
  const name = path.basename(file);
  // A previous failed run may have left a partial copy on the draft.
  const stale = release.assets?.find((a) => a.name === name);
  if (stale)
    await gh("DELETE", `/repos/${owner}/${repo}/releases/assets/${stale.id}`);
  step(`Uploading ${name}`);
  const data = file === installerPath ? installer : readFileSync(file);
  const asset = await gh(
    "POST",
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    { body: data, headers: { "Content-Type": type } },
  );
  console.log(`  ${asset.state}, ${asset.size} bytes`);
  if (
    file === installerPath &&
    asset.digest &&
    asset.digest !== `sha256:${installerSha256}`
  )
    fail(
      `GitHub's digest for ${name} (${asset.digest}) doesn't match the local file`,
    );
}

// 5. Publish ──────────────────────────────────────────────────────────────────
if (keepDraft) {
  console.log(
    `\n✓ Uploaded to draft ${tag}: ${release.html_url}\n  Publish it on GitHub when ready.`,
  );
  process.exit(0);
}
step(`Publishing ${tag}`);
const published = await gh(
  "PATCH",
  `/repos/${owner}/${repo}/releases/${release.id}`,
  {
    body: { draft: false, make_latest: "true" },
  },
);
console.log(`\n✓ Released ${tag}: ${published.html_url}`);
