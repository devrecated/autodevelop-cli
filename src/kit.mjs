/**
 * Copyright (c) 2026 Devrecated
 *
 * Resolve and apply the Autodevelop kit. Customer installs download the kit
 * from the Autodevelop host (`GET /cli/kit`) after login — the npm package does
 * not embed autodevelop-plugin.tgz.
 */
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { BILLING_EXPIRED } from "@devrecated/autodevelop-sdk/errors";
import { findKitRoot } from "../../../.cursor/skills/autodevelop-internal/scripts/config-load.mjs";
import { joinHost, wrapHostFetchError } from "./host.mjs";
import { applyKitFromTar, PLUGIN_TAR_REL } from "./kit-apply.mjs";

export const KIT_TAR_MISSING =
  "Could not resolve an Autodevelop kit. Sign in and run install (downloads from the host), or set AUTODEVELOP_KIT_TAR for a local Devrecated checkout.";

export const KIT_HOST_UNREACHABLE =
  "Could not download the Autodevelop kit from the host. Check AUTODEVELOP_HOST and network access, then retry install.";

export const cliPackageDir = (fromUrl = import.meta.url) => dirname(dirname(fileURLToPath(fromUrl)));

const tryKitRoot = (kitRoot) => {
  if (kitRoot) return resolve(kitRoot);
  try {
    return findKitRoot();
  } catch {
    return "";
  }
};

export const kitEnvOverride = (env = process.env) =>
  String(env.AUTODEVELOP_KIT_TAR || env.AUTODEVELOP_PLUGIN_TAR || "").trim();

const packLocalKitTar = async ({ kitRoot, destFile }) => {
  try {
    const { packPluginTar } = await import("../../../scripts/pack/pack-plugin.mjs");
    return packPluginTar({ kitRoot, destFile }).tar;
  } catch (error) {
    const err = new Error(KIT_TAR_MISSING);
    err.cause = error;
    throw err;
  }
};

/**
 * Resolve a local kit tar for Devrecated checkouts / tests.
 * Does not look for a bundled autodevelop-plugin.tgz in the customer package.
 */
export const resolvePluginTar = async ({ env = process.env, packageDir, kitRoot } = {}) => {
  const override = kitEnvOverride(env);
  if (override) {
    const abs = resolve(override);
    if (!existsSync(abs)) {
      throw new Error(`AUTODEVELOP_KIT_TAR is missing: ${override}`);
    }
    return abs;
  }
  const kit = tryKitRoot(kitRoot);
  if (kit && (existsSync(join(kit, "kits/cursor")) || existsSync(join(kit, ".cursor-template")))) {
    const pkg = resolve(packageDir || cliPackageDir());
    const dest = join(pkg, PLUGIN_TAR_REL);
    return packLocalKitTar({ kitRoot: kit, destFile: dest });
  }
  throw new Error(KIT_TAR_MISSING);
};

export const fetchHostedKitTar = async ({
  origin,
  credential,
  fetchImpl = fetch,
  destFile,
} = {}) => {
  if (!origin || !credential) {
    throw new Error(KIT_TAR_MISSING);
  }
  let response;
  try {
    response = await fetchImpl(joinHost(origin, "/cli/kit"), {
      method: "GET",
      headers: {
        Accept: "application/gzip, application/octet-stream",
        Authorization: `Bearer ${credential}`,
      },
    });
  } catch (error) {
    throw wrapHostFetchError(error, origin);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      response.status === 403
        ? BILLING_EXPIRED
        : (typeof data === "string" ? data : data.error) || KIT_HOST_UNREACHABLE;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  const dest =
    destFile || join(mkdtempSync(join(tmpdir(), "ad-kit-")), PLUGIN_TAR_REL);
  mkdirSync(dirname(dest), { recursive: true });
  if (!response.body) {
    writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
    return dest;
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
  return dest;
};

/**
 * Apply the kit into cwd.
 * Order: explicit pluginTar → AUTODEVELOP_KIT_TAR → host /cli/kit → local monorepo pack.
 */
export const applyKit = async ({
  cwd,
  env = process.env,
  packageDir,
  kitRoot,
  pluginTar,
  origin,
  credential,
  fetchImpl = fetch,
} = {}) => {
  let tarFile = pluginTar || "";
  let cleanupDir = "";
  try {
    if (!tarFile) {
      const override = kitEnvOverride(env);
      if (override) {
        tarFile = await resolvePluginTar({ env, packageDir, kitRoot });
      } else if (origin && credential) {
        cleanupDir = mkdtempSync(join(tmpdir(), "ad-kit-dl-"));
        tarFile = await fetchHostedKitTar({
          origin,
          credential,
          fetchImpl,
          destFile: join(cleanupDir, PLUGIN_TAR_REL),
        });
      } else {
        tarFile = await resolvePluginTar({ env, packageDir, kitRoot });
      }
    }
    return applyKitFromTar({ tarFile, workspaceRoot: cwd });
  } finally {
    if (cleanupDir) {
      try {
        rmSync(cleanupDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
};

/** Alias kept for older call sites / tests. */
export const applyBundledKit = applyKit;
