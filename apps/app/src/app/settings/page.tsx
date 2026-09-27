import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Download } from "lucide-react";
import type { Metadata } from "next";

import { ImportBackupForm } from "./import-backup-form";

export const metadata: Metadata = {
  title: "Settings · Social Media Agent",
};

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Data lives locally, in this app.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Export every draft, content and schedule entry as one JSON file, or
            restore from a file exported here.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/export"
              download
              className={buttonVariants({ variant: "outline" })}
            >
              <Download data-icon="inline-start" />
              Download backup
            </a>
            <ImportBackupForm />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
