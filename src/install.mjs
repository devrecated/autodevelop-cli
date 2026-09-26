/**
 * Copyright (c) 2026 Devrecated
 *
 * Pull the org policy pack into the current repo. Never prints credentials.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { asInstanceSlug, assertCliPackSafe, defaultSlug, isForbiddenRel } from "./pack-safe.mjs";
import { findRepoRoot, listInstanceNames } from "../../../.cursor/skills/autodevelop-internal/scripts/config-load.mjs";
import { joinHost } from "./host.mjs";
import { defaultCredentialsPath, readSubscriptionToken, resolveCredentialHost } from "./credentials.mjs";
import { existsSync, readFileSync } from "node:fs";
import { BILLING_EXPIRED } from "@devrecated/autodevelop-sdk/errors";
import { mergeGithubBinding } from "@devrecated/autodevelop-sdk/github";
import { applyKit } from "./kit.mjs";
import { writeUserMcp, resolveCliBin, userMcpCustomerLines } from "./user-mcp.mjs";
import { writeWorkspaceMcp } from "./workspace-mcp.mjs";
import { writeClaudeMcp } from "./claude-config.mjs";

const toPosix = (value) => String(value || "").replaceAll("\\", "/");

const failHttp = (response, data) => {
  const message =
    response.status === 403
      ? BILLING_EXPIRED
      : (typeof data === "string" ? data : data.error) || `HTTP ${response.status}`;
  const err = new Error(message);
  err.status = response.status;
  throw err;
};

export const inferSlug = ({ root, requested } = {}) => {
  const wanted = asInstanceSlug(requested);
  if (wanted) return wanted;
  if (!root) return "";
  return defaultSlug(root);
};

export const applyPackFiles = (root, files, slug) => {
  assertCliPackSafe(files, slug);
  const wrote = [];
  for (const file of files) {
    const dest = toPosix(file.dest);
    if (isForbiddenRel(dest) || dest.includes(".cursor/private") || dest.includes("..")) {
      throw new Error(`Refusing to write forbidden path: ${dest}`);
    }
    const abs = resolve(root, dest.split("/").join(sep));
    if (!abs.startsWith(resolve(root))) {
      throw new Error(`Refusing to write outside the repository: ${dest}`);
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.content ?? "");
    if (dest.endsWith("credentials.json")) chmodSync(abs, 0o600);
    wrote.push(dest);
  }
  return wrote;
};

export const fetchPack = async ({ origin, credential, slug, fetchImpl = fetch } = {}) => {
  const qs = slug ? `?slug=${encodeURIComponent(slug)}` : "";
  const response = await fetchImpl(joinHost(origin, `/cli/pack${qs}`), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credential}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) failHttp(response, data);
  return data;
};

export const applyGithubBinding = (root, slug, binding) => {
  if (!binding || typeof binding !== "object") return "";
  if (!binding.projectId && !binding.owner) return "";
  const names = listInstanceNames(root);
  const instance = (slug && names.includes(slug) ? slug : names[0]) || "";
  if (!instance) return "";
  const dest = `.cursor/skills/${instance}/autodevelop/config.json`;
  const abs = resolve(root, dest.split("/").join(sep));
  let current = {};
  if (existsSync(abs)) {
    try {
      current = JSON.parse(readFileSync(abs, "utf8") || "{}");
    } catch {
      current = {};
    }
  } else {
    mkdirSync(dirname(abs), { recursive: true });
  }
  writeFileSync(abs, `${JSON.stringify(mergeGithubBinding(current, binding), null, 2)}\n`);
  return dest;
};

export const fetchPackStatus = async ({
  origin,
  credential,
  slug,
  localVersion = "",
  fetchImpl = fetch,
} = {}) => {
  const params = new URLSearchParams();
  if (slug) params.set("slug", slug);
  if (localVersion) params.set("local", localVersion);
  const qs = params.toString() ? `?${params}` : "";
  const response = await fetchImpl(joinHost(origin, `/cli/pack/status${qs}`), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credential}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) failHttp(response, data);
  return data;
};

export const runInstall = async ({
  env = process.env,
  host,
  slug: requested,
  cwd = process.cwd(),
  credentialsPath,
  fetchImpl = fetch,
  write = process.stdout.write.bind(process.stdout),
  skipKit = false,
  pluginTar,
} = {}) => {
  const root = findRepoRoot(cwd);
  const slug = inferSlug({ root, requested });
  if (!slug) {
    const found = listInstanceNames(root).join(", ") || "(none)";
    throw new Error(`Pass --slug <instance>. Found: ${found}`);
  }
  const path = credentialsPath || defaultCredentialsPath(env);
  const origin = resolveCredentialHost({ env, host, credentialsPath: path });
  const credential = readSubscriptionToken(env, { credentialsPath: path });
  if (!credential) {
    throw new Error("Not signed in. Run npx @devrecated/autodevelop login.");
  }
  let kit = null;
  if (!skipKit) {
    kit = await applyKit({
      cwd: root,
      env,
      pluginTar,
      origin,
      credential,
      fetchImpl,
    });
    write("Applied Autodevelop kit.\n");
  }
  const pack = await fetchPack({ origin, credential, slug, fetchImpl });
  const files = (pack.files || []).filter((file) => toPosix(file.dest) !== "mcp.json");
  const wrote = applyPackFiles(root, files, pack.slug || slug);
  const bound = applyGithubBinding(root, pack.slug || slug, pack.github);
  if (bound) wrote.push(bound);
  writeWorkspaceMcp(root, origin);
  writeClaudeMcp(root, origin);
  const user = writeUserMcp({
    env,
    credentialsPath: path,
    cliBin: resolveCliBin(root),
    cwd: root,
    host,
  });
  write("Wrote Cursor and Claude project MCP and user config.\n");
  for (const line of userMcpCustomerLines(user)) write(`${line}\n`);
  write(`Installed policy pack ${pack.policyPackVersion} for ${pack.slug || slug} (${wrote.length} files).\n`);
  return { slug: pack.slug || slug, version: pack.policyPackVersion, wrote, github: pack.github || null, kit };
};
