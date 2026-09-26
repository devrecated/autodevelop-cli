/**
 * Copyright (c) 2026 Devrecated
 *
 * Remote host → Cursor HTTP MCP url. Loopback host → stdio shim.
 */
export const isRemoteMcpHost = (origin) => {
  try {
    const host = new URL(String(origin || "")).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
  } catch {
    return false;
  }
};

export const hostMcpHttpUrl = (origin) => `${String(origin || "").replace(/\/$/, "")}/mcp`;
