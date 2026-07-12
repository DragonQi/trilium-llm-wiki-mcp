import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function getAttributesHandler(
  args: { noteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getNoteAttributes(args.noteId), (attrs) => JSON.stringify(attrs));
}
export async function setAttributeHandler(
  args: { noteId: string; type: "label" | "relation"; name: string; value?: string; isInheritable?: boolean },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () =>
      client.upsertAttribute({
        noteId: args.noteId,
        type: args.type,
        name: args.name,
        value: args.value,
        isInheritable: args.isInheritable,
      }),
    (a) => JSON.stringify(a),
  );
}
export async function deleteAttributeHandler(
  args: { attributeId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.deleteAttribute(args.attributeId), () =>
    `Deleted attribute ${args.attributeId}`,
  );
}

export function registerAttributes(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "get_attributes",
    {
      description: "List a note's labels and relations (incl. inherited).",
      inputSchema: { noteId: z.string() },
      annotations: { readOnlyHint: true },
    },
    (a) => getAttributesHandler(a as { noteId: string }, client),
  );
  server.registerTool(
    "set_attribute",
    {
      description: "Upsert a label or relation on a note. For relations, value is the target note id.",
      inputSchema: {
        noteId: z.string(),
        type: z.enum(["label", "relation"]),
        name: z.string().regex(/^[^\s]+$/, "no whitespace").describe("Attribute name (no spaces)"),
        value: z.string().optional().describe("Value (target noteId for relations)"),
        isInheritable: z.boolean().optional(),
      },
    },
    (a) => setAttributeHandler(a as Parameters<typeof setAttributeHandler>[0], client),
  );
  server.registerTool(
    "delete_attribute",
    {
      description: "Delete an attribute by id (idempotent).",
      inputSchema: { attributeId: z.string() },
    },
    (a) => deleteAttributeHandler(a as { attributeId: string }, client),
  );
}
