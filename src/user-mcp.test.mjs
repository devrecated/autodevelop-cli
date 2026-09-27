/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeCredentialsFile } from "./credentials.mjs";
import { findHostCli } from "./host-mcp.mjs";
import { findKitServer, missingKitMessage, resolveKitServer } from "./kit-mcp.mjs";
import {
  interpolateUserPath,
  isLiveCursorUserMcp,
  KIT_LAUNCHER,
  launcherPidsFromPs,
  registerUserMcpWithCursorCli,
  removeUserAutodevelopMcp,
  userMcpCustomerLines,
  userMcpNeedsFirstAttach,
  writeUserMcp,
} from "./user-mcp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL_HOST = "http://127.0.0.1:8787";

test("writeUserMcp merges unrelated servers and drops legacy buckets", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-user-mcp-"));
  const home = join(root, "home");
  const configDir = join(root, "config");
  const userMcp = join(home, ".cursor", "mcp.json");
  mkdirSync(dirname(userMcp), { recursive: true });
  writeFileSync(
    userMcp,
    JSON.stringify({
      mcpServers: {
        firebase: { command: "npx", args: ["-y", "firebase"] },
        "chrome-devtools": { command: "npx" },
        autodevelop: { command: "old" },
        "autodevelop-buckets": {
          url: "${AUTODEVELOP_MCP_URL}",
          headers: { Authorization: "Bearer ${TOKEN}" },
        },
      },
    }),
  );
  const result = writeUserMcp({
    env: {
      AUTODEVELOP_USER_MCP: userMcp,
      AUTODEVELOP_CREDENTIALS: join(configDir, "credentials.json"),
      AUTODEVELOP_HOST: LOCAL_HOST,
    },
    home,
    credentialsPath: join(configDir, "credentials.json"),
    cliBin: join(here, "bin.mjs"),
    cwd: root,
  });
  const data = JSON.parse(readFileSync(userMcp, "utf8"));
  assert.equal(data.mcpServers.firebase.command, "npx");
  assert.equal(data.mcpServers["chrome-devtools"].command, "npx");
  assert.equal(data.mcpServers.autodevelop.command, "node");
  assert.equal(data.mcpServers["autodevelop-host"].command, "node");
  assert.equal(data.mcpServers["autodevelop-buckets"], undefined);
  assert.equal(data.$schema, undefined);
  const text = JSON.stringify(data);
  assert.equal(text.includes("TOKEN"), false);
  assert.equal(text.includes("Bearer"), false);
  assert.match(data.mcpServers.autodevelop.args[0], /kit-mcp\.mjs$/);
  assert.match(data.mcpServers["autodevelop-host"].args[0], /host-mcp\.mjs$/);
  assert.equal(readFileSync(join(configDir, "kit-mcp.mjs"), "utf8").includes("findKitServer"), true);
  assert.equal(readFileSync(join(configDir, "kit-mcp.mjs"), "utf8").includes("autodevelop-internal"), true);
  const recorded = JSON.parse(readFileSync(join(configDir, "install.json"), "utf8"));
  assert.equal(recorded.cli, join(here, "bin.mjs"));
  assert.equal(recorded.lastWorkspace, root);
  assert.equal(result.dest, userMcp);
  assert.equal(result.addedServers, true);
});

test("writeUserMcp uses HTTP url for a remote host and keeps kit stdio", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-user-http-"));
  const home = join(root, "home");
  const configDir = join(root, "config");
  const userMcp = join(home, ".cursor", "mcp.json");
  const credentialsPath = join(configDir, "credentials.json");
  writeCredentialsFile(credentialsPath, {
    token: "ad_test_cli_mcp_http_fixture",
    host: "https://brain.devrecated.com",
  });
  writeUserMcp({
    env: { AUTODEVELOP_USER_MCP: userMcp, AUTODEVELOP_CREDENTIALS: credentialsPath },
    home,
    credentialsPath,
    cliBin: join(here, "bin.mjs"),
    cwd: root,
  });
  const data = JSON.parse(readFileSync(userMcp, "utf8"));
  assert.equal(data.mcpServers.autodevelop.command, "node");
  assert.equal(data.mcpServers["autodevelop-host"].url, "https://brain.devrecated.com/mcp");
  assert.equal(data.mcpServers["autodevelop-host"].command, undefined);
  assert.equal(JSON.stringify(data).includes("TOKEN"), false);
  assert.equal(JSON.stringify(data).includes("ad_test_cli_mcp_http_fixture"), false);
});

