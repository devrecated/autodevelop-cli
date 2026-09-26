/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BILLING_EXPIRED, GITHUB_TOKEN_MISSING } from "@devrecated/autodevelop-sdk/errors";
import { writeCredentialsFile } from "./credentials.mjs";
import { fetchGithubToken, runGithubInit, runGithubStatus, runGithubToken } from "./github.mjs";

test("fetchGithubToken surfaces the paywall on 403", async () => {
  await assert.rejects(
    () =>
      fetchGithubToken({
        origin: "http://127.0.0.1:8787",
        credential: "ad_fixture",
        fetchImpl: async () => new Response(BILLING_EXPIRED, { status: 403 }),
      }),
    (err) => err.message === BILLING_EXPIRED && err.status === 403,
  );
});

test("fetchGithubToken surfaces a missing install", async () => {
  await assert.rejects(
    () =>
      fetchGithubToken({
        origin: "http://127.0.0.1:8787",
        credential: "ad_fixture",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: GITHUB_TOKEN_MISSING }), { status: 404 }),
      }),
    (err) => err.message === GITHUB_TOKEN_MISSING && err.status === 404,
  );
});

test("runGithubToken writes expiry and account, not the token", async () => {
  const lines = [];
  const result = await runGithubToken({
    env: { AUTODEVELOP_TOKEN: "ad_fixture", AUTODEVELOP_HOST: "http://127.0.0.1:8787" },
    fetchImpl: async () =>
      new Response(JSON.stringify({ token: "ghs_secret", expires_at: "2026-08-31T12:00:00Z", account: "acme" }), {
        status: 200,
      }),
    write: (text) => lines.push(text),
  });
  assert.equal(result.expiresAt, "2026-08-31T12:00:00Z");
  assert.equal(result.account, "acme");
  assert.equal(result.token, "ghs_secret");
  assert.equal(lines.join("").includes("ghs_secret"), false);
  assert.match(lines.join(""), /expires 2026-08-31T12:00:00Z \(acme\)/);
});

test("runGithubInit opens the install URL and reports when connected", async () => {
  const lines = [];
  const opened = [];
  let calls = 0;
  const result = await runGithubInit({
    env: { AUTODEVELOP_TOKEN: "ad_fixture", AUTODEVELOP_HOST: "http://127.0.0.1:8787" },
    noOpen: false,
    timeoutMs: 20,
    pollMs: 1,
    sleep: async () => {},
    now: () => {
      calls += 1;
      return calls * 5;
    },
    open: (url) => {
      opened.push(url);
      return true;
    },
    fetchImpl: async (url) => {
      const path = String(url);
      if (path.endsWith("/cli/github/install-url")) {
        return new Response(JSON.stringify({ url: "https://github.com/apps/autodevelop/installations/new", org_id: "org-1" }), {
          status: 200,
        });
      }
      if (path.endsWith("/cli/github") && calls > 2) {
        return new Response(JSON.stringify({ connected: true, account: "acme" }), { status: 200 });
      }
      return new Response(JSON.stringify({ connected: false }), { status: 200 });
    },
    write: (text) => lines.push(text),
  });
  assert.equal(result.connected, true);
  assert.equal(result.account, "acme");
  assert.equal(opened[0], "https://github.com/apps/autodevelop/installations/new");
  assert.equal(lines.join("").includes("ad_fixture"), false);
  assert.match(lines.join(""), /install the Autodevelop GitHub App/);
});

test("runGithubStatus tells the user to init when disconnected", async () => {
  const lines = [];
  const status = await runGithubStatus({
    env: { AUTODEVELOP_TOKEN: "ad_fixture", AUTODEVELOP_HOST: "http://127.0.0.1:8787" },
    fetchImpl: async () => new Response(JSON.stringify({ connected: false }), { status: 200 }),
    write: (text) => lines.push(text),
  });
  assert.equal(status.connected, false);
  assert.match(lines.join(""), /github init/);
});

test("runGithubStatus fetches the stored credentials host", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-gh-host-"));
  const credentialsPath = join(dir, "credentials.json");
  writeCredentialsFile(credentialsPath, {
    token: "ad_test_cli_github_host_fixture",
    host: "https://brain.devrecated.com",
  });
  const urls = [];
  await runGithubStatus({
    env: { AUTODEVELOP_TOKEN: "ad_fixture" },
    credentialsPath,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ connected: false }), { status: 200 });
    },
    write: () => {},
  });
  assert.equal(urls[0], "https://brain.devrecated.com/cli/github");
});
