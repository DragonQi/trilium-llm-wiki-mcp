import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const ym = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM");
const y = z.string().regex(/^\d{4}$/, "YYYY");

export async function getWeekNoteByDateHandler(args: { date: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getWeekFirstDayNote(args.date), (n) => JSON.stringify(n));
}
export async function getMonthNoteHandler(args: { month: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getMonthNote(args.month), (n) => JSON.stringify(n));
}
export async function getYearNoteHandler(args: { year: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getYearNote(args.year), (n) => JSON.stringify(n));
}

export function registerCalendarExtra(server: McpServer, client: EtapiClient): void {
  server.registerTool("get_week_note_by_date", { description: "Get (auto-create) the week note for the week containing YYYY-MM-DD.", inputSchema: { date: ymd }, annotations: { readOnlyHint: true } }, (a) => getWeekNoteByDateHandler(a as { date: string }, client));
  server.registerTool("get_month_note", { description: "Get (auto-create) the month note for YYYY-MM.", inputSchema: { month: ym }, annotations: { readOnlyHint: true } }, (a) => getMonthNoteHandler(a as { month: string }, client));
  server.registerTool("get_year_note", { description: "Get (auto-create) the year note for YYYY.", inputSchema: { year: y }, annotations: { readOnlyHint: true } }, (a) => getYearNoteHandler(a as { year: string }, client));
}
