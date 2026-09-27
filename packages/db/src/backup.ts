// Export / restore the whole local database as one JSON snapshot (M4 backup).
import type { Backup } from "@repo/types";

import type { Db } from "./client";
import {
  chatMessages,
  contents,
  draftDocuments,
  draftSessions,
  scheduleEntries,
} from "./schema";

/** Every row in the database, for download as a backup file. */
export function exportBackup(db: Db): Backup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    draftSessions: db.select().from(draftSessions).all(),
    draftDocuments: db.select().from(draftDocuments).all(),
    chatMessages: db.select().from(chatMessages).all(),
    contents: db.select().from(contents).all(),
    scheduleEntries: db.select().from(scheduleEntries).all(),
  };
}

/**
 * Replaces every row in the database with the backup's contents. Destructive — the caller
 * must confirm with the user first. Runs in one transaction: deletes in reverse dependency
 * order, then inserts in dependency order (parents before the rows that reference them).
 */
export function importBackup(db: Db, backup: Backup): void {
  db.transaction((tx) => {
    tx.delete(scheduleEntries).run();
    tx.delete(contents).run();
    tx.delete(chatMessages).run();
    tx.delete(draftDocuments).run();
    tx.delete(draftSessions).run();

    if (backup.draftSessions.length)
      tx.insert(draftSessions).values(backup.draftSessions).run();
    if (backup.draftDocuments.length)
      tx.insert(draftDocuments).values(backup.draftDocuments).run();
    if (backup.chatMessages.length)
      tx.insert(chatMessages).values(backup.chatMessages).run();
    if (backup.contents.length)
      tx.insert(contents).values(backup.contents).run();
    if (backup.scheduleEntries.length)
      tx.insert(scheduleEntries).values(backup.scheduleEntries).run();
  });
}
