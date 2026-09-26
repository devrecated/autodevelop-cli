/**
 * Copyright (c) 2026 Devrecated
 *
 * Write Cursor user-global MCP after login. Kit stays stdio. Remote host
 * is HTTP url (no TOKEN). Loopback host stays the stdio shim.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { credentialsConfigDir, DIR_MODE, resolveCredentialHost } from "./credentials.mjs";
import { hostMcpHttpUrl, isRemoteMcpHost } from "./mcp-attach.mjs";
import {
  HOST_MCP_NAME,
  KIT_MCP_NAME,
  LEGACY_HOST_MCP_NAME,
  mergeWorkspaceMcp,
} from "./workspace-mcp.mjs";

export const KIT_LAUNCHER = "kit-mcp.mjs";
export const HOST_LAUNCHER = "host-mcp.mjs";
export const INSTALL_SIDECAR = "install.json";

const here = () => dirname(fileURLToPath(import.meta.url));

export const defaultUserMcpPath = (env = process.env, home = homedir()) => {
  const override = String(env.AUTODEVELOP_USER_MCP || "").trim();
  if (override) return override;
  return join(home, ".cursor", "mcp.json");
};

export const interpolateUserPath = (abs, home = homedir()) => {
  const root = String(home || "").replace(/[/\\]+$/, "");
  const value = String(abs || "");
  if (!root || !value) return value;
  const prefix = `${root}/`;
  const winPrefix = `${root}\\`;
  if (value === root) return "${userHome}";
  if (value.startsWith(prefix) || value.startsWith(winPrefix)) {
    return `\${userHome}${value.slice(root.length).replaceAll("\\", "/")}`;
  }
  return value;
};

export const userMcpServers = (launcherDir, { home = homedir(), origin = "" } = {}) => {
  const kit = {
    command: "node",
    args: [interpolateUserPath(join(launcherDir, KIT_LAUNCHER), home)],
  };
  const host = isRemoteMcpHost(origin)
    ? { url: hostMcpHttpUrl(origin) }
    : {
        command: "node",
        args: [interpolateUserPath(join(launcherDir, HOST_LAUNCHER), home)],
      };
  return {
    [KIT_MCP_NAME]: kit,
    [HOST_MCP_NAME]: host,
  };
};

export const writeUserLaunchers = (configDir) => {
  mkdirSync(configDir, { recursive: true, mode: DIR_MODE });
  const src = here();
  const wrote = [];
  for (const name of [KIT_LAUNCHER, HOST_LAUNCHER]) {
    const dest = join(configDir, name);
    writeFileSync(dest, readFileSync(join(src, name)));
    wrote.push(dest);
  }
  return wrote;
};

const sameStdioSpec = (have, want) => {
  if (!have || !want || have.command !== want.command) return false;
  const a = Array.isArray(have.args) ? have.args : [];
  const b = Array.isArray(want.args) ? want.args : [];
  return a.length === b.length && a.every((value, i) => value === b[i]);
};

const sameMcpSpec = (have, want) => {
  if (!have || !want) return false;
  if (want.url) return have.url === want.url && !have.command;
  return sameStdioSpec(have, want);
};

export const userMcpNeedsFirstAttach = (existing, servers) => {
  const prev =
    existing && existing.mcpServers && typeof existing.mcpServers === "object" ? existing.mcpServers : {};
  return ![KIT_MCP_NAME, HOST_MCP_NAME].every((name) => sameMcpSpec(prev[name], servers[name]));
};

const parsePsPidCommand = (text) => {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(.*)$/);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), command: match[2] });
  }
  return rows;
};

export const launcherPidsFromPs = (psText, launcherPaths, { pidSkip = new Set() } = {}) => {
  const needles = launcherPaths.map((path) => String(path || "").trim()).filter(Boolean);
  if (!needles.length) return [];
  const pids = [];
  for (const row of parsePsPidCommand(psText)) {
    if (!Number.isInteger(row.pid) || row.pid <= 0 || pidSkip.has(row.pid)) continue;
    if (needles.some((path) => row.command.includes(path))) pids.push(row.pid);
  }
  return [...new Set(pids)];
};

export const restartLauncherProcesses = (
  launcherPaths,
  { spawn = spawnSync, kill = process.kill, pidSkip = new Set([process.pid]) } = {},
) => {
  if (process.platform === "win32") return [];
  let listed;
  try {
    listed = spawn("ps", ["-ax", "-o", "pid=", "-o", "command="], { encoding: "utf8", timeout: 5000 });
  } catch {
    return [];
  }
  if (!listed || listed.status !== 0) return [];
  const pids = launcherPidsFromPs(listed.stdout || "", launcherPaths, { pidSkip });
  const restarted = [];
  for (const pid of pids) {
    try {
      kill(pid, "SIGTERM");
      restarted.push(pid);
    } catch {
      /* process already gone */
    }
  }
  return restarted;
};

const resolveCursorBin = (env = process.env, spawn = spawnSync) => {
  const override = String(env.CURSOR_BIN || "").trim();
  if (override) return override;
  try {
    const found = spawn("which", ["cursor"], { encoding: "utf8", timeout: 3000 });
    const path = String(found.stdout || "").trim().split("\n")[0] || "";
    if (found.status === 0 && path) return path;
  } catch {
    /* ignore */
  }
  return "";
};

export const isLiveCursorUserMcp = (dest, env = process.env, home = homedir()) => {
  if (String(env.AUTODEVELOP_USER_MCP || "").trim()) return false;
  return dest === join(home, ".cursor", "mcp.json");
};

