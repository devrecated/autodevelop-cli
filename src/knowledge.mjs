/**
 * Copyright (c) 2026 Devrecated.
 *
 * Archive tickets and recaps through the host API. Does not write the database.
 */
import { execFileSync } from "node:child_process";

export const readOriginUrl = (cwd = process.cwd()) => {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

export const knowledgeRequest = ({ action, nodeId = "", orgId = "", repoUrl = "" }) => {
  const query = new URLSearchParams();
  if (orgId) query.set("org_id", orgId);
  if (repoUrl) query.set("repo_url", repoUrl);
  const suffix = query.toString() ? `?${query}` : "";
  if (action === "archived") return { method: "GET", path: `/admin/knowledge/archive${suffix}` };
  return {
    method: "POST",
    path: `/admin/knowledge/nodes/${encodeURIComponent(nodeId)}/${action}${suffix}`,
  };
};

export const runKnowledge = async ({
  action,
  nodeId = "",
  orgId = "",
  repoUrl = "",
  origin,
  token,
  fetchImpl = fetch,
}) => {
  if ((action === "archive" || action === "restore") && !nodeId) {
    throw new Error("Pass --node <id>.");
  }
  const request = knowledgeRequest({ action, nodeId, orgId, repoUrl });
  const response = await fetchImpl(`${String(origin).replace(/\/$/, "")}${request.path}`, {
    method: request.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(request.method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: request.method === "POST" ? "{}" : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
