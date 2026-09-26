/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { postHostMcp } from "./mcp-host.mjs";

test("postHostMcp forwards JSON-RPC and does not echo the credential", async () => {
  const calls = [];
  const reply = await postHostMcp({
    origin: "http://127.0.0.1:8787",
    credential: "ad_secret_fixture",
    message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    fetchImpl: async (url, init) => {
      calls.push({ url, auth: Boolean(init.headers.Authorization), body: init.body });
      return {
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: { tools: [] } }),
      };
    },
  });
  assert.equal(reply.result.tools.length, 0);
  assert.equal(calls[0].url.endsWith("/mcp"), true);
  assert.equal(calls[0].auth, true);
  assert.equal(JSON.stringify(reply).includes("ad_secret_fixture"), false);
});

test("postHostMcp refuses when no credential is stored", async () => {
  const reply = await postHostMcp({
    origin: "http://127.0.0.1:8787",
    credential: "",
    message: { jsonrpc: "2.0", id: 2, method: "initialize" },
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.match(reply.error.message, /npx autodevelop login/);
});
