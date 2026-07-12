import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";
import { findRelated } from "../graph/relevance.js";
import { queryWiki } from "../graph/query.js";

export async function findRelatedHandler(
  args: { noteId: string; maxResults?: number; maxNodes?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () =>
      findRelated(client, args.noteId, {
        maxResults: args.maxResults,
        maxNodes: args.maxNodes,
      }),
    (r) => JSON.stringify(r),
  );
}

export async function queryWikiHandler(
  args: { query: string; fastSearch?: boolean; maxPages?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => queryWiki(client, args.query, { fastSearch: args.fastSearch, maxPages: args.maxPages }),
    (r) => JSON.stringify(r),
  );
}

export function registerGraph(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "find_related",
    {
      description:
        "Rank notes related to a seed by 4-signal relevance over Trilium relations (directLink×3 + sourceOverlap×4 + Adamic-Adar×1.5 + typeAffinity×1). Core of QUERY graph expansion and a LINT orphan/bridge signal.",
      inputSchema: {
        noteId: z.string(),
        maxResults: z.number().int().positive().max(100).optional(),
        maxNodes: z.number().int().positive().max(500).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (a) => findRelatedHandler(a as Parameters<typeof findRelatedHandler>[0], client),
  );

  server.registerTool(
    "query_wiki",
    {
      description:
        "Retrieval pipeline for the LLM-wiki: search → graph expansion (find_related, 2-hop) → token-budget (60% wiki content / 20% overview / 10% source / 10% other) → assembly with numbered citation pages [1][2]. Returns short snippets + a citation hint; fetch full bodies only for pages you cite.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language or Trilium search expression"),
        fastSearch: z.boolean().optional(),
        maxPages: z.number().int().positive().max(30).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (a) => queryWikiHandler(a as Parameters<typeof queryWikiHandler>[0], client),
  );
}
