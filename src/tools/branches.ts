import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function cloneNoteHandler(
  args: { noteId: string; parentNoteId: string; prefix?: string; notePosition?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.createBranch({ noteId: args.noteId, parentNoteId: args.parentNoteId, prefix: args.prefix, notePosition: args.notePosition }),
    (b) => JSON.stringify(b),
  );
}
export async function getBranchHandler(args: { branchId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getBranch(args.branchId), (b) => JSON.stringify(b));
}
export async function updateBranchHandler(
  args: { branchId: string; notePosition?: number; prefix?: string; isExpanded?: boolean },
  client: EtapiClient,
): Promise<CallToolResult> {
  const { branchId, ...patch } = args;
  return asToolResult(() => client.updateBranch(branchId, patch), (b) => JSON.stringify(b));
}
export async function deleteBranchHandler(args: { branchId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.deleteBranch(args.branchId), () => `Deleted branch ${args.branchId}`);
}
export async function refreshNoteOrderingHandler(
  args: { parentNoteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.refreshNoteOrdering(args.parentNoteId), () => `Refreshed ordering under ${args.parentNoteId}`);
}

export function registerBranches(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "clone_note",
    {
      description: "Clone a note under another parent (creates a new branch; original stays).",
      inputSchema: {
        noteId: z.string(),
        parentNoteId: z.string(),
        prefix: z.string().optional(),
        notePosition: z.number().int().optional(),
      },
    },
    (a) => cloneNoteHandler(a as Parameters<typeof cloneNoteHandler>[0], client),
  );
  server.registerTool("get_branch", { description: "Get a branch placement by id.", inputSchema: { branchId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getBranchHandler(a as { branchId: string }, client));
  server.registerTool("update_branch", { description: "Update a branch (notePosition/prefix/isExpanded).", inputSchema: { branchId: z.string(), notePosition: z.number().int().optional(), prefix: z.string().optional(), isExpanded: z.boolean().optional() } }, (a) => updateBranchHandler(a as Parameters<typeof updateBranchHandler>[0], client));
  server.registerTool("delete_branch", { description: "Delete a branch placement (idempotent). Deleting the last branch deletes the note.", inputSchema: { branchId: z.string() } }, (a) => deleteBranchHandler(a as { branchId: string }, client));
  server.registerTool("refresh_note_ordering", { description: "Push updated child positions to connected clients.", inputSchema: { parentNoteId: z.string() } }, (a) => refreshNoteOrderingHandler(a as { parentNoteId: string }, client));
}
