/**
 * Copyright (c) 2026 Devrecated
 *
 * Stdio MCP that forwards JSON-RPC to the Autodevelop host. Reads the machine
 * credential. Never prints the token.
 */
import { createInterface } from "node:readline";
import { BILLING_EXPIRED } from "@devrecated/autodevelop-sdk/errors";
import { defaultCredentialsPath, readCredentialsFile, readSubscriptionToken } from "./credentials.mjs";
import { hostOrigin, joinHost, wrapHostFetchError } from "./host.mjs";

const rpcError = (id, message) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code: -32000, message },
});

export const postHostMcp = async ({
  origin,
  credential,
  message,
  fetchImpl = fetch,
} = {}) => {
  const token = String(credential || "").trim();
  const id = message && typeof message === "object" ? message.id : null;
  if (!token) {
    return rpcError(id, "Not signed in. Run npx autodevelop login.");
  }
  let response;
  try {
    response = await fetchImpl(joinHost(origin, "/mcp"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    throw wrapHostFetchError(error, origin);
  }
  const data = await response.json().catch(() => ({}));
  if (data && data.jsonrpc === "2.0") return data;
  if (response.status === 403) return rpcError(id, BILLING_EXPIRED);
  return rpcError(id, "Host MCP request failed.");
};

export const runMcpStdio = async ({
  env = process.env,
  host,
  credentialsPath,
  fetchImpl = fetch,
  stdin = process.stdin,
  stdout = process.stdout,
} = {}) => {
  const path = credentialsPath || defaultCredentialsPath(env);
  const stored = readCredentialsFile(path, { env });
  const origin = hostOrigin(env, host, stored?.host);
  const write = (payload) => {
    stdout.write(`${JSON.stringify(payload)}\n`);
  };
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (message.jsonrpc !== "2.0") continue;
    if (message.id === undefined || message.id === null) continue;
    const credential = readSubscriptionToken(env, { credentialsPath: path });
    const reply = await postHostMcp({ origin, credential, message, fetchImpl });
    write(reply);
  }
};
