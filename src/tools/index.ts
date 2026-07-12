import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtapiClient } from "../etapi/client.js";
import { registerSearch } from "./search.js";
import { registerRead } from "./notes-read.js";
import { registerWrite } from "./notes-write.js";
import { registerAttributes } from "./attributes.js";
import { registerCalendar } from "./calendar.js";
import { registerRevisions } from "./revisions.js";
import { registerBranches } from "./branches.js";
import { registerAttachments } from "./attachments.js";
import { registerAttributesExtra } from "./attributes-extra.js";
import { registerExportImport } from "./export-import.js";
import { registerCalendarExtra } from "./calendar-extra.js";
import { registerSystem } from "./system.js";
import { registerComposite } from "./composite.js";

export function registerAllTools(server: McpServer, client: EtapiClient): void {
  registerSearch(server, client);
  registerRead(server, client);
  registerWrite(server, client);
  registerAttributes(server, client);
  registerCalendar(server, client);
  registerRevisions(server, client);
  registerBranches(server, client);
  registerAttachments(server, client);
  registerAttributesExtra(server, client);
  registerExportImport(server, client);
  registerCalendarExtra(server, client);
  registerSystem(server, client);
  registerComposite(server, client);
}
