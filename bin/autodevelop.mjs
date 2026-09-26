#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 *
 * Published GitHub Package entry. Customer commands only. Downloads the hosted kit after login.
 */
import { fail } from "../../../.cursor/skills/autodevelop-internal/scripts/lib.mjs";
import { customerMain } from "../src/customer.mjs";
import { isDirectRun } from "../src/direct-run.mjs";

if (isDirectRun(import.meta.url)) {
  customerMain().then(
    (code) => {
      if (code) process.exit(code);
    },
    (error) => fail(error.message),
  );
}
