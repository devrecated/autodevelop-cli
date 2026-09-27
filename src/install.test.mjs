/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BILLING_EXPIRED } from "@devrecated/autodevelop-sdk/errors";
import { packPluginTar } from "../../../scripts/pack/pack-plugin.mjs";
import { applyGithubBinding, applyPackFiles, fetchPack, inferSlug, runInstall } from "./install.mjs";

test("inferSlug prefers --slug over the first instance", () => {
  assert.equal(inferSlug({ requested: "acme" }), "acme");
  assert.equal(inferSlug({ requested: "autodevelop" }), "");
});

test("applyPackFiles writes allowed dests and refuses private", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-install-"));
  const wrote = applyPackFiles(
    root,
    [
      {
        dest: ".cursor/skills/acme/autodevelop/.policies/VERSION",
        content: "2026.08.29+abc\n",
      },
    ],
    "acme",
  );
  assert.deepEqual(wrote, [".cursor/skills/acme/autodevelop/.policies/VERSION"]);
  assert.equal(
    readFileSync(join(root, ".cursor/skills/acme/autodevelop/.policies/VERSION"), "utf8").trim(),
    "2026.08.29+abc",
  );
  assert.throws(
    () => applyPackFiles(root, [{ dest: ".cursor/private/host/server.mjs", content: "x" }], "acme"),
    /forbidden/,
  );
  assert.throws(
    () =>
      applyPackFiles(
        root,
        [{ dest: ".cursor/skills/other/autodevelop/.policies/branch-policy.yaml", content: "x" }],
        "acme",
      ),
    /second instance/,
  );
});

test("fetchPack surfaces the paywall on 403", async () => {
  await assert.rejects(
    () =>
      fetchPack({
        origin: "http://127.0.0.1:8787",
        credential: "ad_fixture",
        slug: "acme",
        fetchImpl: async () => new Response(BILLING_EXPIRED, { status: 403 }),
      }),
    (err) => err.message === BILLING_EXPIRED && err.status === 403,
  );
});

test("applyGithubBinding merges project ids into instance config", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-bind-"));
  const destDir = join(root, ".cursor/skills/acme/autodevelop");
  mkdirSync(destDir, { recursive: true });
  writeFileSync(
    join(destDir, "config.json"),
    JSON.stringify({ github: { owner: "old", repo: "app" }, mail: { allowlist: [] } }),
  );
  const dest = applyGithubBinding(root, "acme", {
    owner: "acme",
    projectId: "PVT_1",
    projectNumber: 3,
    fields: { status: { id: "PVTSSF_1" } },
  });
  assert.equal(dest, ".cursor/skills/acme/autodevelop/config.json");
  const next = JSON.parse(readFileSync(join(root, dest), "utf8"));
  assert.equal(next.github.repo, "app");
  assert.equal(next.github.owner, "acme");
  assert.equal(next.github.projectId, "PVT_1");
  assert.equal(next.fields.status.id, "PVTSSF_1");
  assert.deepEqual(next.mail.allowlist, []);
});

test("runInstall applies the package tar then the policy pack", async () => {
  const kit = mkdtempSync(join(tmpdir(), "ad-run-kit-"));
  mkdirSync(join(kit, ".cursor-plugin"), { recursive: true });
  mkdirSync(join(kit, "kits", "cursor", "commands"), { recursive: true });
  mkdirSync(join(kit, "kits", "autodevelop"), { recursive: true });
  writeFileSync(join(kit, ".cursor-plugin", "plugin.json"), JSON.stringify({ name: "autodevelop" }));
  writeFileSync(join(kit, "kits", "autodevelop", "config.json"), '{"slug":"workspace"}\n');
  writeFileSync(join(kit, "kits", "cursor", "commands", "ui.md"), "# ui\n");
  writeFileSync(join(kit, "mcp.json"), JSON.stringify({ mcpServers: {} }));
  const tar = packPluginTar({ kitRoot: kit, destFile: join(kit, "autodevelop-plugin.tgz") }).tar;
  const root = mkdtempSync(join(tmpdir(), "ad-run-ws-"));
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, ".cursor", "skills", "acme", "autodevelop"), { recursive: true });
  writeFileSync(join(root, ".cursor", "skills", "acme", "autodevelop", "config.json"), '{"slug":"acme"}\n');
  const logs = [];
  const creds = join(root, "credentials.json");
  const userMcp = join(root, "user-mcp.json");
  writeFileSync(
    userMcp,
    JSON.stringify({
      mcpServers: {
        firebase: { command: "npx" },
        "autodevelop-buckets": { url: "https://example.test", headers: { Authorization: "Bearer ${TOKEN}" } },
      },
    }),
  );
  const result = await runInstall({
    env: {
      AUTODEVELOP_TOKEN: "ad_fixture",
      AUTODEVELOP_CREDENTIALS: creds,
      AUTODEVELOP_USER_MCP: userMcp,
    },
    host: "http://127.0.0.1:8787",
    slug: "acme",
    cwd: root,
    pluginTar: tar,
    write: (text) => logs.push(String(text)),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          slug: "acme",
          policyPackVersion: "2026.09.02+test",
          files: [
            {
              dest: ".cursor/skills/acme/autodevelop/.policies/VERSION",
              content: "2026.09.02+test\n",
            },
            {
              dest: "mcp.json",
              content: JSON.stringify({
                mcpServers: {
                  "autodevelop-buckets": {
                    url: "${AUTODEVELOP_MCP_URL}",
                    headers: { Authorization: "Bearer ${TOKEN}" },
                  },
                },
              }),
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  });
  assert.equal(result.version, "2026.09.02+test");
  assert.equal(existsSync(join(root, ".cursor", "commands", "ui.md")), true);
  assert.equal(existsSync(join(root, ".autodevelop", "config.json")), true);
  assert.equal(existsSync(join(root, ".cursor", "skills", "acme", "autodevelop", ".policies", "VERSION")), true);
  assert.match(logs.join(""), /Applied Autodevelop kit/);
  assert.match(logs.join(""), /Wrote Cursor, Claude, and opencode project MCP and user config/);
  const projectMcp = JSON.parse(readFileSync(join(root, ".cursor", "mcp.json"), "utf8"));
  const rootMcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
  assert.equal(projectMcp.mcpServers["autodevelop-host"].args.includes("mcp"), true);
  assert.equal(rootMcp.mcpServers["autodevelop-host"].args.includes("mcp"), true);
  assert.equal(JSON.stringify(projectMcp).includes("autodevelop-buckets"), false);
  assert.equal(JSON.stringify(rootMcp).includes("TOKEN"), false);
  const globalMcp = JSON.parse(readFileSync(userMcp, "utf8"));
  assert.equal(globalMcp.mcpServers.firebase.command, "npx");
  assert.equal(globalMcp.mcpServers.autodevelop.command, "node");
  assert.equal(globalMcp.mcpServers["autodevelop-host"].command, "node");
  assert.equal(globalMcp.mcpServers["autodevelop-buckets"], undefined);
  assert.equal(JSON.stringify(globalMcp).includes("TOKEN"), false);
  assert.equal(existsSync(join(root, "kit-mcp.mjs")), true);
});