test("writeUserMcp interpolates paths under home and skips schema", () => {
  const home = "/Users/dev";
  assert.equal(
    interpolateUserPath("/Users/dev/.config/autodevelop/kit-mcp.mjs", home),
    "${userHome}/.config/autodevelop/kit-mcp.mjs",
  );
  assert.equal(interpolateUserPath("/tmp/other/kit-mcp.mjs", home), "/tmp/other/kit-mcp.mjs");
  const root = mkdtempSync(join(tmpdir(), "ad-user-home-"));
  const userHome = join(root, "Users", "dev");
  const configDir = join(userHome, ".config", "autodevelop");
  const userMcp = join(root, "cursor-mcp.json");
  writeUserMcp({
    env: { AUTODEVELOP_USER_MCP: userMcp, AUTODEVELOP_HOST: LOCAL_HOST },
    home: userHome,
    credentialsPath: join(configDir, "credentials.json"),
    cliBin: join(here, "bin.mjs"),
  });
  const data = JSON.parse(readFileSync(userMcp, "utf8"));
  assert.equal(data.mcpServers.autodevelop.args[0], "${userHome}/.config/autodevelop/kit-mcp.mjs");
  assert.equal(data.mcpServers["autodevelop-host"].args[0], "${userHome}/.config/autodevelop/host-mcp.mjs");
});

test("writeUserMcp overwrites stale launchers and does not treat a matching command as first attach", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-user-relogin-"));
  const home = join(root, "home");
  const configDir = join(home, ".config", "autodevelop");
  const userMcp = join(home, ".cursor", "mcp.json");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(dirname(userMcp), { recursive: true });
  writeFileSync(join(configDir, KIT_LAUNCHER), "export const findKitServer = () => \"stale\";\n");
  writeFileSync(
    userMcp,
    JSON.stringify({
      mcpServers: {
        autodevelop: {
          command: "node",
          args: ["${userHome}/.config/autodevelop/kit-mcp.mjs"],
        },
        "autodevelop-host": {
          command: "node",
          args: ["${userHome}/.config/autodevelop/host-mcp.mjs"],
        },
      },
    }),
  );
  const result = writeUserMcp({
    env: {
      AUTODEVELOP_USER_MCP: userMcp,
      AUTODEVELOP_CREDENTIALS: join(configDir, "credentials.json"),
      AUTODEVELOP_HOST: LOCAL_HOST,
    },
    home,
    credentialsPath: join(configDir, "credentials.json"),
    cliBin: join(here, "bin.mjs"),
    cwd: root,
    restart: () => [4242],
    register: () => {
      throw new Error("must not register when servers already match");
    },
  });
  assert.equal(result.addedServers, false);
  assert.deepEqual(result.restarted, [4242]);
  assert.equal(readFileSync(join(configDir, KIT_LAUNCHER), "utf8").includes("stale"), false);
  assert.equal(readFileSync(join(configDir, KIT_LAUNCHER), "utf8").includes("autodevelop-internal"), true);
  assert.equal(userMcpNeedsFirstAttach(JSON.parse(readFileSync(userMcp, "utf8")), result.servers), false);
});

test("user MCP customer copy distinguishes first attach from in-place launcher update", () => {
  assert.match(userMcpCustomerLines({ addedServers: false }).join("\n"), /No window reload needed/);
  assert.equal(userMcpCustomerLines({ addedServers: false }).join("\n").includes("Reload Window"), false);
  assert.match(
    userMcpCustomerLines({ addedServers: true, registered: [] }).join("\n"),
    /first time those server names are added/,
  );
  assert.match(
    userMcpCustomerLines({ addedServers: true, registered: ["autodevelop"] }).join("\n"),
    /Registered those servers with the Cursor CLI/,
  );
  assert.match(
    userMcpCustomerLines({
      addedServers: true,
      registered: [],
      servers: { "autodevelop-host": { url: "https://brain.devrecated.com/mcp" } },
    }).join("\n"),
    /HTTP url/,
  );
  assert.equal(isLiveCursorUserMcp("/tmp/mcp.json", { AUTODEVELOP_USER_MCP: "/tmp/mcp.json" }), false);
  const pids = launcherPidsFromPs(
    "  11 node /tmp/cfg/kit-mcp.mjs\n12 node /tmp/other.js\n13 node /tmp/cfg/host-mcp.mjs\n",
    ["/tmp/cfg/kit-mcp.mjs", "/tmp/cfg/host-mcp.mjs"],
    { pidSkip: new Set([11]) },
  );
  assert.deepEqual(pids, [13]);
});

