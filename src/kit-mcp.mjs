#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 *
 * Cursor user-global stdio launcher (`command` + `args` in ~/.cursor/mcp.json).
 * Not marketplace plugin HTTP/OAuth — login copies this file next to credentials.
 * Resolves the workspace (env, cwd/PWD walk, then lastWorkspace). No tokens.
 *
 * Project `.cursor/mcp.json` with `${workspaceFolder}` is the reliable kit attach
 * when Cursor starts the project server. This user launcher still has to find
 * the repo if spawn cwd is not the workspace.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_SERVER_RELS = [
  join(".cursor", "skills", "autodevelop", "mcp", "server.mjs"),
  join(".cursor", "skills", "autodevelop-internal", "mcp", "server.mjs"),
];
export const KIT_SERVER_REL = KIT_SERVER_RELS[0];
export const INSTALL_SIDECAR = "install.json";

/** Env keys Cursor / VS Code / Claude-compat hooks have used for the open folder. */
export const WORKSPACE_ENV_KEYS = [
  "CURSOR_PROJECT_DIR",
  "CURSOR_WORKSPACE",
  "CURSOR_WORKSPACE_ROOT",
  "CURSOR_WORKSPACE_PATH",
  "VSCODE_CWD",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_PROJECT_ROOT",
];

export const kitServerRelForRoot = (root) => {
  if (!root) return KIT_SERVER_REL;
  for (const rel of KIT_SERVER_RELS) {
    if (existsSync(join(root, rel))) return rel;
  }
  return KIT_SERVER_REL;
};

export const kitAtRoot = (root) => {
  if (!root) return "";
  for (const rel of KIT_SERVER_RELS) {
    const candidate = join(root, rel);
    if (existsSync(candidate)) return candidate;
  }
  return "";
};

export const findKitServer = (start = process.cwd()) => {
  if (!start) return "";
  let dir = resolve(start);
  for (;;) {
    const found = kitAtRoot(dir);
    if (found) return found;
    if (existsSync(join(dir, ".git"))) return "";
    const parent = dirname(dir);
    if (parent === dir) return "";
    dir = parent;
  }
};

const uniqueDirs = (dirs) => {
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    const value = String(dir || "").trim();
    if (!value) continue;
    const abs = resolve(value);
    if (seen.has(abs) || !existsSync(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
};

export const workspaceHintsFromEnv = (env = process.env) => {
  const dirs = [];
  for (const key of WORKSPACE_ENV_KEYS) {
    dirs.push(String(env[key] || "").trim());
  }
  return uniqueDirs(dirs);
};

export const readRecordedWorkspace = (configDir) => {
  const sidecar = join(configDir || "", INSTALL_SIDECAR);
  if (!configDir || !existsSync(sidecar)) return "";
  try {
    const data = JSON.parse(readFileSync(sidecar, "utf8") || "{}");
    const root = String(data.lastWorkspace || "").trim();
    return root && existsSync(root) ? resolve(root) : "";
  } catch {
    return "";
  }
};

export const resolveKitServer = ({
  start = process.cwd(),
  env = process.env,
  configDir,
} = {}) => {
  const starts = [
    ...workspaceHintsFromEnv(env),
    start,
    String(env.PWD || "").trim(),
    String(env.INIT_CWD || "").trim(),
  ];
  for (const dir of uniqueDirs(starts)) {
    const found = findKitServer(dir);
    if (found) return found;
  }
  const recorded = readRecordedWorkspace(configDir);
  if (recorded) {
    const atRoot = kitAtRoot(recorded);
    if (atRoot) return atRoot;
    const walked = findKitServer(recorded);
    if (walked) return walked;
  }
  return "";
};

export const missingKitMessage =
  "Autodevelop is not installed in this repository. Run npx @devrecated/autodevelop login from the project root.";

const runKitMcp = () => {
  const configDir = dirname(fileURLToPath(import.meta.url));
  const found = resolveKitServer({ start: process.cwd(), env: process.env, configDir });
  if (!found) {
    process.stderr.write(`${missingKitMessage}\n`);
    process.exit(1);
  }
  const child = spawn(process.execPath, [found], { stdio: "inherit" });
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

if (isMain) runKitMcp();
