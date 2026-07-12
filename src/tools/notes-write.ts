import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function createNoteHandler(
  args: {
    parentNoteId: string;
    title: string;
    type: "text" | "code" | "file" | "image" | "search" | "book" | "relationMap" | "render";
    content: string;
    mime?: string;
    notePosition?: number;
    prefix?: string;
  },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.createNote(args), (r) => JSON.stringify(r));
}
export async function updateNoteHandler(
  args: { noteId: string; title?: string; type?: string; mime?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  const { noteId, ...patch } = args;
  return asToolResult(
    () => client.updateNote(noteId, patch as Parameters<typeof client.updateNote>[1]),
    (n) => JSON.stringify(n),
  );
}
export async function updateNoteContentHandler(
  args: { noteId: string; content: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.updateNoteContent(args.noteId, args.content), () =>
    `Updated content of ${args.noteId}`,
  );
}
export async function appendToNoteHandler(
  args: { noteId: string; fragment: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.appendToNote(args.noteId, args.fragment), () =>
    `Appended to ${args.noteId}`,
  );
}
export async function deleteNoteHandler(
  args: { noteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.deleteNote(args.noteId), () => `Deleted ${args.noteId}`);
}
export async function moveNoteHandler(
  args: { noteId: string; toParentNoteId: string; notePosition?: number; prefix?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () =>
      client.moveNote(args.noteId, args.toParentNoteId, {
        notePosition: args.notePosition,
        prefix: args.prefix,
      }),
    (b) => JSON.stringify(b),
  );
}

export function registerWrite(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "create_note",
    {
      description: "Create a new note under a parent. Returns {note, branch}.",
      inputSchema: {
        parentNoteId: z.string().describe("Parent note id"),
        title: z.string(),
        type: z.enum(["text", "code", "file", "image", "search", "book", "relationMap", "render"]),
        content: z.string().describe("Body (HTML for text notes)"),
        mime: z.string().optional().describe("Required for code/file/image"),
        notePosition: z.number().int().optional(),
        prefix: z.string().optional().describe("Branch title prefix"),
      },
    },
    (a) => createNoteHandler(a as Parameters<typeof createNoteHandler>[0], client),
  );
  server.registerTool(
    "update_note",
    {
      description: "Update a note's metadata (title/type/mime).",
      inputSchema: {
        noteId: z.string(),
        title: z.string().optional(),
        type: z.string().optional(),
        mime: z.string().optional(),
      },
    },
    (a) => updateNoteHandler(a as Parameters<typeof updateNoteHandler>[0], client),
  );
  server.registerTool(
    "update_note_content",
    {
      description: "Replace a note's full body (full-replacement).",
      inputSchema: { noteId: z.string(), content: z.string() },
    },
    (a) => updateNoteContentHandler(a as Parameters<typeof updateNoteContentHandler>[0], client),
  );
  server.registerTool(
    "append_to_note",
    {
      description: "Append a fragment to a note's body (read-modify-write; not atomic).",
      inputSchema: { noteId: z.string(), fragment: z.string() },
    },
    (a) => appendToNoteHandler(a as Parameters<typeof appendToNoteHandler>[0], client),
  );
  server.registerTool(
    "delete_note",
    {
      description: "Delete a note (moves to trash; idempotent).",
      inputSchema: { noteId: z.string() },
    },
    (a) => deleteNoteHandler(a as Parameters<typeof deleteNoteHandler>[0], client),
  );
  server.registerTool(
    "move_note",
    {
      description: "Move a note to a different parent (deletes old branch, creates new).",
      inputSchema: {
        noteId: z.string(),
        toParentNoteId: z.string(),
        notePosition: z.number().int().optional(),
        prefix: z.string().optional(),
      },
    },
    (a) => moveNoteHandler(a as Parameters<typeof moveNoteHandler>[0], client),
  );
}
