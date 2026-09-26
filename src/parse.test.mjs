/**
 * Copyright (c) 2026 Devrecated
 */
import test from "node:test";
import assert from "node:assert/strict";
import { githubUsage, parseCli, usage } from "./parse.mjs";

test("parseCli reads login flags", () => {
  const opts = parseCli([
    "login",
    "--host",
    "http://127.0.0.1:8787",
    "--slug",
    "acme",
    "--profile",
    "sandbox",
    "--no-install",
    "--no-open",
  ]);
  assert.equal(opts.command, "login");
  assert.equal(opts.host, "http://127.0.0.1:8787");
  assert.equal(opts.slug, "acme");
  assert.equal(opts.profile, "sandbox");
  assert.equal(opts.noInstall, true);
  assert.equal(opts.noOpen, true);
});

test("parseCli defaults status and accepts install/logout/github token", () => {
  assert.equal(parseCli([]).command, "status");
  assert.equal(parseCli(["logout"]).command, "logout");
  assert.equal(parseCli(["install", "--slug", "acme"]).slug, "acme");
  assert.equal(parseCli(["github", "token"]).githubCommand, "token");
  assert.equal(parseCli(["github", "init", "--no-open"]).githubCommand, "init");
  assert.equal(parseCli(["github", "init", "--no-open"]).noOpen, true);
  assert.equal(parseCli(["github", "status"]).githubCommand, "status");
  assert.equal(parseCli(["mcp"]).command, "mcp");
  assert.equal(parseCli(["profiles"]).command, "profiles");
  assert.equal(parseCli(["profile"]).command, "profiles");
  assert.equal(parseCli(["login", "--list-profiles"]).listProfiles, true);
  assert.throws(() => parseCli(["login", "--profile", "../etc"]), /Invalid profile name/);
  assert.throws(() => parseCli(["explode"]), /Unknown command/);
  assert.throws(() => parseCli(["github"]), /Unknown github command/);
  assert.throws(() => parseCli(["github", "explode"]), /Unknown github command/);
  assert.throws(() => parseCli(["users", "list"]), /Unknown command/);
  assert.throws(() => parseCli(["sandbox"]), /Unknown command/);
  assert.throws(() => parseCli(["seed"]), /Unknown command/);
  assert.throws(() => parseCli(["pack-client"]), /Unknown command/);
  assert.throws(() => parseCli(["origins", "get"]), /Unknown command/);
});

test("usage lists customer commands only", () => {
  const text = usage();
  assert.match(text, /npx @devrecated\/autodevelop login/);
  assert.match(text, /--profile <name>/);
  assert.match(text, /npx @devrecated\/autodevelop profiles/);
  assert.match(text, /AUTODEVELOP_PROFILE/);
  assert.match(text, /npx @devrecated\/autodevelop github init/);
  assert.equal(text.includes("Employee"), false);
  assert.equal(text.includes("pnpm sandbox"), false);
  assert.equal(text.includes("pack-client"), false);
  assert.match(githubUsage(), /does not print the token/i);
  assert.match(githubUsage(), /github init/);
});
