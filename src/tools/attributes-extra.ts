import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function getAttributeHandler(args: { attributeId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getAttribute(args.attributeId), (a) => JSON.stringify(a));
}
export async function updateAttributeHandler(
  args: { attributeId: string; value?: string; position?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  const { attributeId, ...patch } = args;
  return asToolResult(() => client.updateAttribute(attributeId, patch), (a) => JSON.stringify(a));
}

export function registerAttributesExtra(server: McpServer, client: EtapiClient): void {
  server.registerTool("get_attribute", { description: "Get a single attribute by id.", inputSchema: { attributeId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getAttributeHandler(a as { attributeId: string }, client));
  server.registerTool("update_attribute", { description: "Update an attribute (label: value/position; relation: position).", inputSchema: { attributeId: z.string(), value: z.string().optional(), position: z.number().int().optional() } }, (a) => updateAttributeHandler(a as Parameters<typeof updateAttributeHandler>[0], client));
}
