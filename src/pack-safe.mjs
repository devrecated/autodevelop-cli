/**
 * Copyright (c) 2026 Devrecated
 *
 * Customer-safe pack helpers (slug, forbidden paths, apply-time checks).
 * Operator packers (pack-client / cli-pack) and the host import from here;
 * the thin customer package ships this module and does not ship pack-client.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listInstanceNames } from "../../../.cursor/skills/autodevelop-internal/scripts/config-load.mjs";

export const KIT_SLUGS = new Set(["autodevelop", "third-party"]);
export const DEFAULT_INSTANCE_SLUG = "devrecated";
export const VERSION_BASENAME = "VERSION";

const FORBIDDEN_BASENAMES = new Set([".env", "firebase-admin.json", "serviceAccount.json"]);
const FORBIDDEN_SEGMENTS = new Set(["node_modules", ".git"]);

const toPosix = (value) => String(value || "").replaceAll("\\", "/");

export const asInstanceSlug = (value) => {
  const name = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,48}$/.test(name) || KIT_SLUGS.has(name)) return "";
  return name;
};

export const dateStamp = (now = new Date()) => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const defaultSlug = (root) => {
  const names = listInstanceNames(root);
  if (names.includes(DEFAULT_INSTANCE_SLUG)) return DEFAULT_INSTANCE_SLUG;
  return names[0] || "";
};

export const isForbiddenRel = (value) => {
  const n = toPosix(value);
  if (!n) return false;
  if (n.includes(".cursor/private")) return true;
  if (n === "web" || n.startsWith("web/") || n.includes("/web/")) return true;
  if (n === "apps" || n.startsWith("apps/") || n.includes("/apps/")) return true;
  if (n === "services" || n.startsWith("services/") || n.includes("/services/")) return true;
  if (n.includes("docs/.vitepress/dist")) return true;
  const parts = n.split("/").filter(Boolean);
  const base = parts[parts.length - 1] || "";
  if (FORBIDDEN_BASENAMES.has(base)) return true;
  if (base.startsWith(".env")) return true;
  if (parts.some((part) => FORBIDDEN_SEGMENTS.has(part))) return true;
  return false;
};

export const instanceFolderOf = (rel) => {
  const n = toPosix(rel);
  if (n === ".autodevelop" || n.startsWith(".autodevelop/")) return ".autodevelop";
  const match = n.match(/(?:^|\/)\.cursor\/skills\/([^/]+)\//);
  return match ? match[1] : "";
};

export const assertPackableFiles = (files, slug) => {
  for (const file of files) {
    const dest = toPosix(file.dest);
    if (isForbiddenRel(dest) || isForbiddenRel(file.src)) {
      throw new Error(`Refusing to pack forbidden path: ${dest || file.src}`);
    }
    const folder = instanceFolderOf(dest);
    if (folder && folder !== ".autodevelop" && !KIT_SLUGS.has(folder) && folder !== slug) {
      throw new Error(`Refusing to pack a second instance folder: ${folder}`);
    }
  }
};

export const assertCliPackSafe = (files, slug) => {
  const mapped = (files || []).map((file) => ({
    dest: file.dest,
    src: file.src || file.dest,
    content: file.content,
  }));
  assertPackableFiles(mapped, slug);
  for (const file of mapped) {
    if (isForbiddenRel(file.dest) || String(file.dest).includes(".cursor/private")) {
      throw new Error(`Refusing to pack forbidden path: ${file.dest}`);
    }
  }
};

export const readLocalPackVersion = (root, slug) => {
  const resolved = asInstanceSlug(slug);
  if (!resolved || !root) return "";
  const candidates = [
    join(root, ".autodevelop", ".policies", VERSION_BASENAME),
    join(root, ".cursor", "skills", resolved, "autodevelop", ".policies", VERSION_BASENAME),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, "utf8").trim();
  }
  return "";
};
