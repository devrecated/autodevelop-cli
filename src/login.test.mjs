/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCredentialsFile, readCredentialsStore } from "./credentials.mjs";
import { DEVICE_GRANT_TYPE, pollDeviceToken, requestDeviceCode, runLogin } from "./login.mjs";

const FIXTURE = "ad_test_cli_login_fixture";

test("pollDeviceToken honors pending, slow_down, then stores nothing itself", async () => {
  let calls = 0;
  const fetches = [];
  const result = await pollDeviceToken({
    origin: "http://host.test",
    deviceCode: "device-fixture",
    interval: 1,
    expiresIn: 30,
    sleep: async () => {},
    now: () => {
      calls += 1;
      return calls * 10;
    },
    fetchImpl: async (url, init) => {
      fetches.push({ url, body: JSON.parse(init.body) });
      if (fetches.length === 1) {
        return new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 });
      }
      if (fetches.length === 2) {
        return new Response(JSON.stringify({ error: "slow_down" }), { status: 400 });
      }
      return new Response(JSON.stringify({ access_token: FIXTURE, token_type: "Bearer" }), { status: 200 });
    },
  });
  assert.equal(result.credential, FIXTURE);
  assert.equal(fetches[0].body.grant_type, DEVICE_GRANT_TYPE);
  assert.equal(JSON.stringify(fetches[0]).includes(FIXTURE), false);
});

test("runLogin writes credentials and does not print the value", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-login-"));
  const path = join(dir, "credentials.json");
  const printed = [];
  await runLogin({
    env: { AUTODEVELOP_HOST: "http://host.test" },
    credentialsPath: path,
    noOpen: true,
    sleep: async () => {},
    write: (text) => printed.push(text),
    fetchImpl: async (url) => {
      if (String(url).endsWith("/oauth/device/code")) {
        return new Response(
          JSON.stringify({
            device_code: "device-fixture",
            user_code: "WXYZ-BCDF",
            verification_uri: "http://127.0.0.1:5176",
            verification_uri_complete: "http://127.0.0.1:5176/?user_code=WXYZ-BCDF",
            expires_in: 600,
            interval: 1,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ access_token: FIXTURE, token_type: "Bearer" }), { status: 200 });
    },
  });
  const out = printed.join("");
  assert.match(out, /WXYZ-BCDF/);
  assert.equal(out.includes(FIXTURE), false);
  assert.equal(readCredentialsFile(path).token, FIXTURE);
  assert.equal(readCredentialsStore(path).active, "default");
});

test("runLogin --profile writes that profile and makes it active", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-login-profile-"));
  const path = join(dir, "credentials.json");
  const printed = [];
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/oauth/device/code")) {
      return new Response(
        JSON.stringify({
          device_code: "device-fixture",
          user_code: "WXYZ-BCDF",
          verification_uri: "http://127.0.0.1:5176",
          verification_uri_complete: "http://127.0.0.1:5176/?user_code=WXYZ-BCDF",
          expires_in: 600,
          interval: 1,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ access_token: FIXTURE, token_type: "Bearer" }), { status: 200 });
  };
  await runLogin({
    env: { AUTODEVELOP_HOST: "http://host.test" },
    credentialsPath: path,
    profile: "sandbox",
    noOpen: true,
    sleep: async () => {},
    write: (text) => printed.push(text),
    fetchImpl,
  });
  assert.equal(readCredentialsStore(path).active, "sandbox");
  assert.equal(readCredentialsFile(path).token, FIXTURE);
  assert.equal(readCredentialsFile(path, { profile: "sandbox" }).host, "http://host.test");
  assert.equal(printed.join("").includes(FIXTURE), false);
});

test("requestDeviceCode explains when the host is down", async () => {
  await assert.rejects(
    requestDeviceCode({
      origin: "http://127.0.0.1:8787",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    }),
    /Host is not reachable at http:\/\/127.0.0.1:8787\. Start it with pnpm dev\./,
  );
});
