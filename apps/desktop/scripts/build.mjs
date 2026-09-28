// Bundles the Electron main process and preload script into dist/ (CommonJS, no
// node_modules needed at runtime — electron-updater is bundled in).
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: "linked",
  logLevel: "info",
};

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/main/main.ts"],
    outfile: "dist/main.cjs",
  }),
  build({
    ...common,
    entryPoints: ["src/preload.ts"],
    outfile: "dist/preload.cjs",
  }),
]);
