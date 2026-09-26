/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDirectRun } from "./direct-run.mjs";

test("isDirectRun treats a pnpm-style symlink as the same file", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-direct-"));
  const real = join(root, "store", "bin.mjs");
  const link = join(root, "node_modules", "pkg", "bin.mjs");
  mkdirSync(dirname(real), { recursive: true });
  mkdirSync(dirname(link), { recursive: true });
  writeFileSync(real, "export {}\n");
  symlinkSync(real, link);
  assert.equal(isDirectRun(pathToFileURL(real).href, link), true);
  assert.equal(isDirectRun(pathToFileURL(real).href, real), true);
  assert.equal(isDirectRun(pathToFileURL(real).href, join(root, "other.mjs")), false);
});
