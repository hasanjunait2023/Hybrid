// ESLint flat config preset for the Next.js app. Extends base + no-raw-sql.
import { base } from "./base.mjs";
import { noRawSql } from "./no-raw-sql.mjs";
import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export const next = [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  noRawSql,
];

export default next;
