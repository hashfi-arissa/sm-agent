import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import globals from "globals";

import base from "./base.js";

/** Shared ESLint config for React library packages (packages/ui). */
export default defineConfig([
  ...base,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"],
  pluginReactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react/prop-types": "off",
    },
  },
]);
