import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Walks up from `start` to the directory containing `pnpm-workspace.yaml`.
 * Works from the repo root, any package dir, or `apps/app` (Next's cwd).
 */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find the repo root (pnpm-workspace.yaml) above ${start}. ` +
          "Set SMA_DATA_DIR and SMA_MIGRATIONS_DIR explicitly.",
      );
    }
    dir = parent;
  }
}

/** Folder holding the SQLite file. Override with SMA_DATA_DIR (e.g. Electron userData in M5). */
export function resolveDataDir(): string {
  return process.env.SMA_DATA_DIR ?? path.join(findRepoRoot(), "data");
}

/** Folder holding drizzle-kit migrations. Override with SMA_MIGRATIONS_DIR. */
export function resolveMigrationsDir(): string {
  return (
    process.env.SMA_MIGRATIONS_DIR ??
    path.join(findRepoRoot(), "packages", "db", "drizzle")
  );
}