export const registerUserMcpWithCursorCli = (
  servers,
  { env = process.env, spawn = spawnSync, dest, home = homedir() } = {},
) => {
  const userDest = dest || defaultUserMcpPath(env, home);
  if (!isLiveCursorUserMcp(userDest, env, home)) return [];
  const bin = resolveCursorBin(env, spawn);
  if (!bin) return [];
  const registered = [];
  for (const [name, spec] of Object.entries(servers || {})) {
    const payload = spec.url
      ? JSON.stringify({ name, url: spec.url })
      : JSON.stringify({
          name,
          command: spec.command,
          args: spec.args,
        });
    try {
      const result = spawn(bin, ["--add-mcp", payload], {
        encoding: "utf8",
        timeout: 15000,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      if (result.status === 0) registered.push(name);
    } catch {
      /* Cursor CLI optional */
    }
  }
  return registered;
};

export const userMcpCustomerLines = ({ addedServers, registered = [], servers } = {}) => {
  const httpHost = Boolean(servers?.[HOST_MCP_NAME]?.url);
  if (!addedServers) {
    return [
      httpHost
        ? "Updated Autodevelop MCP in place (stdio kit + HTTP host). No window reload needed."
        : "Updated Autodevelop MCP launchers in place (stdio kit + host). No window reload needed.",
      "Do not paste the token into Plugins.",
    ];
  }
  const lines = [
    httpHost
      ? "Wrote Cursor user MCP. Kit stays stdio; host is HTTP url (Authenticate in Cursor if asked)."
      : "Wrote Cursor user MCP. Command stays node ~/.config/autodevelop/kit-mcp.mjs and host-mcp.mjs.",
  ];
  if (registered.length) {
    lines.push("Registered those servers with the Cursor CLI.");
  } else {
    lines.push(
      "If Autodevelop tools are missing in this chat, start a new agent. A window reload is only needed the first time those server names are added.",
    );
  }
  lines.push("Do not paste the token into Plugins.");
  return lines;
};

export const recordCliInstallPath = (configDir, cliPath, { workspace } = {}) => {
  mkdirSync(configDir, { recursive: true, mode: DIR_MODE });
  const dest = join(configDir, INSTALL_SIDECAR);
  let prev = {};
  if (existsSync(dest)) {
    try {
      const data = JSON.parse(readFileSync(dest, "utf8") || "{}");
      prev = data && typeof data === "object" ? data : {};
    } catch {
      prev = {};
    }
  }
  const cli = String(cliPath || "").trim() || String(prev.cli || "").trim();
  const lastWorkspace = String(workspace || "").trim() || String(prev.lastWorkspace || "").trim();
  const next = { ...prev };
  if (cli) next.cli = cli;
  if (lastWorkspace) next.lastWorkspace = lastWorkspace;
  if (!next.cli && !next.lastWorkspace) return "";
  writeFileSync(dest, `${JSON.stringify(next, null, 2)}\n`);
  return dest;
};

export const resolveCliBin = (root, fromUrl = import.meta.url) => {
  if (root) {
    const fromRepo = join(root, "node_modules", "@devrecated", "autodevelop", "packages", "cli", "bin.mjs");
    if (existsSync(fromRepo)) return fromRepo;
  }
  try {
    const self = fileURLToPath(new URL("./bin.mjs", fromUrl));
    if (existsSync(self)) return self;
  } catch {
    /* ignore */
  }
  return "";
};

const readMcpFile = (dest) => {
  if (!existsSync(dest)) return {};
  try {
    const data = JSON.parse(readFileSync(dest, "utf8") || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

export const writeUserMcp = ({
  env = process.env,
  home = homedir(),
  userMcpPath,
  credentialsPath,
  cliBin,
  cwd,
  host,
  restart = restartLauncherProcesses,
  register = registerUserMcpWithCursorCli,
} = {}) => {
  const dest = userMcpPath || defaultUserMcpPath(env, home);
  const configDir = credentialsConfigDir(credentialsPath, env, home);
  const previous = readMcpFile(dest);
  const launchers = writeUserLaunchers(configDir);
  recordCliInstallPath(configDir, cliBin || resolveCliBin(cwd), { workspace: cwd });
  const origin = resolveCredentialHost({ env, host, credentialsPath, home });
  const servers = userMcpServers(configDir, { home, origin });
  const addedServers = userMcpNeedsFirstAttach(previous, servers);
  const next = mergeWorkspaceMcp(previous, servers);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(next, null, 2)}\n`);
  const restarted = typeof restart === "function" ? restart(launchers) : [];
  const registered =
    addedServers && typeof register === "function" ? register(servers, { env, dest, home }) : [];
  return { dest, configDir, servers, launchers, addedServers, restarted, registered };
};

export const removeUserAutodevelopMcp = ({ env = process.env, home = homedir(), userMcpPath } = {}) => {
  const dest = userMcpPath || defaultUserMcpPath(env, home);
  if (!existsSync(dest)) return null;
  const current = readMcpFile(dest);
  const prev =
    current.mcpServers && typeof current.mcpServers === "object" ? { ...current.mcpServers } : {};
  delete prev[KIT_MCP_NAME];
  delete prev[HOST_MCP_NAME];
  delete prev[LEGACY_HOST_MCP_NAME];
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify({ ...current, mcpServers: prev }, null, 2)}\n`);
  return dest;
};
