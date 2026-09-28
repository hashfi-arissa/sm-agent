import path from "node:path";

import type { DesktopInfo } from "@repo/types";
import {
  app,
  BrowserWindow,
  crashReporter,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  session,
  shell,
} from "electron";

import { createLogger } from "./logger";
import { type RunningServer, startServer, TOKEN_HEADER } from "./server";
import {
  checkForUpdates,
  initUpdater,
  installUpdate,
  updateStatus,
} from "./updater";

const APP_ID = "com.hashfi.social-media-agent";
/** Set to a `next dev` URL (e.g. http://localhost:3000) to run the shell against it. */
const DEV_URL = process.env.SMA_APP_URL;

// Native crash dumps stay on disk (app.getPath("crashDumps")); nothing is uploaded.
crashReporter.start({ uploadToServer: false });

const logsDir = app.getPath("logs");
const dataDir = path.join(app.getPath("userData"), "data");
const log = createLogger(logsDir, "main", { echo: !app.isPackaged });
const serverLog = createLogger(logsDir, "server", { echo: !app.isPackaged });

let win: BrowserWindow | null = null;
let server: RunningServer | null = null;
let appOrigin: string | null = null;
let quitting = false;

process.on("uncaughtException", (error) =>
  log.error("uncaught exception:", error),
);
process.on("unhandledRejection", (reason) =>
  log.error("unhandled rejection:", reason),
);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.setAppUserModelId(APP_ID);
  void app.whenReady().then(boot);
}

async function boot() {
  log.info(
    `starting ${app.getName()} ${app.getVersion()} (electron ${process.versions.electron}, packaged: ${app.isPackaged})`,
  );
  registerIpc();
  hardenSession();
  Menu.setApplicationMenu(buildMenu());
  initUpdater({
    log,
    onStatus: (status) =>
      win?.webContents.send("desktop:update-status", status),
  });

  app.on("child-process-gone", (_e, details) =>
    log.error("child process gone:", details),
  );
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (quitting || !server) return;
    // Stop the server (and with it Codex) before exiting.
    event.preventDefault();
    quitting = true;
    void server.stop().finally(() => app.quit());
  });

  createWindow();
  await startApp();
}

function resourcesRoot() {
  // Packaged: electron-builder extraResources. Unpackaged: output of scripts/stage.mjs.
  return app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), ".stage");
}

