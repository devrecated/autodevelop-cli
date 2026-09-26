/**
 * Copyright (c) 2026 Devrecated
 *
 * Claude Code project config after login. Mirror of the Cursor kit install:
 * apply the `kits/claude` plugin payload into `.claude/` (commands, agents,
 * rules, hooks) and write the project-scope `.mcp.json`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { kitServerRelForRoot } from "./kit-mcp.mjs";
import { hostMcpHttpUrl, isRemoteMcpHost } from "./mcp-attach.mjs";
import { HOST_MCP_NAME, KIT_MCP_NAME, mergeWorkspaceMcp } from "./workspace-mcp.mjs";

export const CLAUDE_KIT_REL = "kits/claude";
export const CLAUDE_PROJECT_DIR = ".claude";
export const CLAUDE_MCP_FILE = ".mcp.json";

/** Rewrite the plugin-rooted adapter path to the project `.claude` layout. */
export const claudeStandaloneHooksJson = (raw) =>
  String(raw || "")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}/hooks/", "${CLAUDE_PROJECT_DIR}/.claude/hooks/")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}/", "${CLAUDE_PROJECT_DIR}/.claude/");

export const resolveClaudeKit = ({ pluginRoot, kitRoot } = {}) => {
  if (pluginRoot && existsSync(join(pluginRoot, CLAUDE_KIT_REL))) {
    return join(pluginRoot, CLAUDE_KIT_REL);
  }
  const kit = kitRoot || "";
  if (kit && existsSync(join(kit, CLAUDE_KIT_REL))) return join(kit, CLAUDE_KIT_REL);
  return "";
};

/** Relative stdio paths resolve against the project root in Claude Code. */
export const claudeMcpServers = (root, origin = "") => ({
  [KIT_MCP_NAME]: {
    command: "node",
    args: [`./${kitServerRelForRoot(root).replaceAll("\\", "/")}`],
  },
  [HOST_MCP_NAME]: isRemoteMcpHost(origin)
    ? { type: "http", url: hostMcpHttpUrl(origin) }
    : {
        command: "node",
        args: ["./node_modules/@devrecated/autodevelop/packages/cli/bin.mjs", "mcp"],
      },
});

export const writeClaudeMcp = (root, origin = "") => {
  const dest = join(resolve(root), CLAUDE_MCP_FILE);
  let existing = {};
  if (existsSync(dest)) {
    try {
      existing = JSON.parse(readFileSync(dest, "utf8") || "{}");
    } catch {
      existing = {};
    }
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(mergeWorkspaceMcp(existing, claudeMcpServers(root, origin)), null, 2)}\n`);
  return dest;
};

export const copyMissingOnly = (src, dest) => {
  if (!src || !existsSync(src) || existsSync(dest)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  return true;
};

export const applyClaudeKitToWorkspace = ({ pluginRoot, workspaceRoot, kitRoot } = {}) => {
  const workspace = resolve(workspaceRoot);
  const source = resolveClaudeKit({ pluginRoot, kitRoot });
  if (!source || !existsSync(source)) return null;
  const claude = join(workspace, CLAUDE_PROJECT_DIR);
  for (const name of ["rules", "commands", "agents"]) {
    const src = join(source, name);
    const dest = join(claude, name);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    if (!existsSync(src)) continue;
    cpSync(src, dest, { recursive: true });
  }
  const adapterSrc = join(source, "hooks", "autodevelop");
  if (existsSync(adapterSrc)) {
    const adapterDest = join(claude, "hooks", "autodevelop");
    if (existsSync(adapterDest)) rmSync(adapterDest, { recursive: true, force: true });
    cpSync(adapterSrc, adapterDest, { recursive: true });
  }
  const hooksJson = join(source, "hooks", "hooks.json");
  if (existsSync(hooksJson)) {
    mkdirSync(join(claude, "hooks"), { recursive: true });
    writeFileSync(join(claude, "hooks", "hooks.json"), claudeStandaloneHooksJson(readFileSync(hooksJson, "utf8")));
  }
  copyMissingOnly(join(source, "CLAUDE.md"), join(claude, "CLAUDE.md"));
  return {
    workspace,
    claudeDir: claude,
    source,
    hooksJson: existsSync(hooksJson) ? join(claude, "hooks", "hooks.json") : "",
    claudeMd: join(claude, "CLAUDE.md"),
  };
};