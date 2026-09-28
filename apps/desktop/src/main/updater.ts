import { existsSync } from "node:fs";
import path from "node:path";

import type { UpdateStatus } from "@repo/types";
import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

import type { Logger } from "./logger";

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let status: UpdateStatus = { state: "disabled" };
let notify: (status: UpdateStatus) => void = () => {};
let prompted: string | null = null;

export function updateStatus(): UpdateStatus {
  return status;
}

function set(next: UpdateStatus) {
  status = next;
  notify(next);
}

/**
 * Background updates from GitHub Releases (see `publish` in electron-builder.yml).
 * Downloads automatically, then asks to restart; a dismissed update installs on quit.
 * Only runs in installed builds.
 */
export function initUpdater(opts: {
  log: Logger;
  onStatus: (status: UpdateStatus) => void;
}) {
  const { log } = opts;
  notify = opts.onStatus;
  if (!app.isPackaged) return;
  // Written by electron-builder from `publish` for installer builds only (not `--dir`).
  if (!existsSync(path.join(process.resourcesPath, "app-update.yml"))) {
    log.info("[updater] no update feed configured; updates disabled");
    return;
  }

  autoUpdater.logger = {
    info: (m: unknown) => log.info("[updater]", m),
    warn: (m: unknown) => log.warn("[updater]", m),
    error: (m: unknown) => log.error("[updater]", m),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => set({ state: "checking" }));
  autoUpdater.on("update-not-available", (info) =>
    set({ state: "up_to_date", version: info.version }),
  );
  autoUpdater.on("update-available", (info) =>
    set({ state: "downloading", version: info.version, percent: null }),
  );
  autoUpdater.on("download-progress", (p) => {
    if (status.state === "downloading")
      set({ ...status, percent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    set({ state: "ready", version: info.version });
    void promptRestart(info.version);
  });
  autoUpdater.on("error", (error) =>
    set({ state: "error", message: describeError(error) }),
  );

  set({ state: "idle" });
  const check = () =>
    autoUpdater.checkForUpdates().catch((error: unknown) => {
      log.warn("[updater] check failed:", error);
    });
  setTimeout(check, FIRST_CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS).unref();
}

/** Manual "Check for updates"; resolves once the check settles. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (status.state === "disabled") return status;
  if (status.state === "ready" || status.state === "downloading") return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    set({ state: "error", message: describeError(error) });
  }
  return status;
}

export function installUpdate() {
  if (status.state === "ready") autoUpdater.quitAndInstall();
}

async function promptRestart(version: string) {
  if (prompted === version) return;
  prompted = version;
  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "Update ready",
    message: `Social Media Agent ${version} is ready to install.`,
    detail: "Restart now to finish updating, or it will install when you quit.",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) autoUpdater.quitAndInstall();
}

/** electron-updater errors can embed whole HTTP responses; keep it to one readable line. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code;
  if (code === "HTTP_ERROR_404")
    return "No published releases found on the update server.";
  if (code?.startsWith("HTTP_ERROR_"))
    return `The update server returned an error (${code.slice(11)}).`;
  const first = message.split("\n")[0]!.trim();
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}
