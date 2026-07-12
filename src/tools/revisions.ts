import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function createNoteRevisionHandler(
  args: { noteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.createNoteRevision(args.noteId), () => `Created revision snapshot of ${args.noteId}`);
}

export function registerRevisions(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "create_note_revision",
    {
      description:
        "Create a revision snapshot of a note's current state (ETAPI exposes only snapshot creation; listing/reading revisions is not supported).",
      inputSchema: { noteId: z.string() },
    },
    (a) => createNoteRevisionHandler(a as { noteId: string }, client),
  );
}
