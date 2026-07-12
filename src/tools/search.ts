import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function searchNotesHandler(
  args: {
    query: string;
    limit?: number;
    fastSearch?: boolean;
    orderBy?: string;
    orderDirection?: "asc" | "desc";
    ancestorNoteId?: string;
  },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () =>
      client.searchNotes({
        search: args.query,
        limit: args.limit ?? 20,
        fastSearch: args.fastSearch,
        orderBy: args.orderBy,
        orderDirection: args.orderDirection,
        ancestorNoteId: args.ancestorNoteId,
      }),
    (notes) => JSON.stringify(notes),
  );
}

export function registerSearch(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "search_notes",
    {
      description:
        "Full-text search across Trilium notes (Trilium search syntax). Bare words are fulltext; use #label, #label=value, ~relation=target for structured filters. Returns note metadata (no bodies).",
      inputSchema: {
        query: z.string().min(1).describe("Trilium search expression"),
        limit: z.number().int().positive().max(500).optional().describe("Max results (default 20)"),
        fastSearch: z.boolean().optional().describe("Skip searching note content"),
        ancestorNoteId: z.string().optional().describe("Restrict to a subtree"),
        orderBy: z.string().optional().describe("Property or #labelName to order by"),
        orderDirection: z.enum(["asc", "desc"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => searchNotesHandler(args as Parameters<typeof searchNotesHandler>[0], client),
  );
}
