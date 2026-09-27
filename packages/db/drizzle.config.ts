import path from "node:path";

import { defineConfig } from "drizzle-kit";

import { resolveDataDir } from "./src/paths";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: path.join(resolveDataDir(), "app.db") },
});
