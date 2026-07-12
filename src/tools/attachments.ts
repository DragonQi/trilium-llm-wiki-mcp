import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";
import { toBase64, fromBase64 } from "../lib/base64.js";

export async function createAttachmentHandler(
  args: { ownerId: string; role: string; mime: string; title: string; position: number; content?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.createAttachment(args), (a) => JSON.stringify(a));
}
export async function getAttachmentHandler(args: { attachmentId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getAttachment(args.attachmentId), (a) => JSON.stringify(a));
}
export async function listNoteAttachmentsHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.listNoteAttachments(args.noteId), (list) => JSON.stringify(list));
}
export async function updateAttachmentHandler(
  args: { attachmentId: string; title?: string; role?: string; mime?: string; position?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  const { attachmentId, ...patch } = args;
  return asToolResult(() => client.updateAttachment(attachmentId, patch), (a) => JSON.stringify(a));
}
export async function deleteAttachmentHandler(args: { attachmentId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.deleteAttachment(args.attachmentId), () => `Deleted attachment ${args.attachmentId}`);
}
export async function getAttachmentContentHandler(args: { attachmentId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(
    () => client.getAttachmentContent(args.attachmentId).then((b) => toBase64(b)),
    (b64) => b64,
  );
}
export async function setAttachmentContentHandler(
  args: { attachmentId: string; base64: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.setAttachmentContent(args.attachmentId, fromBase64(args.base64)), () =>
    `Set content of attachment ${args.attachmentId}`,
  );
}

export function registerAttachments(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "create_attachment",
    {
      description:
        "Create an attachment metadata record (text content only via 'content'; upload binary with set_attachment_content).",
      inputSchema: {
        ownerId: z.string().describe(" Owning note id"),
        role: z.string().describe("image | file | content | embed"),
        mime: z.string(),
        title: z.string(),
        position: z.number().int(),
        content: z.string().optional(),
      },
    },
    (a) => createAttachmentHandler(a as Parameters<typeof createAttachmentHandler>[0], client),
  );
  server.registerTool("get_attachment", { description: "Get attachment metadata.", inputSchema: { attachmentId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getAttachmentHandler(a as { attachmentId: string }, client));
  server.registerTool("list_note_attachments", { description: "List attachments owned by a note.", inputSchema: { noteId: z.string() }, annotations: { readOnlyHint: true } }, (a) => listNoteAttachmentsHandler(a as { noteId: string }, client));
  server.registerTool("update_attachment", { description: "Update attachment metadata (title/role/mime/position).", inputSchema: { attachmentId: z.string(), title: z.string().optional(), role: z.string().optional(), mime: z.string().optional(), position: z.number().int().optional() } }, (a) => updateAttachmentHandler(a as Parameters<typeof updateAttachmentHandler>[0], client));
  server.registerTool("delete_attachment", { description: "Delete an attachment (idempotent).", inputSchema: { attachmentId: z.string() } }, (a) => deleteAttachmentHandler(a as { attachmentId: string }, client));
  server.registerTool("get_attachment_content", { description: "Get attachment bytes as base64.", inputSchema: { attachmentId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getAttachmentContentHandler(a as { attachmentId: string }, client));
  server.registerTool("set_attachment_content", { description: "Replace attachment bytes from base64.", inputSchema: { attachmentId: z.string(), base64: z.string() } }, (a) => setAttachmentContentHandler(a as { attachmentId: string; base64: string }, client));
}
