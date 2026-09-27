/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HOST, hostOrigin, hostUnreachableMessage, isHostUnreachable, wrapHostFetchError } from "./host.mjs";

test("hostOrigin prefers the stored login host after env", () => {
  assert.equal(hostOrigin({}, "", "http://127.0.0.1:8787/"), "http://127.0.0.1:8787");
  assert.equal(hostOrigin({ AUTODEVELOP_HOST: "http://example.test" }, "", "http://127.0.0.1:8787"), "http://example.test");
});

test("wrapHostFetchError replaces bare fetch failed", () => {
  const origin = "http://127.0.0.1:8787";
  const wrapped = wrapHostFetchError(new TypeError("fetch failed"), origin);
  assert.equal(wrapped.message, hostUnreachableMessage(origin));
  assert.equal(isHostUnreachable(new TypeError("fetch failed")), true);
  assert.equal(isHostUnreachable(Object.assign(new Error("nope"), { code: "ECONNREFUSED" })), true);
  assert.equal(isHostUnreachable(new Error("Could not start device sign-in.")), false);
  assert.equal(hostUnreachableMessage(""), "Autodevelop is not reachable. Check your network and try again.");
  assert.equal(hostUnreachableMessage("").includes(DEFAULT_HOST), false);
});