test("registerUserMcpWithCursorCli uses --add-mcp only for the live user mcp.json", () => {
  const calls = [];
  const spawn = (bin, args) => {
    calls.push([bin, args]);
    return { status: 0, stdout: "" };
  };
  const servers = {
    autodevelop: { command: "node", args: ["${userHome}/.config/autodevelop/kit-mcp.mjs"] },
  };
  const skipped = registerUserMcpWithCursorCli(servers, {
    env: { AUTODEVELOP_USER_MCP: "/tmp/mcp.json", CURSOR_BIN: "/bin/cursor" },
    spawn,
    dest: "/tmp/mcp.json",
    home: "/tmp/home",
  });
  assert.deepEqual(skipped, []);
  const added = registerUserMcpWithCursorCli(servers, {
    env: { CURSOR_BIN: "/bin/cursor" },
    spawn,
    dest: "/tmp/home/.cursor/mcp.json",
    home: "/tmp/home",
  });
  assert.deepEqual(added, ["autodevelop"]);
  assert.equal(calls[0][0], "/bin/cursor");
  assert.equal(calls[0][1][0], "--add-mcp");
  assert.match(calls[0][1][1], /"name":"autodevelop"/);
  const httpAdded = registerUserMcpWithCursorCli(
    { "autodevelop-host": { url: "https://brain.devrecated.com/mcp" } },
    {
      env: { CURSOR_BIN: "/bin/cursor" },
      spawn,
      dest: "/tmp/home/.cursor/mcp.json",
      home: "/tmp/home",
    },
  );
  assert.deepEqual(httpAdded, ["autodevelop-host"]);
  assert.match(calls[1][1][1], /"url":"https:\/\/brain.devrecated.com\/mcp"/);
});

test("removeUserAutodevelopMcp strips only Autodevelop keys", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-user-rm-"));
  const userMcp = join(root, "mcp.json");
  writeFileSync(
    userMcp,
    JSON.stringify({
      mcpServers: {
        plane: { command: "npx" },
        autodevelop: { command: "node" },
        "autodevelop-host": { command: "node" },
        "autodevelop-buckets": { command: "old" },
      },
    }),
  );
  removeUserAutodevelopMcp({ env: { AUTODEVELOP_USER_MCP: userMcp } });
  const data = JSON.parse(readFileSync(userMcp, "utf8"));
  assert.equal(data.mcpServers.plane.command, "npx");
  assert.equal(data.mcpServers.autodevelop, undefined);
  assert.equal(data.mcpServers["autodevelop-host"], undefined);
  assert.equal(data.mcpServers["autodevelop-buckets"], undefined);
});

const spawnEnv = (extra = {}) => ({
  PATH: process.env.PATH,
  HOME: extra.HOME || process.env.HOME,
  ...extra,
});

