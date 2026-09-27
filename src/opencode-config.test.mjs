/**
 * Copyright (c) 2026 Devrecated
 *
 * Test the opencode project config writer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mergeOpenCodeConfig,
  opencodeMcpServers,
  writeOpenCodeConfig,
  applyOpenCodeKitToWorkspace,
  OPENCODE_KIT_REL,
} from "./opencode-config.mjs";

test("opencodeMcpServers remote uses remote", () => {
  const servers = opencodeMcpServers("/repo", "https://host.example");
  assert.equal(servers.autodevelop.type, "local");
  assert.ok(Array.isArray(servers.autodevelop.command));
  assert.ok(servers["autodevelop-host"].type === "remote");
  assert.ok(servers["autodevelop-host"].url.startsWith("https://host.example/mcp"));
});

test("opencodeMcpServers local uses local stdio", () => {
  const servers = opencodeMcpServers("/repo", "");
  assert.equal(servers.autodevelop.type, "local");
  assert.ok(Array.isArray(servers.autodevelop.command));
  assert.equal(servers["autodevelop-host"].type, "local");
  assert.ok(servers["autodevelop-host"].command.some((part) => part.includes("cli/bin.mjs")));
});

test("mergeOpenCodeConfig keeps reserved keys and adds instructions", () => {
  const merged = mergeOpenCodeConfig(
    { model: "anthropic/claude-sonnet-4", noop: 1 },
    { autodevelop: { type: "local" } },
  );
  assert.equal(merged.$schema, "https://opencode.ai/config.json");
  assert.equal(merged.model, "anthropic/claude-sonnet-4");
  assert.deepEqual(merged.instructions, ["./.opencode/AGENTS.md"]);
  assert.deepEqual(merged.mcp.autodevelop, { type: "local" });
  // Unknown user keys are dropped (opencode rejects them by strictness rules).
  assert.equal(merged.noop, undefined);
});

test("mergeOpenCodeConfig preserves existing instructions", () => {
  const merged = mergeOpenCodeConfig({ instructions: ["AGENTS.md"], noop: 1 }, { autodevelop: { type: "local" } });
  assert.deepEqual(merged.instructions, ["AGENTS.md", "./.opencode/AGENTS.md"]);
});

test("writeOpenCodeConfig writes .opencode/opencode.json with servers", async () => {
  const root = mkdtempSync(join(tmpdir(), "oc-mcp-"));
  try {
    const dest = writeOpenCodeConfig(root, "https://host.example");
    const content = JSON.parse(readFileSync(dest, "utf8"));
    assert.ok(content.mcp.autodevelop);
    assert.ok(content.mcp["autodevelop-host"].type === "remote");
    // AGENTS.md not installed, so instructions are omitted rather than dangling.
    assert.equal(content.instructions, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyOpenCodeKitToWorkspace skips when kit missing", () => {
  const root = mkdtempSync(join(tmpdir(), "no-kit-"));
  try {
    const result = applyOpenCodeKitToWorkspace({ workspaceRoot: root });
    assert.equal(result, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyOpenCodeKitToWorkspace applies when kit exists", () => {
  const kit = mkdtempSync(join(tmpdir(), "oc-kit-"));
  const root = mkdtempSync(join(tmpdir(), "ws-"));
  try {
    mkdirSync(join(kit, OPENCODE_KIT_REL, "skills", "ticket-required"), { recursive: true });
    mkdirSync(join(kit, OPENCODE_KIT_REL, "commands"), { recursive: true });
    mkdirSync(join(kit, OPENCODE_KIT_REL, "agents"), { recursive: true });
    mkdirSync(join(kit, OPENCODE_KIT_REL, "plugins"), { recursive: true });
    writeFileSync(join(kit, OPENCODE_KIT_REL, "skills", "ticket-required", "SKILL.md"), "# ticket\n");
    writeFileSync(join(kit, OPENCODE_KIT_REL, "commands", "backend.md"), "# backend\n");
    writeFileSync(join(kit, OPENCODE_KIT_REL, "agents", "identify-skills.md"), "# agent\n");
    writeFileSync(join(kit, OPENCODE_KIT_REL, "plugins", "autodevelop.mjs"), "export {}\n");
    writeFileSync(join(kit, OPENCODE_KIT_REL, "AGENTS.md"), "# AGENTS\n");

    const result = applyOpenCodeKitToWorkspace({ pluginRoot: kit, workspaceRoot: root, origin: "https://host.example" });
    assert.ok(result);
    assert.ok(result.config.endsWith(".opencode/opencode.json"));

    assert.ok(existsSync(join(root, ".opencode", "skills", "ticket-required", "SKILL.md")));
    assert.ok(existsSync(join(root, ".opencode", "commands", "backend.md")));
    assert.ok(existsSync(join(root, ".opencode", "agents", "identify-skills.md")));
    assert.ok(existsSync(join(root, ".opencode", "plugins", "autodevelop.mjs")));
    assert.ok(existsSync(join(root, ".opencode", "AGENTS.md")));
    assert.ok(existsSync(join(root, ".opencode", "opencode.json")));
  } finally {
    rmSync(kit, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});