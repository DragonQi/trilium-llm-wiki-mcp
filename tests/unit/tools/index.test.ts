import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../../../src/tools/index.js";
import type { EtapiClient } from "../../../src/etapi/client.js";

const EXPECTED = [
  "search_notes",
  "get_note",
  "get_note_content",
  "get_note_tree",
  "get_note_subtree",
  "get_note_path",
  "get_app_info",
  "create_note",
  "update_note",
  "update_note_content",
  "append_to_note",
  "delete_note",
  "move_note",
  "get_attributes",
  "set_attribute",
  "delete_attribute",
  "get_day_note",
  "get_week_note",
  "get_inbox_note",
];

describe("registerAllTools", () => {
  it("registers all expected tools", async () => {
    const server = new McpServer({ name: "t", version: "0" });
    registerAllTools(server, {} as EtapiClient);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED].sort());
    await client.close();
    await server.close();
  });
});
