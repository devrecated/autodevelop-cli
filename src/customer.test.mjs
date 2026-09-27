/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCredentialsFile } from "./credentials.mjs";
import { customerMain, customerUsage, CUSTOMER_COMMANDS, runCustomerCommand, runStatus } from "./customer.mjs";
import { parseCli } from "./parse.mjs";

test("customer package refuses employee commands", async () => {
  assert.equal(CUSTOMER_COMMANDS.has("sandbox"), false);
  assert.equal(CUSTOMER_COMMANDS.has("pack-client"), false);
  assert.equal(CUSTOMER_COMMANDS.has("mcp"), true);
  assert.equal(CUSTOMER_COMMANDS.has("profiles"), true);
  assert.match(customerUsage(), /https:\/\/devrecated\.com/);
  assert.match(customerUsage(), /https:\/\/autodevelop\.devrecated\.com/);
  assert.match(customerUsage(), /downloads the kit and org policy pack from the host/);
  assert.match(customerUsage(), /Cursor, Claude Code, and opencode MCP/);
  const code = await customerMain(["sandbox"]);
  assert.equal(code, 1);
  assert.match(customerUsage(), /npx @devrecated\/autodevelop login/);
  assert.equal(customerUsage().includes("--host"), false);
  assert.equal(customerUsage().includes("brain.devrecated.com"), false);
});

test("status defaults to the staging brain when no host is stored", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-status-default-"));
  const status = runStatus({ env: {}, credentialsPath: join(root, "missing.json") });
  assert.equal(status.host, "https://brain.devrecated.com");
  assert.equal(status.signedIn, false);
});

test("status and profiles do not print the host", async () => {
  const root = mkdtempSync(join(tmpdir(), "ad-status-quiet-"));
  const credentialsPath = join(root, "credentials.json");
  writeCredentialsFile(credentialsPath, {
    token: "ad_test_cli_status_quiet_fixture",
    orgId: "org-quiet",
    host: "https://brain.devrecated.com",
  });
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk, ...rest) => {
    chunks.push(String(chunk));
    return original.call(process.stdout, chunk, ...rest);
  };
  try {
    await runCustomerCommand(parseCli(["status", "--credentials", credentialsPath]), {});
    await runCustomerCommand(parseCli(["status", "--json", "--credentials", credentialsPath]), {});
    await runCustomerCommand(parseCli(["profiles", "--credentials", credentialsPath]), {});
    await runCustomerCommand(parseCli(["profiles", "--json", "--credentials", credentialsPath]), {});
  } finally {
    process.stdout.write = original;
  }
  const printed = chunks.join("");
  assert.equal(printed.includes("brain.devrecated.com"), false);
  assert.equal(printed.includes("Host:"), false);
  assert.match(printed, /Signed in/);
  assert.match(printed, /org-quiet/);
});

test("status uses stored credentials host when AUTODEVELOP_HOST is unset", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-status-host-"));
  const credentialsPath = join(root, "credentials.json");
  writeCredentialsFile(credentialsPath, {
    token: "ad_test_cli_status_host_fixture",
    orgId: "org-hosted",
    host: "https://brain.devrecated.com",
  });
  const status = runStatus({ env: {}, credentialsPath });
  assert.equal(status.host, "https://brain.devrecated.com");
  assert.equal(status.signedIn, true);
  assert.equal(JSON.stringify(status).includes("ad_test_cli_status_host_fixture"), false);
});

test("status prefers AUTODEVELOP_HOST over stored host", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-status-env-"));
  const credentialsPath = join(root, "credentials.json");
  writeCredentialsFile(credentialsPath, {
    token: "ad_test_cli_status_env_fixture",
    host: "https://brain.devrecated.com",
  });
  const status = runStatus({
    env: { AUTODEVELOP_HOST: "https://override.test" },
    credentialsPath,
  });
  assert.equal(status.host, "https://override.test");
});

test("status prefers --host over stored credentials host", () => {
  const root = mkdtempSync(join(tmpdir(), "ad-status-flag-"));
  const credentialsPath = join(root, "credentials.json");
  writeCredentialsFile(credentialsPath, {
    token: "ad_test_cli_status_flag_fixture",
    host: "https://brain.devrecated.com",
  });
  const status = runStatus({
    env: {},
    host: "https://flag.test",
    credentialsPath,
  });
  assert.equal(status.host, "https://flag.test");
});

test("status shows the active profile and logout strips only Autodevelop user MCP", async () => {
  const root = mkdtempSync(join(tmpdir(), "ad-cust-"));
  const credentialsPath = join(root, "credentials.json");
  const userMcp = join(root, "user-mcp.json");
  mkdirSync(root, { recursive: true });
  writeCredentialsFile(credentialsPath, { token: "ad_test_cli_status_fixture", orgId: "org-9", host: "http://host.test" });
  writeCredentialsFile(credentialsPath, {
    token: "ad_test_cli_status_other",
    orgId: "org-8",
    host: "http://other.test",
    profile: "other",
  });
  writeFileSync(
    userMcp,
    JSON.stringify({
      mcpServers: {
        runpod: { command: "npx" },
        autodevelop: { command: "node" },
        "autodevelop-host": { command: "node" },
      },
    }),
  );
  const env = { AUTODEVELOP_USER_MCP: userMcp, AUTODEVELOP_HOST: "http://host.test" };
  const status = runStatus({ env, credentialsPath });
  assert.equal(status.profile, "other");
  assert.equal(status.orgId, "org-8");
  assert.equal(JSON.stringify(status).includes("ad_test_cli_status_other"), false);
  await runCustomerCommand(parseCli(["logout", "--profile", "other", "--credentials", credentialsPath]), env);
  const afterOne = JSON.parse(readFileSync(userMcp, "utf8"));
  assert.equal(afterOne.mcpServers.autodevelop.command, "node");
  assert.equal(afterOne.mcpServers.runpod.command, "npx");
  const next = runStatus({ env, credentialsPath });
  assert.equal(next.profile, "default");
  await runCustomerCommand(parseCli(["logout", "--credentials", credentialsPath]), env);
  const afterAll = JSON.parse(readFileSync(userMcp, "utf8"));
  assert.equal(afterAll.mcpServers.runpod.command, "npx");
  assert.equal(afterAll.mcpServers.autodevelop, undefined);
  assert.equal(afterAll.mcpServers["autodevelop-host"], undefined);
});
