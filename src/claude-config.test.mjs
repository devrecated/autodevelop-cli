/**
 * Copyright (c) 2026 Devrecated
 *
 * Test the Claude project config writer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeMcpServers, writeClaudeMcp, claudeStandaloneHooksJson, applyClaudeKitToWorkspace, CLAUDE_KIT_REL } from "./claude-config.mjs";

test("claudeMcpServers remote uses http", () => {
  const servers = claudeMcpServers("/repo", "https://host.example");
  assert.ok(servers.autodevelop.command === "node");
  assert.ok(servers["autodevelop-host"].type === "http");
  assert.ok(servers["autodevelop-host"].url.startsWith("https://host.example/mcp"));
});

test("claudeMcpServers local uses stdio", () => {
  const servers = claudeMcpServers("/repo", "");
  assert.ok(servers.autodevelop.command === "node");
  assert.ok(servers["autodevelop-host"].command === "node");
  assert.ok(servers["autodevelop-host"].args.includes("mcp"));
});

test("claudeStandaloneHooksJson rewrites plugin root to project .claude", () => {
  const raw = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/autodevelop/claude-hook.mjs"';
  const out = claudeStandaloneHooksJson(raw);
  assert.ok(out.includes('${CLAUDE_PROJECT_DIR}/.claude/hooks/autodevelop/claude-hook.mjs'));
  assert.ok(!out.includes('${CLAUDE_PLUGIN_ROOT}'));
});

test("writeClaudeMcp writes .mcp.json with servers", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-mcp-"));
  try {
    const dest = writeClaudeMcp(root, "https://host.example");
    const { readFileSync } = await import("node:fs");
    const content = JSON.parse(readFileSync(dest, "utf8"));
    assert.ok(content.mcpServers.autodevelop);
    assert.ok(content.mcpServers["autodevelop-host"].type === "http");
    assert.equal(content.mcpServers["autodevelop-buckets"], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyClaudeKitToWorkspace skips when kit missing", () => {
  const root = mkdtempSync(join(tmpdir(), "no-kit-"));
  try {
    const result = applyClaudeKitToWorkspace({ workspaceRoot: root });
    assert.equal(result, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyClaudeKitToWorkspace applies when kit exists", () => {
  const kit = mkdtempSync(join(tmpdir(), "claude-kit-"));
  const root = mkdtempSync(join(tmpdir(), "ws-"));
  try {
    mkdirSync(join(kit, CLAUDE_KIT_REL, "commands"), { recursive: true });
    mkdirSync(join(kit, CLAUDE_KIT_REL, "agents"), { recursive: true });
    mkdirSync(join(kit, CLAUDE_KIT_REL, "rules", "autodevelop"), { recursive: true });
    mkdirSync(join(kit, CLAUDE_KIT_REL, "hooks", "autodevelop"), { recursive: true });
    writeFileSync(join(kit, CLAUDE_KIT_REL, "commands", "test.md"), "# test\n");
    writeFileSync(join(kit, CLAUDE_KIT_REL, "agents", "agent.md"), "# agent\n");
    writeFileSync(join(kit, CLAUDE_KIT_REL, "rules", "autodevelop", "rule.md"), "# rule\n");
    writeFileSync(join(kit, CLAUDE_KIT_REL, "hooks", "autodevelop", "claude-hook.mjs"), "export {}\n");
    writeFileSync(join(kit, CLAUDE_KIT_REL, "hooks", "hooks.json"), '{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}/hooks/autodevelop/claude-hook.mjs\" \"${CLAUDE_PROJECT_DIR}/.cursor/hooks/autodevelop/cybersecurity/guard-shell.mjs\""}]}]}}');
    writeFileSync(join(kit, CLAUDE_KIT_REL, "CLAUDE.md"), "# CLAUDE\n");

    const result = applyClaudeKitToWorkspace({ pluginRoot: kit, workspaceRoot: root });
    assert.ok(result);
    assert.ok(result.hooksJson.endsWith(".claude/hooks/hooks.json"));

    // Verify files copied
    assert.ok(existsSync(join(root, ".claude", "commands", "test.md")));
    assert.ok(existsSync(join(root, ".claude", "agents", "agent.md")));
    assert.ok(existsSync(join(root, ".claude", "rules", "autodevelop", "rule.md")));
    assert.ok(existsSync(join(root, ".claude", "hooks", "autodevelop", "claude-hook.mjs")));
    assert.ok(existsSync(join(root, ".claude", "hooks", "hooks.json")));
    assert.ok(existsSync(join(root, ".claude", "CLAUDE.md")));

    // Verify hooks.json rewritten
    const hooks = readFileSync(join(root, ".claude", "hooks", "hooks.json"), "utf8");
    assert.ok(hooks.includes("${CLAUDE_PROJECT_DIR}/.claude/hooks/"));
    assert.ok(!hooks.includes("${CLAUDE_PLUGIN_ROOT}"));
  } finally {
    rmSync(kit, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});