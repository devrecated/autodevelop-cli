/**
 * Copyright (c) 2026 Devrecated
 *
 * Connect the Autodevelop GitHub App and mint a short-lived installation token.
 * Never print the token.
 */
import { BILLING_EXPIRED, GITHUB_TOKEN_MISSING } from "@devrecated/autodevelop-sdk/errors";
import { defaultCredentialsPath, readSubscriptionToken, resolveCredentialHost } from "./credentials.mjs";
import { joinHost } from "./host.mjs";
import { openBrowser } from "./login.mjs";

const requireCredential = (env, credentialsPath) => {
  const path = credentialsPath || defaultCredentialsPath(env);
  const credential = readSubscriptionToken(env, { credentialsPath: path });
  if (!credential) {
    throw new Error("Not signed in. Run pnpm autodevelop login.");
  }
  return { path, credential };
};

const parseGithubResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      response.status === 403
        ? BILLING_EXPIRED
        : (typeof data === "string" ? data : data.error) || GITHUB_TOKEN_MISSING;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
};

export const fetchCliGithub = async ({ origin, credential, path, fetchImpl = fetch } = {}) => {
  const response = await fetchImpl(joinHost(origin, path), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credential}`,
    },
  });
  return parseGithubResponse(response);
};

export const fetchGithubToken = ({ origin, credential, fetchImpl = fetch } = {}) =>
  fetchCliGithub({ origin, credential, path: "/cli/github/token", fetchImpl });

export const fetchGithubStatus = ({ origin, credential, fetchImpl = fetch } = {}) =>
  fetchCliGithub({ origin, credential, path: "/cli/github", fetchImpl });

export const fetchGithubInstallUrl = ({ origin, credential, fetchImpl = fetch } = {}) =>
  fetchCliGithub({ origin, credential, path: "/cli/github/install-url", fetchImpl });

export const runGithubStatus = async ({
  env = process.env,
  host,
  credentialsPath,
  fetchImpl = fetch,
  write = process.stdout.write.bind(process.stdout),
} = {}) => {
  const origin = resolveCredentialHost({ env, host, credentialsPath });
  const { credential } = requireCredential(env, credentialsPath);
  const status = await fetchGithubStatus({ origin, credential, fetchImpl });
  if (status.connected) {
    write(`GitHub App is connected (${status.account || "connected"}).\n`);
  } else {
    write("GitHub App is not connected. Run pnpm autodevelop github init.\n");
  }
  return status;
};

export const runGithubInit = async ({
  env = process.env,
  host,
  credentialsPath,
  noOpen = false,
  fetchImpl = fetch,
  open = openBrowser,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  timeoutMs = 120_000,
  pollMs = 3_000,
  write = process.stdout.write.bind(process.stdout),
} = {}) => {
  const origin = resolveCredentialHost({ env, host, credentialsPath });
  const { credential } = requireCredential(env, credentialsPath);
  const current = await fetchGithubStatus({ origin, credential, fetchImpl });
  if (current.connected) {
    write(`GitHub App is already connected (${current.account || "connected"}).\n`);
    return current;
  }
  const started = await fetchGithubInstallUrl({ origin, credential, fetchImpl });
  const href = String(started.url || "").trim();
  if (!href) {
    throw new Error("Host did not return a GitHub App install URL.");
  }
  write(`Open this page to install the Autodevelop GitHub App:\n${href}\n`);
  if (!noOpen) {
    const opened = open(href);
    if (!opened) write("Could not open a browser. Open the URL above.\n");
  }
  const deadline = now() + Number(timeoutMs);
  while (now() < deadline) {
    await sleep(pollMs);
    const status = await fetchGithubStatus({ origin, credential, fetchImpl });
    if (status.connected) {
      write(`GitHub App is connected (${status.account || "connected"}).\n`);
      return { ...status, url: href };
    }
  }
  write(
    "Install did not finish in this session. Approve it on GitHub, then run pnpm autodevelop github status.\n",
  );
  return { connected: false, url: href, org_id: started.org_id || "" };
};

export const runGithubToken = async ({
  env = process.env,
  host,
  credentialsPath,
  fetchImpl = fetch,
  write = process.stdout.write.bind(process.stdout),
} = {}) => {
  const origin = resolveCredentialHost({ env, host, credentialsPath });
  const { credential } = requireCredential(env, credentialsPath);
  const minted = await fetchGithubToken({ origin, credential, fetchImpl });
  const expires = minted.expires_at || "unknown";
  const account = minted.account || "connected";
  write(`GitHub App token expires ${expires} (${account}).\n`);
  write("Export GH_TOKEN from this process only. The CLI does not print the token.\n");
  return {
    expiresAt: expires,
    account,
    token: minted.token || "",
  };
};
