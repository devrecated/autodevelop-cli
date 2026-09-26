/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CREDENTIALS_MODE,
  assertProfileName,
  clearCredentialsFile,
  clearProfile,
  defaultCredentialsPath,
  listProfileSummaries,
  readCredentialsFile,
  readCredentialsStore,
  readSubscriptionToken,
  setActiveProfile,
  tokenSource,
  writeCredentialsFile,
  resolveCredentialHost,
} from "./credentials.mjs";

const FIXTURE = "ad_test_cli_credential_fixture";

test("default path is XDG config", () => {
  assert.equal(
    defaultCredentialsPath({ XDG_CONFIG_HOME: "/tmp/xdg-ad" }, "/home/dev"),
    "/tmp/xdg-ad/autodevelop/credentials.json",
  );
  assert.match(defaultCredentialsPath({}, "/home/dev"), /\/home\/dev\/\.config\/autodevelop\/credentials\.json$/);
});

test("writes mode 0600 and never returns empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-cred-"));
  const path = join(dir, "credentials.json");
  writeCredentialsFile(path, { token: FIXTURE, orgId: "org-1", host: "http://127.0.0.1:8787" });
  const mode = statSync(path).mode & 0o777;
  assert.equal(mode, CREDENTIALS_MODE);
  const stored = readCredentialsFile(path);
  assert.equal(stored.token, FIXTURE);
  assert.equal(stored.org_id, "org-1");
  chmodSync(path, 0o644);
  writeCredentialsFile(path, { token: FIXTURE });
  assert.equal(statSync(path).mode & 0o777, CREDENTIALS_MODE);
  clearCredentialsFile(path);
  assert.equal(existsSync(path), false);
});

test("token order is env, then credentials file, then plugin TOKEN", () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-cred-"));
  const path = join(dir, "credentials.json");
  writeCredentialsFile(path, { token: FIXTURE });
  assert.equal(readSubscriptionToken({ AUTODEVELOP_TOKEN: "ad_test_env" }, { credentialsPath: path }), "ad_test_env");
  assert.equal(tokenSource({ AUTODEVELOP_TOKEN: "ad_test_env" }, { credentialsPath: path }), "AUTODEVELOP_TOKEN");
  assert.equal(readSubscriptionToken({}, { credentialsPath: path }), FIXTURE);
  assert.equal(tokenSource({}, { credentialsPath: path }), "credentials");
  assert.equal(readSubscriptionToken({ TOKEN: "ad_test_plugin" }, { credentialsPath: join(dir, "missing.json") }), "ad_test_plugin");
  assert.equal(tokenSource({ TOKEN: "ad_test_plugin" }, { credentialsPath: join(dir, "missing.json") }), "TOKEN");
  assert.equal(readSubscriptionToken({}, { credentialsPath: join(dir, "missing.json") }), null);
});

test("old flat credentials file is profile default", () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-cred-flat-"));
  const path = join(dir, "credentials.json");
  writeFileSync(
    path,
    `${JSON.stringify({
      token: FIXTURE,
      org_id: "org-flat",
      issued_at: "2026-01-01T00:00:00.000Z",
      host: "http://flat.test",
    })}\n`,
  );
  const stored = readCredentialsFile(path);
  assert.equal(stored.token, FIXTURE);
  assert.equal(stored.org_id, "org-flat");
  assert.equal(stored.host, "http://flat.test");
  assert.equal(tokenSource({}, { credentialsPath: path }), "credentials");
  assert.equal(readCredentialsStore(path).active, "default");
  writeCredentialsFile(path, { token: `${FIXTURE}_two`, host: "http://two.test", profile: "sandbox" });
  assert.equal(readCredentialsStore(path).active, "sandbox");
  assert.equal(readCredentialsFile(path, { profile: "default" }).org_id, "org-flat");
  assert.equal(readCredentialsFile(path).token, `${FIXTURE}_two`);
});

test("second profile login switches active and tokenSource follows", () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-cred-profiles-"));
  const path = join(dir, "credentials.json");
  writeCredentialsFile(path, { token: `${FIXTURE}_default`, orgId: "org-1", host: "http://one.test" });
  writeCredentialsFile(path, {
    token: `${FIXTURE}_sandbox`,
    orgId: "org-2",
    host: "http://two.test",
    profile: "sandbox",
  });
  const store = readCredentialsStore(path);
  assert.equal(store.active, "sandbox");
  assert.equal(readCredentialsFile(path).token, `${FIXTURE}_sandbox`);
  assert.equal(readCredentialsFile(path).org_id, "org-2");
  assert.equal(readSubscriptionToken({}, { credentialsPath: path }), `${FIXTURE}_sandbox`);
  assert.equal(tokenSource({}, { credentialsPath: path }), "credentials");
  assert.equal(readCredentialsFile(path, { profile: "default" }).token, `${FIXTURE}_default`);
  assert.equal(
    readSubscriptionToken({ AUTODEVELOP_PROFILE: "default" }, { credentialsPath: path }),
    `${FIXTURE}_default`,
  );
  assert.equal(setActiveProfile(path, "default"), "default");
  assert.equal(readCredentialsFile(path).org_id, "org-1");
  const names = listProfileSummaries(path).map((row) => row.name).sort();
  assert.deepEqual(names, ["default", "sandbox"]);
  assert.equal(
    listProfileSummaries(path).some((row) => row.active && row.name === "default"),
    true,
  );
  assert.equal(JSON.stringify(listProfileSummaries(path)).includes("token"), false);
  assert.equal(JSON.stringify(store.profiles.sandbox).includes(`${FIXTURE}_sandbox`), true);
});

test("invalid profile name is rejected", () => {
  assert.throws(() => assertProfileName("../etc"), /Invalid profile name/);
  assert.throws(() => assertProfileName("has/slash"), /Invalid profile name/);
  assert.throws(() => assertProfileName(""), /Invalid profile name/);
  assert.throws(() => assertProfileName("a".repeat(41)), /Invalid profile name/);
  assert.equal(assertProfileName("sandbox.org"), "sandbox.org");
  const dir = mkdtempSync(join(tmpdir(), "ad-cred-bad-"));
  const path = join(dir, "credentials.json");
  assert.throws(
    () => writeCredentialsFile(path, { token: FIXTURE, profile: "bad name" }),
    /Invalid profile name/,
  );
  assert.equal(existsSync(path), false);
});

test("clearProfile removes one login and picks another remaining", () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-cred-clear-"));
  const path = join(dir, "credentials.json");
  writeCredentialsFile(path, { token: `${FIXTURE}_a`, profile: "alpha" });
  writeCredentialsFile(path, { token: `${FIXTURE}_b`, profile: "beta" });
  const first = clearProfile(path, "beta");
  assert.equal(first.empty, false);
  assert.equal(first.active, "alpha");
  assert.equal(readCredentialsFile(path).token, `${FIXTURE}_a`);
  const last = clearProfile(path, "alpha");
  assert.equal(last.empty, true);
  assert.equal(existsSync(path), false);
});

test("resolveCredentialHost uses stored login host", () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-cred-host-"));
  const path = join(dir, "credentials.json");
  writeCredentialsFile(path, { token: FIXTURE, host: "https://brain.devrecated.com" });
  assert.equal(resolveCredentialHost({ env: {}, credentialsPath: path }), "https://brain.devrecated.com");
  assert.equal(
    resolveCredentialHost({ env: { AUTODEVELOP_HOST: "http://127.0.0.1:8787" }, credentialsPath: path }),
    "http://127.0.0.1:8787",
  );
});
