import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";
import { toBase64, fromBase64 } from "../lib/base64.js";

export async function exportNoteSubtreeHandler(
  args: { noteId: string; format?: "html" | "markdown" },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.exportNoteSubtree(args.noteId, args.format ?? "html").then((b) => toBase64(b)),
    (b64) => b64,
  );
}
export async function importNoteZipHandler(
  args: { noteId: string; base64: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.importNoteZip(args.noteId, fromBase64(args.base64)), (r) => JSON.stringify(r));
}

export function registerExportImport(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "export_note_subtree",
    {
      description: "Export a note subtree as a base64-encoded ZIP (use noteId 'root' for the whole document). format: html (default) | markdown.",
      inputSchema: { noteId: z.string(), format: z.enum(["html", "markdown"]).optional() },
      annotations: { readOnlyHint: true },
    },
    (a) => exportNoteSubtreeHandler(a as Parameters<typeof exportNoteSubtreeHandler>[0], client),
  );
  server.registerTool(
    "import_note_zip",
    {
      description: "Import a base64-encoded ZIP into a note. Returns {note, branch} of the imported root.",
      inputSchema: { noteId: z.string(), base64: z.string() },
    },
    (a) => importNoteZipHandler(a as { noteId: string; base64: string }, client),
  );
}
