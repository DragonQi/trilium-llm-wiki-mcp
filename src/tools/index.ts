import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtapiClient } from "../etapi/client.js";
import { registerSearch } from "./search.js";
import { registerRead } from "./notes-read.js";
import { registerWrite } from "./notes-write.js";
import { registerAttributes } from "./attributes.js";
import { registerCalendar } from "./calendar.js";

export function registerAllTools(server: McpServer, client: EtapiClient): void {
  registerSearch(server, client);
  registerRead(server, client);
  registerWrite(server, client);
  registerAttributes(server, client);
  registerCalendar(server, client);
}
