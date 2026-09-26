/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packPluginTar } from "../../../scripts/pack/pack-plugin.mjs";
import {
  applyKit,
  fetchHostedKitTar,
  KIT_TAR_MISSING,
  resolvePluginTar,
} from "./kit.mjs";

const writeKit = () => {
  const kit = mkdtempSync(join(tmpdir(), "ad-kit-src-"));
  mkdirSync(join(kit, ".cursor-plugin"), { recursive: true });
  mkdirSync(join(kit, "kits", "cursor", "commands"), { recursive: true });
  mkdirSync(join(kit, "kits", "cursor", "hooks"), { recursive: true });
  mkdirSync(join(kit, "kits", "autodevelop"), { recursive: true });
  writeFileSync(join(kit, ".cursor-plugin", "plugin.json"), JSON.stringify({ name: "autodevelop" }));
  writeFileSync(join(kit, "kits", "autodevelop", "config.json"), '{"slug":"workspace"}\n');
  writeFileSync(join(kit, "kits", "cursor", "commands", "ui.md"), "# ui\n");
  writeFileSync(join(kit, "kits", "cursor", "hooks.json"), JSON.stringify({ hooks: {} }));
  writeFileSync(
    join(kit, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        autodevelop: { args: ["${PLUGIN_ROOT}/.cursor/skills/autodevelop-internal/mcp/server.mjs"] },
      },
    }),
  );
  return kit;
};

test("resolvePluginTar prefers AUTODEVELOP_KIT_TAR", async () => {
  const kit = writeKit();
  const tar = packPluginTar({ kitRoot: kit, destFile: join(kit, "kit.tgz") }).tar;
  const found = await resolvePluginTar({
    env: { AUTODEVELOP_KIT_TAR: tar },
    packageDir: mkdtempSync(join(tmpdir(), "ad-empty-pkg-")),
    kitRoot: mkdtempSync(join(tmpdir(), "ad-empty-kit-")),
  });
  assert.equal(found, tar);
});

test("resolvePluginTar packs from a local kit root (Devrecated checkout)", async () => {
  const kit = writeKit();
  const pkg = mkdtempSync(join(tmpdir(), "ad-pkg-"));
  const found = await resolvePluginTar({
    env: {},
    packageDir: pkg,
    kitRoot: kit,
  });
  assert.equal(existsSync(found), true);
  assert.match(found, /autodevelop-plugin\.tgz$/);
});

test("resolvePluginTar fails when there is no kit and no override", async () => {
  await assert.rejects(
    () =>
      resolvePluginTar({
        env: {},
        packageDir: mkdtempSync(join(tmpdir(), "ad-missing-pkg-")),
        kitRoot: mkdtempSync(join(tmpdir(), "ad-missing-kit-")),
      }),
    (err) => err.message === KIT_TAR_MISSING,
  );
});

test("fetchHostedKitTar writes the host archive", async () => {
  const kit = writeKit();
  const tar = packPluginTar({ kitRoot: kit, destFile: join(kit, "host.tgz") }).tar;
  const bytes = readFileSync(tar);
  const dest = join(mkdtempSync(join(tmpdir(), "ad-dl-")), "out.tgz");
  const found = await fetchHostedKitTar({
    origin: "http://127.0.0.1:8787",
    credential: "ad_fixture",
    destFile: dest,
    fetchImpl: async () =>
      new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "application/gzip" },
      }),
  });
  assert.equal(found, dest);
  assert.equal(readFileSync(dest).equals(bytes), true);
});

test("applyKit writes kit files from an explicit tar", async () => {
  const kit = writeKit();
  const workspace = mkdtempSync(join(tmpdir(), "ad-ws-"));
  mkdirSync(join(workspace, ".git"), { recursive: true });
  const tar = packPluginTar({ kitRoot: kit, destFile: join(kit, "autodevelop-plugin.tgz") }).tar;
  const result = await applyKit({
    cwd: workspace,
    env: {},
    pluginTar: tar,
  });
  assert.equal(result.tar, tar);
  assert.equal(existsSync(join(workspace, ".cursor", "commands", "ui.md")), true);
  assert.equal(existsSync(join(workspace, ".autodevelop", "config.json")), true);
});

test("applyKit downloads from the host when origin is set", async () => {
  const kit = writeKit();
  const tar = packPluginTar({ kitRoot: kit, destFile: join(kit, "host.tgz") }).tar;
  const bytes = readFileSync(tar);
  const workspace = mkdtempSync(join(tmpdir(), "ad-host-ws-"));
  mkdirSync(join(workspace, ".git"), { recursive: true });
  const result = await applyKit({
    cwd: workspace,
    env: {},
    kitRoot: mkdtempSync(join(tmpdir(), "ad-no-local-")),
    packageDir: mkdtempSync(join(tmpdir(), "ad-no-pkg-")),
    origin: "http://127.0.0.1:8787",
    credential: "ad_fixture",
    fetchImpl: async (url) => {
      assert.match(String(url), /\/cli\/kit$/);
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "application/gzip" },
      });
    },
  });
  assert.equal(existsSync(join(workspace, ".cursor", "commands", "ui.md")), true);
  assert.ok(result.tar);
});
