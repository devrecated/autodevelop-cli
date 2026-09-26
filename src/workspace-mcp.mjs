/**
 * Copyright (c) 2026 Devrecated
 *
 * Write Cursor project MCP after login. Kit is always stdio. Host is HTTP
 * url when the credential host is remote.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { kitServerRelForRoot } from "./kit-mcp.mjs";
import { hostMcpHttpUrl, isRemoteMcpHost } from "./mcp-attach.mjs";

export const KIT_MCP_NAME = "autodevelop";
export const HOST_MCP_NAME = "autodevelop-host";
export const LEGACY_HOST_MCP_NAME = "autodevelop-buckets";

export const consumerMcpServers = (root, origin = "") => ({
  [KIT_MCP_NAME]: {
    command: "node",
    args: [`\${workspaceFolder}/${kitServerRelForRoot(root).replaceAll("\\", "/")}`],
  },
  [HOST_MCP_NAME]: isRemoteMcpHost(origin)
    ? { url: hostMcpHttpUrl(origin) }
    : {
        command: "node",
        args: ["${workspaceFolder}/node_modules/@devrecated/autodevelop/packages/cli/bin.mjs", "mcp"],
      },
});

export const mergeWorkspaceMcp = (existing, servers) => {
  const current = existing && typeof existing === "object" ? existing : {};
  const prev =
    current.mcpServers && typeof current.mcpServers === "object" ? { ...current.mcpServers } : {};
  delete prev[LEGACY_HOST_MCP_NAME];
  return {
    ...current,
    mcpServers: {
      ...prev,
      ...servers,
    },
  };
};

export const workspaceMcpPaths = (root) => [join(root, ".cursor", "mcp.json"), join(root, "mcp.json")];

export const writeWorkspaceMcp = (root, origin = "") => {
  const servers = consumerMcpServers(root, origin);
  const wrote = [];
  for (const dest of workspaceMcpPaths(root)) {
    let existing = {};
    if (existsSync(dest)) {
      try {
        existing = JSON.parse(readFileSync(dest, "utf8") || "{}");
      } catch {
        existing = {};
      }
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(mergeWorkspaceMcp(existing, servers), null, 2)}\n`);
    wrote.push(dest);
  }
  return wrote;
};
