import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { resolveDataDir, resolveMigrationsDir } from "./paths";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Opens (creating if needed) a SQLite database and applies pending migrations.
 * Pass ":memory:" for tests.
 */
export function createDb(
  file: string,
  migrationsFolder = resolveMigrationsDir(),
) {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle({ client: sqlite, schema, casing: "snake_case" });
  migrate(db, { migrationsFolder });
  return db;
}

// One connection per server process; kept on globalThis so Next.js dev reloads reuse it.
const globalForDb = globalThis as unknown as { __smaDb?: Db };

/** The app's database at `<data dir>/app.db`. */
export function getDb(): Db {
  globalForDb.__smaDb ??= createDb(path.join(resolveDataDir(), "app.db"));
  return globalForDb.__smaDb;
}