test("kit launcher walks cwd and exits when missing", () => {
  const repo = mkdtempSync(join(tmpdir(), "ad-kit-walk-"));
  const server = join(repo, ".cursor", "skills", "autodevelop", "mcp", "server.mjs");
  mkdirSync(dirname(server), { recursive: true });
  writeFileSync(server, "export {}\n");
  assert.equal(findKitServer(join(repo, "web", "app")), server);
  const dogfood = mkdtempSync(join(tmpdir(), "ad-kit-internal-"));
  const internal = join(dogfood, ".cursor", "skills", "autodevelop-internal", "mcp", "server.mjs");
  mkdirSync(dirname(internal), { recursive: true });
  writeFileSync(internal, "export {}\n");
  assert.equal(findKitServer(join(dogfood, "packages", "cli")), internal);
  const both = mkdtempSync(join(tmpdir(), "ad-kit-both-"));
  const consumer = join(both, ".cursor", "skills", "autodevelop", "mcp", "server.mjs");
  const alsoInternal = join(both, ".cursor", "skills", "autodevelop-internal", "mcp", "server.mjs");
  mkdirSync(dirname(consumer), { recursive: true });
  mkdirSync(dirname(alsoInternal), { recursive: true });
  writeFileSync(consumer, "export {}\n");
  writeFileSync(alsoInternal, "export {}\n");
  assert.equal(findKitServer(both), consumer);
  const empty = mkdtempSync(join(tmpdir(), "ad-kit-empty-"));
  assert.equal(findKitServer(empty), "");
  const result = spawnSync(process.execPath, [join(here, "kit-mcp.mjs")], {
    cwd: empty,
    encoding: "utf8",
    env: spawnEnv({ HOME: empty }),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not installed/);
  assert.equal(result.stderr.includes(missingKitMessage), true);
});

test("kit launcher finds the repo when spawn cwd is not the workspace", () => {
  const repo = mkdtempSync(join(tmpdir(), "ad-kit-elsewhere-"));
  const nested = join(repo, "packages", "cli");
  mkdirSync(nested, { recursive: true });
  const server = join(repo, ".cursor", "skills", "autodevelop-internal", "mcp", "server.mjs");
  mkdirSync(dirname(server), { recursive: true });
  writeFileSync(server, "process.stdout.write('kit-ok\\n');\n");
  const elsewhere = mkdtempSync(join(tmpdir(), "ad-kit-spawn-cwd-"));
  assert.equal(findKitServer(elsewhere), "");
  assert.equal(
    resolveKitServer({
      start: elsewhere,
      env: { CURSOR_PROJECT_DIR: repo },
    }),
    server,
  );
  assert.equal(
    resolveKitServer({
      start: elsewhere,
      env: { PWD: nested },
    }),
    server,
  );
  const launcherDir = mkdtempSync(join(tmpdir(), "ad-kit-cfg-"));
  copyFileSync(join(here, "kit-mcp.mjs"), join(launcherDir, "kit-mcp.mjs"));
  writeFileSync(
    join(launcherDir, "install.json"),
    `${JSON.stringify({ lastWorkspace: repo }, null, 2)}\n`,
  );
  assert.equal(
    resolveKitServer({ start: elsewhere, env: {}, configDir: launcherDir }),
    server,
  );
  const fromEnv = spawnSync(process.execPath, [join(here, "kit-mcp.mjs")], {
    cwd: elsewhere,
    encoding: "utf8",
    env: spawnEnv({ HOME: elsewhere, CURSOR_PROJECT_DIR: repo }),
  });
  assert.equal(fromEnv.status, 0, fromEnv.stderr);
  assert.match(fromEnv.stdout, /kit-ok/);
  const fromSidecar = spawnSync(process.execPath, [join(launcherDir, "kit-mcp.mjs")], {
    cwd: elsewhere,
    encoding: "utf8",
    env: spawnEnv({ HOME: elsewhere }),
  });
  assert.equal(fromSidecar.status, 0, fromSidecar.stderr);
  assert.match(fromSidecar.stdout, /kit-ok/);
});

test("host launcher prefers recorded install path", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-host-cli-"));
  const recorded = join(root, "recorded-bin.mjs");
  writeFileSync(recorded, "export {}\n");
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "config", "install.json"), `${JSON.stringify({ cli: recorded })}\n`);
  mkdirSync(join(root, "repo", "node_modules", "@devrecated", "autodevelop", "packages", "cli"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "repo", "node_modules", "@devrecated", "autodevelop", "packages", "cli", "bin.mjs"),
    "export {}\n",
  );
  assert.equal(findHostCli({ start: join(root, "repo"), configDir: join(root, "config") }), recorded);
  assert.equal(
    findHostCli({ start: join(root, "repo") }),
    join(root, "repo", "node_modules", "@devrecated", "autodevelop", "packages", "cli", "bin.mjs"),
  );
});
