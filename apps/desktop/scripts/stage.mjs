// Prepares everything the desktop app ships next to its own code, in .stage/:
//
//   server/      Next.js standalone build of apps/app (server.js + traced node_modules)
//   migrations/  drizzle migrations from packages/db (applied when the app opens the db)
//   codex/       Codex CLI binary for this platform, used when no system install exists
//
// electron-builder copies these into the installer as extraResources; `pnpm start` runs
// the unpackaged app against them.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const desktopDir = path.resolve(import.meta.dirname, "..");
const repoRoot = realpathSync(path.resolve(desktopDir, "..", ".."));
const appDir = path.join(repoRoot, "apps", "app");
const stageDir = path.join(desktopDir, ".stage");

/** Longest Windows username the install path must still fit under MAX_PATH with. */
const USERNAME_BUDGET = 20;

const CODEX_TARGETS = {
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
};

function step(message) {
  console.log(`\n▸ ${message}`);
}

// 1. Next.js standalone build ──────────────────────────────────────────────────
step("Building apps/app (standalone)");
const nextBin = createRequire(path.join(appDir, "package.json")).resolve(
  "next/dist/bin/next",
);
const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: appDir,
  env: { ...process.env, SMA_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

// 2. Server ────────────────────────────────────────────────────────────────────
step("Staging server");
const standalone = realpathSync(path.join(appDir, ".next", "standalone"));
const serverDir = path.join(stageDir, "server");
copyTree(standalone, serverDir);
hoistPnpmFallback(path.join(serverDir, "node_modules"));
shortenPnpmDirs(path.join(serverDir, "node_modules"));
copyTree(
  path.join(appDir, ".next", "static"),
  path.join(serverDir, "apps", "app", ".next", "static"),
);
if (existsSync(path.join(appDir, "public")))
  copyTree(
    path.join(appDir, "public"),
    path.join(serverDir, "apps", "app", "public"),
  );

// 3. Migrations ────────────────────────────────────────────────────────────────
step("Staging migrations");
copyTree(
  path.join(repoRoot, "packages", "db", "drizzle"),
  path.join(stageDir, "migrations"),
);

// 4. Codex ─────────────────────────────────────────────────────────────────────
const platformKey = `${process.platform}-${process.arch}`;
const triple = CODEX_TARGETS[platformKey];
if (!triple) throw new Error(`No Codex build for ${platformKey}`);
step(`Staging Codex (${triple})`);
const codexPkg = createRequire(path.join(desktopDir, "package.json")).resolve(
  "@openai/codex/package.json",
);
const vendorPkg = createRequire(realpathSync(codexPkg)).resolve(
  `@openai/codex-${platformKey}/package.json`,
);
copyTree(
  path.join(path.dirname(vendorPkg), "vendor", triple),
  path.join(stageDir, "codex"),
);

assertPathBudget(stageDir);
step(`Staged ${formatBytes(dirSize(stageDir))} in ${stageDir}`);

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively copies `src` to `dest`, replacing symlinks with real copies (installers
 * can't carry pnpm's links). On Windows, Next's standalone output links back into the
 * repo's node_modules; such links are redirected to the traced copy inside the standalone
 * folder so only the traced files ship.
 */
function copyTree(src, dest, ancestors = new Set()) {
  const real = realpathSync(src);
  if (ancestors.has(real)) return; // symlink cycle
  const stat = statSync(real);
  if (!stat.isDirectory()) {
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(real, dest);
    return;
  }
  const chain = new Set(ancestors).add(real);
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(real)) {
    const from = path.join(real, entry);
    const to = path.join(dest, entry);
    copyTree(
      lstatSync(from).isSymbolicLink() ? linkSource(from) : from,
      to,
      chain,
    );
  }
}

function linkSource(link) {
  const target = realpathSync(link);
  const inRepo = target.startsWith(repoRoot + path.sep);
  const inStandalone = target.startsWith(standalone + path.sep);
  if (inRepo && !inStandalone) {
    const traced = path.join(standalone, path.relative(repoRoot, target));
    if (existsSync(traced)) return traced;
  }
  return target;
}

/**
 * With symlinks gone, a package copied out of `.pnpm/<pkg>/node_modules/` (e.g. the app's
 * `node_modules/next`) can no longer see its sibling dependencies. pnpm keeps one copy of
 * every package in `.pnpm/node_modules` as a fallback; moving those up to the top-level
 * `node_modules` makes them reachable from anywhere below it, like an npm-hoisted install.
 */
function hoistPnpmFallback(nodeModules) {
  const fallback = path.join(nodeModules, ".pnpm", "node_modules");
  if (!existsSync(fallback)) return;
  for (const entry of readdirSync(fallback)) {
    const to = path.join(nodeModules, entry);
    if (existsSync(to)) continue;
    renameSync(path.join(fallback, entry), to);
  }
}

/**
 * pnpm names its store folders after the package, version and peer-dependency hash
 * (`.pnpm/next@16.3.6_@babel+core@7.2_b88af3c6…`). Installed under
 * `%LOCALAPPDATA%\Programs\social-media-agent\resources`, that pushed a file past
 * Windows' 260-character MAX_PATH, and NSIS can't delete or overwrite such files, so
 * updates got stuck on
 * "cannot be closed". Nothing resolves these folders by name once the links are
 * flattened (Node walks up to the nearest node_modules), so give them short names.
 */
function shortenPnpmDirs(nodeModules) {
  const store = path.join(nodeModules, ".pnpm");
  if (!existsSync(store)) return;
  const fallback = path.join(store, "node_modules");
  if (existsSync(fallback) && readdirSync(fallback).length === 0)
    rmSync(fallback, { recursive: true });
  readdirSync(store)
    .filter((entry) => entry !== "node_modules")
    .sort()
    .forEach((entry, i) =>
      renameSync(path.join(store, entry), path.join(store, String(i))),
    );
}

/**
 * Staged files end up at `<install dir>\resources\<relative path>`. Assume a Windows
 * username of up to USERNAME_BUDGET characters and fail the build if any path could
 * exceed MAX_PATH (259 characters plus the terminator), rather than ship an installer
 * that can't update itself.
 */
function assertPathBudget(root) {
  const prefix = path.win32.join(
    "C:\\Users",
    "u".repeat(USERNAME_BUDGET),
    "AppData\\Local\\Programs\\social-media-agent\\resources\\",
  );
  const budget = 259 - prefix.length;
  let longest = "";
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (rel.length > longest.length) longest = rel;
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  if (longest.length > budget)
    throw new Error(
      `Staged path is ${longest.length} chars (budget ${budget}); installed it would pass MAX_PATH:\n  ${longest}`,
    );
  console.log(`  longest staged path: ${longest.length}/${budget} chars`);
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

function formatBytes(n) {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
