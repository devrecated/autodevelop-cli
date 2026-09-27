/**
 * Copyright (c) 2026 Devrecated
 *
 * Customer commands in the private @devrecated/autodevelop package.
 */
import { findRepoRoot, listInstanceNames } from "../../../.cursor/skills/autodevelop-internal/scripts/config-load.mjs";
import { readLocalPackVersion } from "./pack-safe.mjs";
import {
  clearProfile,
  defaultCredentialsPath,
  listProfileSummaries,
  readCredentialsFile,
  readCredentialsStore,
  resolveCredentialHost,
  resolveProfileName,
  setActiveProfile,
  tokenSource,
} from "./credentials.mjs";
import { runGithubInit, runGithubStatus, runGithubToken } from "./github.mjs";
import { inferSlug, fetchPackStatus, runInstall } from "./install.mjs";
import { runLogin } from "./login.mjs";
import { runMcpStdio } from "./mcp-host.mjs";
import { parseCli } from "./parse.mjs";
import { removeUserAutodevelopMcp, resolveCliBin, userMcpCustomerLines, writeUserMcp } from "./user-mcp.mjs";

export const CUSTOMER_COMMANDS = new Set([
  "login",
  "logout",
  "status",
  "install",
  "github",
  "mcp",
  "profiles",
]);

const writeLine = (text) => {
  process.stdout.write(`${text}\n`);
};

