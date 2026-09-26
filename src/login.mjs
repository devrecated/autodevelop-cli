/**
 * Copyright (c) 2026 Devrecated
 *
 * RFC 8628 device login. Never prints the credential value.
 */
import { hostname } from "node:os";
import { spawn } from "node:child_process";
import { joinHost, wrapHostFetchError } from "./host.mjs";
import { defaultCredentialsPath, resolveCredentialHost, writeCredentialsFile } from "./credentials.mjs";

export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export const openBrowser = (url, spawnImpl = spawn) => {
  const href = String(url || "").trim();
  if (!href) return false;
  try {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", href] : [href];
    const child = spawnImpl(cmd, args, { detached: true, stdio: "ignore" });
    child.unref?.();
    return true;
  } catch {
    return false;
  }
};

const parseJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { error: text || `HTTP ${response.status}` };
  }
};

export const requestDeviceCode = async ({ origin, deviceName, fetchImpl = fetch } = {}) => {
  let response;
  try {
    response = await fetchImpl(joinHost(origin, "/oauth/device/code"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ device_name: deviceName || hostname() }),
    });
  } catch (error) {
    throw wrapHostFetchError(error, origin);
  }
  const data = await parseJson(response);
  if (!response.ok) {
    const err = new Error(data.error || "Could not start device sign-in.");
    err.status = response.status;
    throw err;
  }
  return data;
};

const readIssuedCredential = (data) => {
  const value = data && typeof data === "object" ? data.access_token : "";
  return String(value || "").trim();
};

export const pollDeviceToken = async ({
  origin,
  deviceCode,
  interval = 5,
  expiresIn = 600,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) => {
  const deadline = now() + Number(expiresIn) * 1000;
  let wait = Math.max(1, Number(interval) || 5);
  while (now() < deadline) {
    await sleep(wait * 1000);
    let response;
    try {
      response = await fetchImpl(joinHost(origin, "/oauth/token"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: DEVICE_GRANT_TYPE, device_code: deviceCode }),
      });
    } catch (error) {
      throw wrapHostFetchError(error, origin);
    }
    const data = await parseJson(response);
    const issued = readIssuedCredential(data);
    if (response.ok && issued) {
      return { credential: issued, tokenType: data.token_type || "Bearer" };
    }
    const error = data.error || "";
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      wait += 5;
      continue;
    }
    if (error === "access_denied") {
      throw new Error("This machine was not authorized.");
    }
    if (error === "expired_token") {
      throw new Error("The sign-in code expired. Run login again.");
    }
    throw new Error(error || "Sign-in did not complete.");
  }
  throw new Error("The sign-in code expired. Run login again.");
};

export const runLogin = async ({
  env = process.env,
  host,
  credentialsPath,
  profile,
  noOpen = false,
  fetchImpl = fetch,
  sleep,
  open = openBrowser,
  write = process.stdout.write.bind(process.stdout),
} = {}) => {
  const path = credentialsPath || defaultCredentialsPath(env);
  const origin = resolveCredentialHost({ env, host, credentialsPath: path, profile });
  const started = await requestDeviceCode({ origin, fetchImpl });
  write(`Open this page to authorize this machine:\n${started.verification_uri_complete}\n`);
  write(`Or visit ${started.verification_uri} and enter ${started.user_code}\n`);
  if (!noOpen) {
    const opened = open(started.verification_uri_complete);
    if (!opened) write("Could not open a browser. Open the URL above.\n");
  }
  const issued = await pollDeviceToken({
    origin,
    deviceCode: started.device_code,
    interval: started.interval,
    expiresIn: started.expires_in,
    fetchImpl,
    sleep,
  });
  writeCredentialsFile(
    path,
    {
      token: issued.credential,
      issuedAt: new Date().toISOString(),
      host: origin,
      profile,
    },
    env,
  );
  write("Signed in. Credentials stored on this machine.\n");
  return { path, origin, stored: true };
};
