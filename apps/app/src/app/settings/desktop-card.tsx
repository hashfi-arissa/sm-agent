"use client";

import type { DesktopInfo, UpdateStatus } from "@repo/types";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { FolderOpen, LoaderCircle, RefreshCw, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { getDesktop } from "@/lib/desktop";

/** Version, updates and local folders — only rendered inside the desktop app. */
export function DesktopCard() {
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    void desktop.getInfo().then((i) => {
      setInfo(i);
      setUpdate(i.update);
    });
    return desktop.onUpdateStatus(setUpdate);
  }, []);

  if (!info) return null;
  const desktop = getDesktop()!;

  async function check() {
    setChecking(true);
    try {
      setUpdate(await desktop.checkForUpdates());
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>App</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">Version {info.version}</span>
            <span className="text-muted-foreground" role="status">
              {describe(update)}
            </span>
          </div>
          {update?.state === "ready" ? (
            <Button onClick={() => void desktop.installUpdate()}>
              <RotateCw data-icon="inline-start" />
              Restart to update
            </Button>
          ) : (
            update?.state !== "disabled" && (
              <Button
                variant="outline"
                onClick={check}
                disabled={checking || update?.state === "downloading"}
              >
                {checking ? (
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}
                Check for updates
              </Button>
            )
          )}
        </section>

        <FolderRow
          label="Data folder"
          hint="Your drafts, contents and schedule (app.db)."
          path={info.dataDir}
          onOpen={() => void desktop.openDataFolder()}
        />
        <FolderRow
          label="Logs"
          hint="Error and crash logs. They stay on this computer — attach them when reporting a problem."
          path={info.logsDir}
          onOpen={() => void desktop.openLogsFolder()}
        />
      </CardContent>
    </Card>
  );
}

function FolderRow({
  label,
  hint,
  path,
  onOpen,
}: {
  label: string;
  hint: string;
  path: string;
  onOpen: () => void;
}) {
  return (
    <section className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{hint}</span>
        <code className="text-muted-foreground truncate font-mono text-xs">
          {path}
        </code>
      </div>
      <Button variant="outline" className="shrink-0" onClick={onOpen}>
        <FolderOpen data-icon="inline-start" />
        Open
      </Button>
    </section>
  );
}

function describe(status: UpdateStatus | null): string {
  switch (status?.state) {
    case undefined:
    case "idle":
      return "Updates install automatically.";
    case "disabled":
      return "Updates are only available in the installed app.";
    case "checking":
      return "Checking for updates…";
    case "up_to_date":
      return "You're on the latest version.";
    case "downloading":
      return status.percent === null
        ? `Downloading version ${status.version}…`
        : `Downloading version ${status.version}… ${status.percent}%`;
    case "ready":
      return `Version ${status.version} is ready — restart to install.`;
    case "error":
      return `Couldn't check for updates: ${status.message}`;
  }
}
