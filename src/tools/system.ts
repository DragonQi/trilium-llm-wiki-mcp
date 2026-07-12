import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function loginHandler(args: { password: string; tokenName?: string }, _client: EtapiClient): Promise<CallToolResult> {
  // login is unauthenticated; call ETAPI directly rather than via the (token-bound) client.
  const url = process.env.TRILIUM_URL?.replace(/\/+$/, "") ?? "http://localhost:8080";
  return asToolResult(
    async () => {
      const res = await fetch(`${url}/etapi/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: args.password, tokenName: args.tokenName ?? "etapi" }),
      });
      if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
      return (await res.json()) as { authToken: string };
    },
    (r) => JSON.stringify(r),
  );
}
export async function logoutHandler(_args: Record<string, never>, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.logout(), () => "Logged out (token revoked)");
}
export async function createBackupHandler(args: { name: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.createBackup(args.name), () => `Created backup ${args.name}`);
}
export async function getMetricsHandler(args: { format?: "prometheus" | "json" }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getMetrics(args.format ?? "json"), (text) => text);
}

export function registerSystem(server: McpServer, client: EtapiClient): void {
  server.registerTool("login", { description: "Exchange a Trilium password for an ETAPI token (unauthenticated endpoint).", inputSchema: { password: z.string(), tokenName: z.string().optional() } }, (a) => loginHandler(a as Parameters<typeof loginHandler>[0], client));
  server.registerTool("logout", { description: "Revoke the current ETAPI token.", inputSchema: {} }, (a) => logoutHandler(a as Record<string, never>, client));
  server.registerTool("create_backup", { description: "Trigger a DB backup (name: [a-zA-Z0-9_]{1,32}).", inputSchema: { name: z.string().regex(/^[a-zA-Z0-9_]{1,32}$/) } }, (a) => createBackupHandler(a as { name: string }, client));
  server.registerTool("get_metrics", { description: "Instance metrics (format: json default | prometheus).", inputSchema: { format: z.enum(["prometheus", "json"]).optional() }, annotations: { readOnlyHint: true } }, (a) => getMetricsHandler(a as { format?: "prometheus" | "json" }, client));
}
