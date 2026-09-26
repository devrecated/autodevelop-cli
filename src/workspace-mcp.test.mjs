/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { consumerMcpServers, writeWorkspaceMcp } from "./workspace-mcp.mjs";

test("consumer MCP has no token and points Cursor at login credentials", () => {
  const servers = consumerMcpServers();
  const text = JSON.stringify(servers);
  assert.equal(text.includes("TOKEN"), false);
  assert.equal(text.includes("Bearer"), false);
  assert.match(servers.autodevelop.args[0], /\.cursor\/skills\/autodevelop\/mcp\/server\.mjs/);
  assert.equal(servers["autodevelop-host"].args.includes("mcp"), true);
  assert.equal(servers["autodevelop-buckets"], undefined);
});

test("writeWorkspaceMcp keeps unrelated servers and writes .cursor/mcp.json", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-ws-mcp-"));
  writeFileSync(
    join(root, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        other: { command: "echo" },
        autodevelop: { command: "old" },
        "autodevelop-buckets": { url: "${AUTODEVELOP_MCP_URL}", headers: { Authorization: "Bearer ${TOKEN}" } },
      },
    }),
  );
  writeWorkspaceMcp(root);
  const project = JSON.parse(readFileSync(join(root, ".cursor", "mcp.json"), "utf8"));
  const rootMcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
  assert.equal(rootMcp.mcpServers.other.command, "echo");
  assert.equal(rootMcp.mcpServers.autodevelop.command, "node");
  assert.equal(rootMcp.mcpServers["autodevelop-buckets"], undefined);
  assert.equal(rootMcp.mcpServers["autodevelop-host"].args.includes("mcp"), true);
  assert.equal(project.mcpServers.autodevelop.command, "node");
  assert.equal(JSON.stringify(project).includes("TOKEN"), false);
  assert.equal(JSON.stringify(rootMcp).includes("TOKEN"), false);
});

test("writeWorkspaceMcp uses HTTP host url when origin is remote", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-ws-http-"));
  writeWorkspaceMcp(root, "https://brain.devrecated.com");
  const project = JSON.parse(readFileSync(join(root, ".cursor", "mcp.json"), "utf8"));
  assert.equal(project.mcpServers.autodevelop.command, "node");
  assert.equal(project.mcpServers["autodevelop-host"].url, "https://brain.devrecated.com/mcp");
  assert.equal(JSON.stringify(project).includes("TOKEN"), false);
});

test("writeWorkspaceMcp points at autodevelop-internal when that kit exists", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-ws-internal-"));
  const server = join(root, ".cursor", "skills", "autodevelop-internal", "mcp", "server.mjs");
  mkdirSync(dirname(server), { recursive: true });
  writeFileSync(server, "export {}\n");
  writeWorkspaceMcp(root);
  const project = JSON.parse(readFileSync(join(root, ".cursor", "mcp.json"), "utf8"));
  assert.match(
    project.mcpServers.autodevelop.args[0],
    /\.cursor\/skills\/autodevelop-internal\/mcp\/server\.mjs/,
  );
});
