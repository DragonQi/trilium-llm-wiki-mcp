import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const isoWeek = z.string().regex(/^\d{4}-W\d{2}$/, "YYYY-W## (ISO week)");

export async function getDayNoteHandler(
  args: { date: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getDayNote(args.date), (n) => JSON.stringify(n));
}
export async function getWeekNoteHandler(
  args: { week: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getWeekNote(args.week), (n) => JSON.stringify(n));
}
export async function getInboxNoteHandler(
  args: { date: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getInboxNote(args.date), (n) => JSON.stringify(n));
}

export function registerCalendar(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "get_day_note",
    {
      description: "Get (auto-create) the day note for YYYY-MM-DD.",
      inputSchema: { date: ymd },
      annotations: { readOnlyHint: true },
    },
    (a) => getDayNoteHandler(a as { date: string }, client),
  );
  server.registerTool(
    "get_week_note",
    {
      description:
        "Get the week note for an ISO week (YYYY-W##). Returns WEEK_NOT_FOUND if week notes are disabled.",
      inputSchema: { week: isoWeek },
      annotations: { readOnlyHint: true },
    },
    (a) => getWeekNoteHandler(a as { week: string }, client),
  );
  server.registerTool(
    "get_inbox_note",
    {
      description:
        "Get the inbox note for YYYY-MM-DD (a #inbox note if one exists, else the day note).",
      inputSchema: { date: ymd },
      annotations: { readOnlyHint: true },
    },
    (a) => getInboxNoteHandler(a as { date: string }, client),
  );
}
