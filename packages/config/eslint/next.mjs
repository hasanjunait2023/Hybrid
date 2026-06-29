// ESLint flat config preset for the Next.js app. Extends base + no-raw-sql +
// no-hardcoded-color (design-token enforcement).
import { base } from "./base.mjs";
import { noRawSql } from "./no-raw-sql.mjs";
import { noHardcodedColor } from "./no-hardcoded-color.mjs";
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
  noHardcodedColor,
];

export default next;
