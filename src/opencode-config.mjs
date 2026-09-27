/**
 * Copyright (c) 2026 Devrecated
 *
 * opencode project config after login. Mirror of the Claude Code kit install:
 * apply the `kits/opencode` plugin payload into `.opencode/` (skills, agents,
 * commands, the guard plugin) and write the project-scope `opencode.json`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { kitServerRelForRoot } from "./kit-mcp.mjs";
import { hostMcpHttpUrl, isRemoteMcpHost } from "./mcp-attach.mjs";
import { HOST_MCP_NAME, KIT_MCP_NAME } from "./workspace-mcp.mjs";

export const OPENCODE_KIT_REL = "kits/opencode";
export const OPENCODE_PROJECT_DIR = ".opencode";
export const OPENCODE_CONFIG_FILE = "opencode.json";

export const RESERVED_OPENCODE_KEYS = Object.freeze([
  "$schema",
  "username",
  "model",
  "small_model",
  "default_agent",
  "shell",
  "logLevel",
  "share",
  "autoupdate",
  "snapshot",
  "instructions",
  "skills",
  "references",
  "agent",
  "command",
  "provider",
  "disabled_providers",
  "enabled_providers",
  "mcp",
  "plugin",
  "permission",
  "formatter",
  "lsp",
  "experimental",
  "tool_output",
  "compaction",
]);

export const resolveOpenCodeKit = ({ pluginRoot, kitRoot } = {}) => {
  if (pluginRoot && existsSync(join(pluginRoot, OPENCODE_KIT_REL))) {
    return join(pluginRoot, OPENCODE_KIT_REL);
  }
  const kit = kitRoot || "";
  if (kit && existsSync(join(kit, OPENCODE_KIT_REL))) return join(kit, OPENCODE_KIT_REL);
  return "";
};

/**
 * Relative stdio paths resolve against the project root and are spawned from
 * the project directory. opencode non-strict hosts may send a kind here; keep
 * `type` explicit for `local` / `remote`.
 */
export const opencodeMcpServers = (root, origin = "") => ({
  [KIT_MCP_NAME]: {
    type: "local",
    command: ["node", `./${kitServerRelForRoot(root).replaceAll("\\", "/")}`],
  },
  [HOST_MCP_NAME]: isRemoteMcpHost(origin)
    ? { type: "remote", url: hostMcpHttpUrl(origin) }
    : {
        type: "local",
        command: ["node", "./node_modules/@devrecated/autodevelop/packages/cli/bin.mjs", "mcp"],
      },
});

const isReservedKey = (key) => RESERVED_OPENCODE_KEYS.includes(key);

/** Merge into the existing config, keeping user keys that opencode defines. */
export const mergeOpenCodeConfig = (existing, servers, { includeInstructions = true } = {}) => {
  const current = existing && typeof existing === "object" ? existing : {};
  const next = {};
  for (const [key, value] of Object.entries(current)) {
    if (isReservedKey(key)) next[key] = value;
  }
  next.$schema = "https://opencode.ai/config.json";
  const agentsMd = "./" + OPENCODE_PROJECT_DIR + "/AGENTS.md";
  const existingInstructions = Array.isArray(next.instructions) ? next.instructions : [];
  if (includeInstructions) {
    next.instructions = existingInstructions.includes(agentsMd)
      ? existingInstructions
      : [...existingInstructions, agentsMd];
  } else {
    delete next.instructions;
  }
  next.mcp = {
    ...(next.mcp && typeof next.mcp === "object" && !Array.isArray(next.mcp) ? next.mcp : {}),
    ...servers,
  };
  return next;
};

export const writeOpenCodeConfig = (root, origin = "") => {
  const dest = join(resolve(root), OPENCODE_PROJECT_DIR, OPENCODE_CONFIG_FILE);
  let existing = {};
  if (existsSync(dest)) {
    try {
      existing = JSON.parse(readFileSync(dest, "utf8") || "{}");
    } catch {
      existing = {};
    }
  }
  mkdirSync(dirname(dest), { recursive: true });
  const agentsMd = join(resolve(root), OPENCODE_PROJECT_DIR, "AGENTS.md");
  writeFileSync(dest, `${JSON.stringify(mergeOpenCodeConfig(existing, opencodeMcpServers(root, origin), { includeInstructions: existsSync(agentsMd) }), null, 2)}\n`);
  return dest;
};

export const copyMissingOnly = (src, dest) => {
  if (!src || !existsSync(src) || existsSync(dest)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  return true;
};

export const applyOpenCodeKitToWorkspace = ({ pluginRoot, workspaceRoot, kitRoot, origin = "" } = {}) => {
  const workspace = resolve(workspaceRoot);
  const source = resolveOpenCodeKit({ pluginRoot, kitRoot });
  if (!source || !existsSync(source)) return null;
  const opencode = join(workspace, OPENCODE_PROJECT_DIR);
  for (const name of ["skills", "commands", "agents", "plugins"]) {
    const src = join(source, name);
    const dest = join(opencode, name);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    if (!existsSync(src)) continue;
    cpSync(src, dest, { recursive: true });
  }
  copyMissingOnly(join(source, "AGENTS.md"), join(opencode, "AGENTS.md"));
  writeOpenCodeConfig(workspace, origin);
  return {
    workspace,
    opencodeDir: opencode,
    source,
    config: join(opencode, OPENCODE_CONFIG_FILE),
    agentsMd: join(opencode, "AGENTS.md"),
  };
};