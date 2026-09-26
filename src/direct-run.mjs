/**
 * Copyright (c) 2026 Devrecated
 *
 * Compare this module to process.argv[1] through realpath so pnpm
 * symlinks still count as a direct CLI run.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const isDirectRun = (metaUrl, argv1 = process.argv[1]) => {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argv1);
  } catch {
    return fileURLToPath(metaUrl) === argv1;
  }
};