async function startApp() {
  if (DEV_URL) {
    appOrigin = new URL(DEV_URL).origin;
    await win?.loadURL(DEV_URL);
    return;
  }
  const root = resourcesRoot();
  const codexExe = process.platform === "win32" ? "codex.exe" : "codex";
  try {
    server = await startServer({
      paths: {
        serverScript: path.join(root, "server", "apps", "app", "server.js"),
        migrationsDir: path.join(root, "migrations"),
        bundledCodex: path.join(root, "codex", "bin", codexExe),
        dataDir,
      },
      appVersion: app.getVersion(),
      log: serverLog,
      onExit: (code, signal) => void onServerCrash(code, signal),
    });
  } catch (error) {
    log.error("server failed to start:", error);
    await failDialog(
      "Social Media Agent couldn't start",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }
  appOrigin = server.url;
  const token = server.token;
  // Every request to the local server carries the per-launch token; other local
  // processes and web pages can't reach the API without it.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${server.url}/*`] },
    (details, callback) => {
      details.requestHeaders[TOKEN_HEADER] = token;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  await win?.loadURL(server.url);
}

async function onServerCrash(code: number | null, signal: string | null) {
  server = null;
  if (quitting) return;
  log.error(`server stopped unexpectedly (code ${code}, signal ${signal})`);
  const { response } = await dialog.showMessageBox({
    type: "error",
    title: "Social Media Agent",
    message: "The app stopped working.",
    detail:
      "Your data is saved. Restart the app, or open the logs to see what happened.",
    buttons: ["Restart", "Open logs", "Quit"],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 0) {
    await showLoading();
    await startApp();
  } else if (response === 1) {
    await shell.openPath(logsDir);
    app.quit();
  } else {
    app.quit();
  }
}

async function failDialog(message: string, detail: string) {
  const { response } = await dialog.showMessageBox({
    type: "error",
    title: "Social Media Agent",
    message,
    detail,
    buttons: ["Open logs", "Quit"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await shell.openPath(logsDir);
  app.quit();
}

// ── window ───────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Social Media Agent",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
    autoHideMenuBar: true,
    // Packaged builds use the exe icon (assets/icon.ico); give the dev window the same one.
    icon: app.isPackaged
      ? undefined
      : path.join(app.getAppPath(), "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => (win = null));

  const contents = win.webContents;
  // Links to the app open here; everything else goes to the system browser (this is how
  // "Sign in with ChatGPT" reaches the user's browser).
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) void win?.loadURL(url);
    else openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event) => {
    if (isAppUrl(event.url) || event.url.startsWith("data:")) return;
    event.preventDefault();
    openExternal(event.url);
  });
  contents.on("render-process-gone", (_e, details) => {
    log.error("renderer gone:", details);
    if (details.reason !== "clean-exit" && appOrigin) contents.reload();
  });
  contents.on("console-message", (event) => {
    if (event.level === "error")
      log.error(
        `[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`,
      );
  });

  void showLoading();
}

function showLoading() {
  const html = `<!doctype html><meta charset="utf-8"><title>Social Media Agent</title>
<style>:root{color-scheme:light dark}body{margin:0;height:100vh;display:grid;place-items:center;
font:14px system-ui,sans-serif;background:Canvas;color:GrayText}</style>
<body>Starting Social Media Agent…</body>`;
  return win?.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  );
}

function isAppUrl(url: string) {
  try {
    return appOrigin !== null && new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

function openExternal(url: string) {
  try {
    const { protocol } = new URL(url);
    if (protocol === "https:" || protocol === "http:" || protocol === "mailto:")
      void shell.openExternal(url);
    else log.warn("blocked navigation to", url);
  } catch {
    log.warn("blocked navigation to invalid URL", url);
  }
}

function hardenSession() {
  const allowed = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(allowed.has(permission)),
  );
}

// ── IPC (see src/preload.ts) ─────────────────────────────────────────────────

function registerIpc() {
  const handle = (
    channel: string,
    fn: (event: IpcMainInvokeEvent) => unknown,
  ) =>
    ipcMain.handle(channel, (event) => {
      // Only the app's own pages may call in.
      if (!isAppUrl(event.senderFrame?.url ?? ""))
        throw new Error("Not allowed");
      return fn(event);
    });

  handle("desktop:info", (): DesktopInfo => ({
    version: app.getVersion(),
    logsDir,
    dataDir,
    update: updateStatus(),
  }));
  handle("desktop:open-logs", () => openFolder(logsDir));
  handle("desktop:open-data", () => openFolder(dataDir));
  handle("desktop:check-updates", () => checkForUpdates());
  handle("desktop:install-update", () => installUpdate());
}

async function openFolder(dir: string) {
  const error = await shell.openPath(dir);
  if (error) log.warn(`could not open ${dir}: ${error}`);
}

// ── menu ─────────────────────────────────────────────────────────────────────

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Check for Updates…",
          enabled: app.isPackaged,
          click: () => void manualUpdateCheck(),
        },
        { label: "Open Logs Folder", click: () => void openFolder(logsDir) },
        { label: "Open Data Folder", click: () => void openFolder(dataDir) },
        { type: "separator" },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

async function manualUpdateCheck() {
  const status = await checkForUpdates();
  if (status.state === "up_to_date") {
    await dialog.showMessageBox({
      type: "info",
      message: "You're up to date.",
      detail: `Social Media Agent ${app.getVersion()} is the latest version.`,
    });
  } else if (status.state === "downloading") {
    await dialog.showMessageBox({
      type: "info",
      message: `Downloading version ${status.version}…`,
      detail: "You'll be asked to restart when it's ready.",
    });
  } else if (status.state === "error") {
    await dialog.showMessageBox({
      type: "warning",
      message: "Couldn't check for updates.",
      detail: status.message,
    });
  }
}
