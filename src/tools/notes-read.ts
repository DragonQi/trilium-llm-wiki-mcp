import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

const noteId = z.string().min(1).describe("Trilium note id");

export async function getNoteHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getNote(args.noteId), (n) => JSON.stringify(n));
}
export async function getNoteContentHandler(
  args: { noteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getNoteContent(args.noteId), (text) => text);
}
export async function getNoteTreeHandler(
  args: { noteId: string; limit?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getNoteTree(args.noteId, { limit: args.limit }), (kids) =>
    JSON.stringify(kids),
  );
}
export async function getNoteSubtreeHandler(
  args: { noteId: string; maxNodes?: number; maxPerNode?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.getNoteSubtree(args.noteId, { maxNodes: args.maxNodes, maxPerNode: args.maxPerNode }),
    (t) => JSON.stringify(t),
  );
}
export async function getNotePathHandler(
  args: { noteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() =>
    client.getNotePath(args.noteId).then((path) => path.map((n) => ({ noteId: n.noteId, title: n.title }))),
    (path) => JSON.stringify(path),
  );
}
export async function getAppInfoHandler(
  _args: Record<string, never>,
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getAppInfo(), (info) => JSON.stringify(info));
}

export function registerRead(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "get_note",
    {
      description: "Get a single note's metadata (incl. attributes, parent/child ids).",
      inputSchema: { noteId },
      annotations: { readOnlyHint: true },
    },
    (a) => getNoteHandler(a as { noteId: string }, client),
  );
  server.registerTool(
    "get_note_content",
    {
      description: "Get the raw body of a note (HTML for text notes, source for code).",
      inputSchema: { noteId },
      annotations: { readOnlyHint: true },
    },
    (a) => getNoteContentHandler(a as { noteId: string }, client),
  );
  server.registerTool(
    "get_note_tree",
    {
      description: "List direct children of a note (metadata only).",
      inputSchema: { noteId, limit: z.number().int().positive().max(500).optional() },
      annotations: { readOnlyHint: true },
    },
    (a) => getNoteTreeHandler(a as { noteId: string; limit?: number }, client),
  );
  server.registerTool(
    "get_note_subtree",
    {
      description: "Recursively get a note's subtree as a tree (capped).",
      inputSchema: {
        noteId,
        maxNodes: z.number().int().positive().max(1000).optional(),
        maxPerNode: z.number().int().positive().max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (a) =>
      getNoteSubtreeHandler(a as { noteId: string; maxNodes?: number; maxPerNode?: number }, client),
  );
  server.registerTool(
    "get_note_path",
    {
      description: "Get the ancestor chain from a note up to root.",
      inputSchema: { noteId },
      annotations: { readOnlyHint: true },
    },
    (a) => getNotePathHandler(a as { noteId: string }, client),
  );
  server.registerTool(
    "get_app_info",
    {
      description: "Get Trilium instance app info (version; liveness/credential check).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    (a) => getAppInfoHandler(a as Record<string, never>, client),
  );
}
