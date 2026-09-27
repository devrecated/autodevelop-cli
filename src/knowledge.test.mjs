/**
 * Copyright (c) 2026 Devrecated.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { knowledgeRequest, runKnowledge } from "./knowledge.mjs";

test("knowledge archive calls the host endpoint and does not write a database", async () => {
  const seen = [];
  const request = knowledgeRequest({ action: "archive", nodeId: "node-1", orgId: "org-1", repoUrl: "https://github.com/acme/portal" });
  assert.equal(request.method, "POST");
  assert.match(request.path, /^\/admin\/knowledge\/nodes\/node-1\/archive\?/);
  const data = await runKnowledge({
    action: "restore",
    nodeId: "node-1",
    orgId: "org-1",
    origin: "http://host.test",
    token: "ad_test",
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), method: init.method });
      return { ok: true, json: async () => ({ node: { label: "Ticket", archived_at: null } }) };
    },
  });
  assert.equal(seen[0].method, "POST");
  assert.match(seen[0].url, /\/admin\/knowledge\/nodes\/node-1\/restore/);
  assert.equal(data.node.label, "Ticket");
});
