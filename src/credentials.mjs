/**
 * Copyright (c) 2026 Devrecated
 *
 * Machine credentials for the Autodevelop CLI. Never print the token value.
 * Flat `{ token, ... }` files are profile `default`. New writes use
 * `{ active, profiles }`. AUTODEVELOP_PROFILE overrides the active profile.
 *
 * Also manages user-level origins config at ~/.config/autodevelop/origins.yaml
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { hostOrigin } from "./host.mjs";
import { parseSimpleYaml } from "../../../.cursor/hooks/autodevelop/lib.mjs";

export const CREDENTIALS_MODE = 0o600;
export const DIR_MODE = 0o700;
export const DEFAULT_PROFILE = "default";
export const PROFILE_NAME_MAX = 40;
export const PROFILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export const defaultOriginsPath = (env = process.env, home = homedir()) => {
  const override = String(env.AUTODEVELOP_ORIGINS || "").trim();
  if (override) return override;
  const xdg = String(env.XDG_CONFIG_HOME || "").trim();
  const base = xdg || join(home, ".config");
  return join(base, "autodevelop", "origins.yaml");
};

const validateOrigin = (value) => {
  const v = String(value || "").trim();
  if (!v) return null;
  try {
    new URL(v);
    return v.replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid origin URL: ${value}`);
  }
};

export const readOriginsConfig = (path) => {
  if (!path || !existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const doc = parseSimpleYaml(raw) || {};
    return {
      host: validateOrigin(doc.host),
      api: validateOrigin(doc.api),
      tickets: validateOrigin(doc.tickets),
      try: validateOrigin(doc.try),
    };
  } catch {
    return {};
  }
};

export const writeOriginsConfig = (path, { host, api, tickets, try: tryOrigin } = {}) => {
  const doc = {
    host: validateOrigin(host),
    api: validateOrigin(api),
    tickets: validateOrigin(tickets),
    try: validateOrigin(tryOrigin),
  };
  const yaml = [
    doc.host ? `host: ${doc.host}` : null,
    doc.api ? `api: ${doc.api}` : null,
    doc.tickets ? `tickets: ${doc.tickets}` : null,
    doc.try ? `try: ${doc.try}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  mkdirSync(dirname(path), { recursive: true, mode: DIR_MODE });
  writeFileSync(path, `${yaml}\n`, { mode: CREDENTIALS_MODE });
  chmodSync(path, CREDENTIALS_MODE);
  return path;
};

export const clearOriginsConfig = (path) => {
  if (path && existsSync(path)) unlinkSync(path);
};

export const defaultCredentialsPath = (env = process.env, home = homedir()) => {
  const override = String(env.AUTODEVELOP_CREDENTIALS || "").trim();
  if (override) return override;
  const xdg = String(env.XDG_CONFIG_HOME || "").trim();
  const base = xdg || join(home, ".config");
  return join(base, "autodevelop", "credentials.json");
};

export const credentialsConfigDir = (credentialsPath, env = process.env, home = homedir()) =>
  dirname(credentialsPath || defaultCredentialsPath(env, home));

export const assertProfileName = (name) => {
  const value = String(name || "").trim();
  if (!value || value.length > PROFILE_NAME_MAX || !PROFILE_NAME_RE.test(value)) {
    throw new Error(
      "Invalid profile name. Use letters, numbers, dot, underscore, or hyphen (max 40 characters).",
    );
  }
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    throw new Error(
      "Invalid profile name. Use letters, numbers, dot, underscore, or hyphen (max 40 characters).",
    );
  }
  return value;
};

export const resolveProfileName = ({ env = process.env, profile, active } = {}) => {
  const fromArg = String(profile || "").trim();
  if (fromArg) return assertProfileName(fromArg);
  const fromEnv = String(env.AUTODEVELOP_PROFILE || "").trim();
  if (fromEnv) return assertProfileName(fromEnv);
  const fromActive = String(active || "").trim();
  if (fromActive) return assertProfileName(fromActive);
  return DEFAULT_PROFILE;
};

const normalizeEntry = (data) => {
  if (!data || typeof data !== "object") return null;
  const token = String(data.token || "").trim();
  if (!token) return null;
  return {
    token,
    org_id: data.org_id || data.orgId || null,
    issued_at: data.issued_at || data.issuedAt || null,
    host: data.host || null,
  };
};

const persistEntry = (entry) => ({
  token: entry.token,
  org_id: entry.org_id || null,
  issued_at: entry.issued_at || null,
  host: entry.host || null,
});

export const readCredentialsStore = (path) => {
  if (!path || !existsSync(path)) return { active: DEFAULT_PROFILE, profiles: {} };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (!data || typeof data !== "object") return { active: DEFAULT_PROFILE, profiles: {} };
    if (data.profiles && typeof data.profiles === "object") {
      const profiles = {};
      for (const [name, entry] of Object.entries(data.profiles)) {
        const norm = normalizeEntry(entry);
        if (norm) profiles[name] = norm;
      }
      const active = String(data.active || "").trim() || DEFAULT_PROFILE;
      return { active, profiles };
    }
    const flat = normalizeEntry(data);
    return {
      active: DEFAULT_PROFILE,
      profiles: flat ? { [DEFAULT_PROFILE]: flat } : {},
    };
  } catch {
    return { active: DEFAULT_PROFILE, profiles: {} };
  }
};

const writeStore = (path, store) => {
  const profiles = {};
  for (const [name, entry] of Object.entries(store.profiles || {})) {
    if (entry) profiles[name] = persistEntry(entry);
  }
  mkdirSync(dirname(path), { recursive: true, mode: DIR_MODE });
  writeFileSync(
    path,
    `${JSON.stringify({ active: store.active || DEFAULT_PROFILE, profiles }, null, 2)}\n`,
    { mode: CREDENTIALS_MODE },
  );
  chmodSync(path, CREDENTIALS_MODE);
  return path;
};

export const readCredentialsFile = (path, { env = process.env, profile } = {}) => {
  const store = readCredentialsStore(path);
  let name = DEFAULT_PROFILE;
  try {
    name = resolveProfileName({ env, profile, active: store.active });
  } catch {
    if (String(profile || env.AUTODEVELOP_PROFILE || "").trim()) return null;
    name = store.profiles[DEFAULT_PROFILE]
      ? DEFAULT_PROFILE
      : Object.keys(store.profiles)[0] || DEFAULT_PROFILE;
  }
  return store.profiles[name] || null;
};

export const writeCredentialsFile = (
  path,
  { token, orgId = null, issuedAt = null, host = null, profile } = {},
  env = process.env,
) => {
  const raw = String(token || "").trim();
  if (!raw) throw new Error("Refusing to write empty credentials.");
  const name = resolveProfileName({ env, profile });
  const store = readCredentialsStore(path);
  store.profiles[name] = {
    token: raw,
    org_id: orgId || null,
    issued_at: issuedAt || new Date().toISOString(),
    host: host || null,
  };
  store.active = name;
  return writeStore(path, store);
};

export const clearCredentialsFile = (path) => {
  if (path && existsSync(path)) unlinkSync(path);
};

export const clearProfile = (path, name, env = process.env) => {
  const store = readCredentialsStore(path);
  const target = resolveProfileName({ env, profile: name, active: store.active });
  delete store.profiles[target];
  const remaining = Object.keys(store.profiles);
  if (remaining.length === 0) {
    clearCredentialsFile(path);
    return { empty: true, active: null, removed: target };
  }
  const active = store.active === target ? remaining[0] : store.active;
  writeStore(path, { active, profiles: store.profiles });
  return { empty: false, active, removed: target };
};

export const setActiveProfile = (path, name) => {
  const profile = assertProfileName(name);
  const store = readCredentialsStore(path);
  if (!store.profiles[profile]) {
    throw new Error(`Unknown profile: ${profile}`);
  }
  writeStore(path, { ...store, active: profile });
  return profile;
};

export const listProfileSummaries = (path, { env = process.env } = {}) => {
  const store = readCredentialsStore(path);
  let active = store.active || DEFAULT_PROFILE;
  try {
    active = resolveProfileName({ env, active: store.active });
  } catch {
    active = store.active || DEFAULT_PROFILE;
  }
  return Object.entries(store.profiles).map(([name, entry]) => ({
    name,
    active: name === active,
    host: entry.host || null,
    org_id: entry.org_id || null,
  }));
};

export const readSubscriptionToken = (env = process.env, { credentialsPath, home, profile } = {}) => {
  const fromEnv = String(env.AUTODEVELOP_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const file = readCredentialsFile(credentialsPath || defaultCredentialsPath(env, home), { env, profile });
  if (file?.token) return file.token;
  const plugin = String(env.TOKEN || "").trim();
  return plugin || null;
};

export const tokenSource = (env = process.env, { credentialsPath, home, profile } = {}) => {
  if (String(env.AUTODEVELOP_TOKEN || "").trim()) return "AUTODEVELOP_TOKEN";
  if (readCredentialsFile(credentialsPath || defaultCredentialsPath(env, home), { env, profile })) {
    return "credentials";
  }
  if (String(env.TOKEN || "").trim()) return "TOKEN";
  return null;
};

/** Flag, then AUTODEVELOP_HOST, then the host written at login. */
export const resolveCredentialHost = ({
  env = process.env,
  host,
  credentialsPath,
  home,
  profile,
} = {}) => {
  const path = credentialsPath || defaultCredentialsPath(env, home);
  const stored = readCredentialsFile(path, { env, profile });
  return hostOrigin(env, host, stored?.host);
};
