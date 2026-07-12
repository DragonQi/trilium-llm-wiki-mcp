import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function upsertNoteHandler(
  args: { parentNoteId: string; title: string; type: "text" | "code" | "file" | "image" | "search" | "book" | "relationMap" | "render"; content: string; mime?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.upsertNote(args), (r) => JSON.stringify(r));
}
export async function getBacklinksHandler(
  args: { noteId: string; relations?: string[] },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getBacklinks(args.noteId, args.relations), (notes) => JSON.stringify(notes));
}
export async function findOrphansHandler(args: { rootNoteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.findOrphans(args.rootNoteId), (notes) => JSON.stringify(notes));
}
export async function searchByAttributeHandler(args: { query: string; limit?: number }, client: EtapiClient): Promise<CallToolResult> {
  // 'query' is a Trilium attribute expression, e.g. '#status=weak' or '~author.noteId=abc'.
  return asToolResult(() => client.searchNotes({ search: args.query, limit: args.limit ?? 20 }), (notes) => JSON.stringify(notes));
}
export async function replaceNoteSectionHandler(
  args: { noteId: string; heading: string; newInnerHtml: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.replaceNoteSection(args.noteId, args.heading, args.newInnerHtml), () =>
    `Replaced section "${args.heading}" in ${args.noteId}`,
  );
}
export async function bulkSetAttributesHandler(
  args: { search: string; type: "label" | "relation"; name: string; value?: string; isInheritable?: boolean },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.bulkSetAttributes(args.search, { type: args.type, name: args.name, value: args.value, isInheritable: args.isInheritable }),
    (r) => JSON.stringify(r),
  );
}

export function registerComposite(server: McpServer, client: EtapiClient): void {
  server.registerTool("upsert_note", { description: "Find a note by exact title and update it, or create it under parentNoteId. Anti-duplicate core of ingest.", inputSchema: { parentNoteId: z.string(), title: z.string(), type: z.enum(["text", "code", "file", "image", "search", "book", "relationMap", "render"]), content: z.string(), mime: z.string().optional() } }, (a) => upsertNoteHandler(a as Parameters<typeof upsertNoteHandler>[0], client));
  server.registerTool("get_backlinks", { description: "Find notes whose relations point TO a note. Backs the backlinks graph signal; enumerates relation names (default: derivedFrom, relatesTo, mentions, about, partOf).", inputSchema: { noteId: z.string(), relations: z.array(z.string()).optional() }, annotations: { readOnlyHint: true } }, (a) => getBacklinksHandler(a as Parameters<typeof getBacklinksHandler>[0], client));
  server.registerTool("find_orphans", { description: "Find notes in a subtree with zero incoming relations (orphan candidates).", inputSchema: { rootNoteId: z.string() }, annotations: { readOnlyHint: true } }, (a) => findOrphansHandler(a as { rootNoteId: string }, client));
  server.registerTool("search_by_attribute", { description: "Search notes by a Trilium attribute expression (e.g. '#status=weak', '~author.noteId=abc').", inputSchema: { query: z.string().min(1), limit: z.number().int().positive().max(500).optional() }, annotations: { readOnlyHint: true } }, (a) => searchByAttributeHandler(a as Parameters<typeof searchByAttributeHandler>[0], client));
  server.registerTool("replace_note_section", { description: "Replace the body under a heading (<hN>heading</hN>) with new HTML. Appends the section if absent. Avoids read-then-write of the whole note.", inputSchema: { noteId: z.string(), heading: z.string(), newInnerHtml: z.string() } }, (a) => replaceNoteSectionHandler(a as Parameters<typeof replaceNoteSectionHandler>[0], client));
  server.registerTool("bulk_set_attributes", { description: "Upsert a label/relation onto every note matched by a search expression.", inputSchema: { search: z.string(), type: z.enum(["label", "relation"]), name: z.string().regex(/^[^\s]+$/), value: z.string().optional(), isInheritable: z.boolean().optional() } }, (a) => bulkSetAttributesHandler(a as Parameters<typeof bulkSetAttributesHandler>[0], client));
}
