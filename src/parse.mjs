/**
 * Copyright (c) 2026 Devrecated
 *
 * Customer CLI argument parsing. Employee commands live in scripts/cli/parse.mjs.
 */
import { argValue, hasFlag, parseArgs } from "../../../.cursor/skills/autodevelop-internal/scripts/lib.mjs";
import { assertProfileName } from "./credentials.mjs";

export const COMMANDS = [
  "login",
  "logout",
  "status",
  "install",
  "github",
  "mcp",
  "profiles",
  "profile",
];
export const GITHUB_COMMANDS = ["init", "status", "token"];

const commandList = "login, logout, status, install, github, mcp, or profiles";

export const parseCli = (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  let command = String(args.positional[0] || "").trim();
  if (command === "profile") command = "profiles";
  const profileRaw = argValue(args, "profile", "");
  if (profileRaw) assertProfileName(profileRaw);
  if (command && !COMMANDS.includes(command)) {
    const err = new Error(`Unknown command: ${command}. Use ${commandList}.`);
    err.code = "usage";
    throw err;
  }
  const githubCommand = command === "github" ? String(args.positional[1] || "").trim() : "";
  if (command === "github" && (!githubCommand || !GITHUB_COMMANDS.includes(githubCommand))) {
    const err = new Error("Unknown github command. Use init, status, or token.");
    err.code = "usage";
    throw err;
  }
  return {
    ...args,
    command: command || "status",
    githubCommand,
    host: argValue(args, "host", ""),
    slug: argValue(args, "slug", ""),
    profile: profileRaw,
    listProfiles: hasFlag(args, "list-profiles"),
    credentials: argValue(args, "credentials", ""),
    noInstall: hasFlag(args, "no-install"),
    noOpen: hasFlag(args, "no-open"),
    json: hasFlag(args, "json"),
    help: hasFlag(args, "help") || command === "help",
    args,
  };
};

export const githubUsage = () =>
  [
    "Autodevelop CLI — GitHub App",
    "",
    "  npx @devrecated/autodevelop github init [--no-open]",
    "  npx @devrecated/autodevelop github status",
    "  npx @devrecated/autodevelop github token",
    "",
    "init opens the Autodevelop GitHub App install page for this organization.",
    "status reports whether the host has recorded that install.",
    "token mints a one-hour installation token. Prints expires_at and the",
    "installation account. Does not print the token.",
    "A lapsed org stops with Your billing has expired.",
    "",
  ].join("\n");

export const usageFor = (command) => {
  if (command === "github") return githubUsage();
  return usage();
};

export const usage = () =>
  [
    "Autodevelop CLI",
    "",
    "  npx @devrecated/autodevelop login [--slug <instance>] [--profile <name>] [--no-install] [--no-open]",
    "  npx @devrecated/autodevelop logout [--profile <name>]",
    "  npx @devrecated/autodevelop status",
    "  npx @devrecated/autodevelop profiles",
    "  npx @devrecated/autodevelop install [--slug <instance>]",
    "  npx @devrecated/autodevelop github init",
    "  npx @devrecated/autodevelop github status",
    "  npx @devrecated/autodevelop github token",
    "",
    "Sign-in uses https://brain.devrecated.com.",
    "AUTODEVELOP_TOKEN wins over the credentials file when set.",
    "AUTODEVELOP_PROFILE selects a stored login for one process.",
    "",
  ].join("\n");
