/**
 * Copyright (c) 2026 Devrecated
 *
 * Apply an Autodevelop kit tar into a consumer workspace.
 * Customer-safe: no packing / operator stage logic.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { writeWorkspaceMcp } from "./workspace-mcp.mjs";
import { applyClaudeKitToWorkspace, writeClaudeMcp } from "./claude-config.mjs";
import { applyOpenCodeKitToWorkspace, writeOpenCodeConfig } from "./opencode-config.mjs";

export const PLUGIN_TAR_REL = "autodevelop-plugin.tgz";
export const PLUGIN_EXTRACT_REL = ".cursor/local/autodevelop-plugin";
export const CURSOR_KIT_REL = "kits/cursor";
export const CLAUDE_KIT_REL = "kits/claude";
export const OPENCODE_KIT_REL = "kits/opencode";
export const AUTODEVELOP_KIT_REL = "kits/autodevelop";
export const WORKSPACE_BIND_REL = ".autodevelop";

export const pluginExtractPath = (repo) => join(resolve(repo), PLUGIN_EXTRACT_REL);

export const copyMissingTree = (src, dest, { skipRootReadme = true } = {}) => {
  if (!src || !existsSync(src)) return [];
  const copied = [];
  const walk = (from, to, atRoot) => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (atRoot && skipRootReadme && entry.name === "README.md") continue;
      const fromPath = join(from, entry.name);
      const toPath = join(to, entry.name);
      if (entry.isDirectory()) {
        walk(fromPath, toPath, false);
        continue;
      }
      if (existsSync(toPath)) continue;
      mkdirSync(dirname(toPath), { recursive: true });
      cpSync(fromPath, toPath);
      copied.push(toPath);
    }
  };
  walk(src, dest, true);
  return copied;
};

const resolveAutodevelopKit = ({ pluginRoot, kitRoot } = {}) => {
  if (pluginRoot && existsSync(join(pluginRoot, AUTODEVELOP_KIT_REL))) {
    return join(pluginRoot, AUTODEVELOP_KIT_REL);
  }
  if (kitRoot && existsSync(join(kitRoot, AUTODEVELOP_KIT_REL))) return join(kitRoot, AUTODEVELOP_KIT_REL);
  return "";
};

export const extractPluginTar = (tarFile, destDir) => {
  const dest = resolve(destDir);
  // Wipe first — a stale stage can resurrect deleted process rules under kits/cursor/rules.
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const result = spawnSync("tar", ["-xzf", resolve(tarFile), "-C", dest], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "tar -xzf failed");
  }
  return dest;
};

const resolveCursorKit = ({ pluginRoot, kitRoot } = {}) => {
  if (pluginRoot && existsSync(join(pluginRoot, CURSOR_KIT_REL))) {
    return join(pluginRoot, CURSOR_KIT_REL);
  }
  if (pluginRoot && existsSync(join(pluginRoot, ".cursor-template"))) {
    return join(pluginRoot, ".cursor-template");
  }
  if (kitRoot && existsSync(join(kitRoot, CURSOR_KIT_REL))) return join(kitRoot, CURSOR_KIT_REL);
  if (kitRoot && existsSync(join(kitRoot, ".cursor-template"))) return join(kitRoot, ".cursor-template");
  return "";
};

/** Consumer hooks slug is `autodevelop`. Skills may stay `autodevelop-internal`. */
const CONSUMER_HOOKS_SLUG = "autodevelop";
const LEGACY_INTERNAL_HOOKS_SLUG = "autodevelop-internal";

const normalizeConsumerHooksTree = (hooksDest) => {
  if (!hooksDest || !existsSync(hooksDest)) return;
  const internal = join(hooksDest, LEGACY_INTERNAL_HOOKS_SLUG);
  const publicSlug = join(hooksDest, CONSUMER_HOOKS_SLUG);
  if (!existsSync(internal)) return;
  if (existsSync(publicSlug)) {
    rmSync(internal, { recursive: true, force: true });
    return;
  }
  // Mis-mirrored kit: dogfood used `-internal`; consumers get `autodevelop/`.
  cpSync(internal, publicSlug, { recursive: true });
  rmSync(internal, { recursive: true, force: true });
};

const rewriteConsumerHooksJson = (raw) =>
  String(raw || "")
    .replaceAll(`${CURSOR_KIT_REL}/hooks/`, ".cursor/hooks/")
    .replaceAll(".cursor-template/hooks/", ".cursor/hooks/")
    .replaceAll(`.cursor/hooks/${LEGACY_INTERNAL_HOOKS_SLUG}/`, `.cursor/hooks/${CONSUMER_HOOKS_SLUG}/`)
    .replaceAll(`hooks/${LEGACY_INTERNAL_HOOKS_SLUG}/`, `hooks/${CONSUMER_HOOKS_SLUG}/`);

export const applyPluginToWorkspace = ({ pluginRoot, workspaceRoot, kitRoot } = {}) => {
  const workspace = resolve(workspaceRoot);
  const source = resolveCursorKit({ pluginRoot, kitRoot });
  if (!source || !existsSync(source)) {
    throw new Error(`Missing ${CURSOR_KIT_REL} in the plugin extract`);
  }
  const cursor = join(workspace, ".cursor");
  mkdirSync(cursor, { recursive: true });
  for (const name of ["rules", "hooks", "commands", "agents"]) {
    const src = join(source, name);
    const dest = join(cursor, name);
    // Replace, do not merge — a thin kit must drop previously installed process rules.
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    if (!existsSync(src)) continue;
    cpSync(src, dest, { recursive: true });
  }
  normalizeConsumerHooksTree(join(cursor, "hooks"));
  // Prefer autodevelop-internal (renamed kit skills); fall back to legacy autodevelop.
  const skillSlug = existsSync(join(source, "skills", "autodevelop-internal"))
    ? "autodevelop-internal"
    : "autodevelop";
  const kitSkills = join(source, "skills", skillSlug);
  if (existsSync(kitSkills)) {
    const skillsDest = join(cursor, "skills", skillSlug);
    if (existsSync(skillsDest)) rmSync(skillsDest, { recursive: true, force: true });
    cpSync(kitSkills, skillsDest, { recursive: true });
  }
  const hooksSrc = join(source, "hooks.json");
  if (existsSync(hooksSrc)) {
    writeFileSync(join(cursor, "hooks.json"), rewriteConsumerHooksJson(readFileSync(hooksSrc, "utf8")));
  }
  writeWorkspaceMcp(workspace);
  writeClaudeMcp(workspace);
  applyClaudeKitToWorkspace({ pluginRoot, workspaceRoot, kitRoot });
  writeOpenCodeConfig(workspace);
  applyOpenCodeKitToWorkspace({ pluginRoot, workspaceRoot, kitRoot });
  const bindSource = resolveAutodevelopKit({ pluginRoot, kitRoot });
  const bind = join(workspace, WORKSPACE_BIND_REL);
  const bindCopied = bindSource ? copyMissingTree(bindSource, bind) : [];
  return {
    workspace,
    rules: join(cursor, "rules"),
    hooks: join(cursor, "hooks.json"),
    bind,
    bindCopied,
  };
};

export const applyKitFromTar = ({ tarFile, workspaceRoot } = {}) => {
  const tar = resolve(tarFile || "");
  if (!tar || !existsSync(tar)) {
    throw new Error("Missing Autodevelop kit tar (autodevelop-plugin.tgz)");
  }
  const extracted = extractPluginTar(tar, pluginExtractPath(workspaceRoot));
  const applied = applyPluginToWorkspace({ pluginRoot: extracted, workspaceRoot });
  return { tar, extracted, applied };
};
