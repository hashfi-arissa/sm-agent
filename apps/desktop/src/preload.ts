// Runs in the sandboxed renderer before the app loads; exposes a small, typed bridge to
// the main process as `window.smaDesktop` (see DesktopBridge in @repo/types).
import type { DesktopBridge, UpdateStatus } from "@repo/types";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const bridge: DesktopBridge = {
  getInfo: () => ipcRenderer.invoke("desktop:info"),
  openLogsFolder: () => ipcRenderer.invoke("desktop:open-logs"),
  openDataFolder: () => ipcRenderer.invoke("desktop:open-data"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  onUpdateStatus(listener) {
    const handler = (_event: IpcRendererEvent, status: UpdateStatus) =>
      listener(status);
    ipcRenderer.on("desktop:update-status", handler);
    return () => ipcRenderer.off("desktop:update-status", handler);
  },
};

contextBridge.exposeInMainWorld("smaDesktop", bridge);
