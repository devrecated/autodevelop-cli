#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 *
 * Cursor user-global launcher. Runs the customer CLI `mcp` stdio.
 * Resolves the CLI from install.json next to this file, then cwd.
 * No tokens in this file. Host MCP reads the active credentials profile.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_BIN_REL = join(
  "node_modules",
  "@devrecated",
  "autodevelop",
  "packages",
  "cli",
  "bin.mjs",
);
export const INSTALL_SIDECAR = "install.json";

export const readRecordedCli = (configDir) => {
  const sidecar = join(configDir, INSTALL_SIDECAR);
  if (!sidecar || !existsSync(sidecar)) return "";
  try {
    const data = JSON.parse(readFileSync(sidecar, "utf8") || "{}");
    const cli = String(data.cli || "").trim();
    return cli && existsSync(cli) ? cli : "";
  } catch {
    return "";
  }
};

export const walkCliBin = (start = process.cwd()) => {
  let dir = start;
  for (;;) {
    const candidate = join(dir, CLI_BIN_REL);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return "";
    dir = parent;
  }
};

export const findHostCli = ({ start = process.cwd(), configDir } = {}) =>
  (configDir ? readRecordedCli(configDir) : "") || walkCliBin(start);

export const missingHostMessage =
  "Autodevelop CLI is not installed in this repository. Run npx @devrecated/autodevelop login from the project root.";

const runHostMcp = () => {
  const configDir = dirname(fileURLToPath(import.meta.url));
  const found = findHostCli({ start: process.cwd(), configDir });
  if (!found) {
    process.stderr.write(`${missingHostMessage}\n`);
    process.exit(1);
  }
  const env = { ...process.env };
  const creds = join(configDir, "credentials.json");
  if (existsSync(creds) && !env.AUTODEVELOP_CREDENTIALS) {
    env.AUTODEVELOP_CREDENTIALS = creds;
  }
  const child = spawn(process.execPath, [found, "mcp"], { stdio: "inherit", env });
  child.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
};

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
})();

if (isMain) runHostMcp();
