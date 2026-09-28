import type { DesktopBridge } from "@repo/types";

/** The desktop app's preload bridge, or null in a regular browser (`pnpm dev`). */
export function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as { smaDesktop?: DesktopBridge }).smaDesktop ?? null;
}
