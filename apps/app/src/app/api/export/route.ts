import { exportBackup, getDb } from "@repo/db";

/** Downloads the whole local database as one JSON backup file. */
export async function GET() {
  const backup = exportBackup(getDb());
  const date = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="social-media-agent-backup-${date}.json"`,
    },
  });
}