export const customerUsage = () =>
  [
    "Autodevelop CLI",
    "",
    "CLI for AutoDevelop (Devrecated). Learn more: https://devrecated.com",
    "and https://autodevelop.devrecated.com",
    "",
    "login downloads the kit and org policy pack from the host into this repo,",
    "and wires Cursor, Claude Code, and opencode MCP. Do not add a local Cursor plugin.",
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

export const runStatus = ({
  env = process.env,
  host,
  slug: requested,
  cwd = process.cwd(),
  credentialsPath,
  profile,
} = {}) => {
  const path = credentialsPath || defaultCredentialsPath(env);
  const stored = readCredentialsFile(path, { env, profile });
  const source = tokenSource(env, { credentialsPath: path, profile });
  const store = readCredentialsStore(path);
  let activeProfile = null;
  try {
    activeProfile = resolveProfileName({ env, profile, active: store.active });
  } catch {
    activeProfile = store.active || null;
  }
  let root = "";
  try {
    root = findRepoRoot(cwd);
  } catch {
    root = cwd;
  }
  const slug = inferSlug({ root, requested }) || listInstanceNames(root)[0] || "";
  const localVersion = slug ? readLocalPackVersion(root, slug) : "";
  return {
    signedIn: Boolean(source),
    source,
    profile: activeProfile,
    profiles: listProfileSummaries(path, { env }),
    credentialsPath: path,
    envTokenSet: Boolean(String(env.AUTODEVELOP_TOKEN || "").trim()),
    host: resolveCredentialHost({ env, host, credentialsPath: path, profile }),
    orgId: stored?.org_id || null,
    issuedAt: stored?.issued_at || null,
    slug: slug || null,
    localVersion: localVersion || null,
  };
};

export const runCustomerCommand = async (opts, env = process.env) => {
  if (!CUSTOMER_COMMANDS.has(opts.command)) return null;
  const credentialsPath = opts.credentials || defaultCredentialsPath(env);
  if (opts.command === "logout") {
    const cleared = clearProfile(credentialsPath, opts.profile, env);
    if (cleared.empty) {
      removeUserAutodevelopMcp({ env });
    }
    writeLine("Signed out on this machine. Environment variables are unchanged.");
    if (!cleared.empty && cleared.active) {
      writeLine(`Active profile: ${cleared.active}`);
    }
    return 0;
  }
  if (opts.command === "profiles" || (opts.command === "login" && opts.listProfiles)) {
    if (opts.command === "profiles" && opts.profile) {
      const name = setActiveProfile(credentialsPath, opts.profile);
      writeLine(`Active profile: ${name}`);
      return 0;
    }
    const rows = listProfileSummaries(credentialsPath, { env });
    if (opts.json) {
      writeLine(JSON.stringify({ profiles: rows }));
      return 0;
    }
    if (rows.length === 0) {
      writeLine("No stored profiles.");
      return 0;
    }
    for (const row of rows) {
      const mark = row.active ? " (active)" : "";
      const host = row.host ? ` ${row.host}` : "";
      const org = row.org_id ? ` org ${row.org_id}` : "";
      writeLine(`${row.name}${mark}${host}${org}`);
    }
    return 0;
  }
  if (opts.command === "status") {
    const status = runStatus({
      env,
      host: opts.host,
      slug: opts.slug,
      credentialsPath,
      profile: opts.profile,
    });
    if (opts.json) {
      writeLine(JSON.stringify(status));
      return 0;
    }
    writeLine(status.signedIn ? "Signed in." : "Not signed in.");
    if (status.profile) writeLine(`Profile: ${status.profile}`);
    writeLine(`Source: ${status.source || "none"}`);
    writeLine(`Host: ${status.host || "(unset)"}`);
    if (status.orgId) writeLine(`Organization: ${status.orgId}`);
    if (status.issuedAt) writeLine(`Issued: ${status.issuedAt}`);
    if (status.slug) writeLine(`Instance: ${status.slug}`);
    if (status.localVersion) writeLine(`Local policy pack: ${status.localVersion}`);
    writeLine(`Credentials file: ${status.credentialsPath}`);
    if (status.signedIn && status.localVersion) {
      try {
        const remote = await fetchPackStatus({
          origin: status.host,
          credential: env.AUTODEVELOP_TOKEN || readCredentialsFile(credentialsPath, { env, profile: opts.profile })?.token,
          slug: status.slug,
          localVersion: status.localVersion,
        });
        writeLine(`Hosted policy pack: ${remote.hostedVersion}`);
        if (remote.compatible === false) {
          writeLine("Hosted pack version differs. Ask before running install again.");
        }
      } catch {
        writeLine("Hosted pack version: unreachable");
      }
    }
    return 0;
  }
  if (opts.command === "login") {
    await runLogin({
      env,
      host: opts.host,
      credentialsPath,
      profile: opts.profile,
      noOpen: opts.noOpen,
    });
    if (!opts.noInstall) {
      await runInstall({ env, host: opts.host, slug: opts.slug, credentialsPath });
    } else {
      const user = writeUserMcp({
        env,
        credentialsPath,
        cliBin: resolveCliBin(process.cwd()),
        cwd: process.cwd(),
        host: opts.host,
      });
      for (const line of userMcpCustomerLines(user)) writeLine(line);
    }
    return 0;
  }
  if (opts.command === "install") {
    await runInstall({ env, host: opts.host, slug: opts.slug, credentialsPath });
    return 0;
  }
  if (opts.command === "mcp") {
    await runMcpStdio({ env, host: opts.host, credentialsPath });
    return 0;
  }
  if (opts.command === "github" && opts.githubCommand === "init") {
    const started = await runGithubInit({
      env,
      host: opts.host,
      credentialsPath,
      noOpen: opts.noOpen,
      write: opts.json ? () => {} : process.stdout.write.bind(process.stdout),
    });
    if (opts.json) {
      writeLine(
        JSON.stringify({
          connected: Boolean(started.connected),
          account: started.account || "",
          url: started.url || "",
        }),
      );
    }
    return 0;
  }
  if (opts.command === "github" && opts.githubCommand === "status") {
    const status = await runGithubStatus({
      env,
      host: opts.host,
      credentialsPath,
      write: opts.json ? () => {} : process.stdout.write.bind(process.stdout),
    });
    if (opts.json) {
      writeLine(
        JSON.stringify({
          connected: Boolean(status.connected),
          account: status.account || "",
        }),
      );
    }
    return 0;
  }
  if (opts.command === "github" && opts.githubCommand === "token") {
    const minted = await runGithubToken({
      env,
      host: opts.host,
      credentialsPath,
      write: opts.json ? () => {} : process.stdout.write.bind(process.stdout),
    });
    if (opts.json) {
      writeLine(JSON.stringify({ expires_at: minted.expiresAt, account: minted.account }));
    }
    return 0;
  }
  return null;
};

export const customerMain = async (argv = process.argv.slice(2), env = process.env) => {
  let opts;
  try {
    opts = parseCli(argv);
  } catch (error) {
    if (error?.code === "usage") {
      const cmd = String(argv[0] || "").trim();
      if (cmd === "profile") {
        writeLine(error.message);
        return 1;
      }
      if (cmd && cmd !== "help" && !CUSTOMER_COMMANDS.has(cmd)) {
        writeLine("This command is not in the customer package. Use the Autodevelop checkout.");
        return 1;
      }
      writeLine(error.message);
      return 1;
    }
    throw error;
  }
  if (opts.help) {
    writeLine(customerUsage().trimEnd());
    return 0;
  }
  if (!CUSTOMER_COMMANDS.has(opts.command)) {
    writeLine("This command is not in the customer package. Use the Autodevelop checkout.");
    return 1;
  }
  const code = await runCustomerCommand(opts, env);
  if (code === null) {
    writeLine(customerUsage().trimEnd());
    return 0;
  }
  return code;
};
