import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export interface CodexLaunch {
  command: string;
  /** Arguments placed before the codex subcommand (e.g. the launcher script). */
  args: string[];
}

/**
 * Finds how to start the Codex CLI without going through a shell.
 *
 * - `CODEX_BIN` env var wins (path to the codex binary or launcher script).
 * - npm installs: run the package's `bin/codex.js` with the current Node, the same way the
 *   npm shim does. Avoids `shell: true` on Windows, which would leave orphaned processes.
 * - Other installs (Homebrew, standalone binary): run the executable directly.
 *
 * Returns null when Codex is not installed. Note for Electron (M5): `process.execPath` is the
 * Electron binary there, so set ELECTRON_RUN_AS_NODE or CODEX_BIN.
 */
export function resolveCodexLaunch(): CodexLaunch | null {
  const override = process.env.CODEX_BIN;
  if (override) return fromExecutable(override);

  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    // Windows npm global layout: <prefix>\codex.cmd + <prefix>\node_modules\@openai\codex
    const launcher = path.join(
      dir,
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    if (existsSync(launcher))
      return { command: process.execPath, args: [launcher] };

    const binary = path.join(
      dir,
      process.platform === "win32" ? "codex.exe" : "codex",
    );
    if (existsSync(binary)) return fromExecutable(binary);
  }
  return null;
}

function fromExecutable(file: string): CodexLaunch {
  const real = realpathSync(file);
  // Unix npm global installs symlink bin/codex → .../@openai/codex/bin/codex.js
  if (real.endsWith(".js")) return { command: process.execPath, args: [real] };
  return { command: real, args: [] };
}
