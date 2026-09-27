import base from "@repo/eslint-config/base";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["src/codex/protocol/**"]),
  ...base,
]);
