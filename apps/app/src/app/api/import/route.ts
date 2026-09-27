import { getDb, importBackup } from "@repo/db";
import { backupSchema } from "@repo/types";

import { parseBody } from "@/lib/api";

/** Restores the database from a backup file, replacing everything currently stored. */
export async function POST(request: Request) {
  const body = await parseBody(request, backupSchema);
  if ("response" in body) return body.response;

  importBackup(getDb(), body.data);
  return Response.json({ ok: true });
}
