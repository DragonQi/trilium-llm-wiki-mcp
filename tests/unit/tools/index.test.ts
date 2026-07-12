import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../../../src/tools/index.js";
import type { EtapiClient } from "../../../src/etapi/client.js";

const EXPECTED = [
  // WF1 (19)
  "search_notes","get_note","get_note_content","get_note_tree","get_note_subtree","get_note_path","get_app_info",
  "create_note","update_note","update_note_content","append_to_note","delete_note","move_note",
  "get_attributes","set_attribute","delete_attribute","get_day_note","get_week_note","get_inbox_note",
  // WF2 revisions (1)
  "create_note_revision",
  // WF2 branches (5)
  "clone_note","get_branch","update_branch","delete_branch","refresh_note_ordering",
  // WF2 attachments (7)
  "create_attachment","get_attachment","list_note_attachments","update_attachment","delete_attachment","get_attachment_content","set_attachment_content",
  // WF2 attributes-extra (2)
  "get_attribute","update_attribute",
  // WF2 export/import (2)
  "export_note_subtree","import_note_zip",
  // WF2 calendar-extra (3)
  "get_week_note_by_date","get_month_note","get_year_note",
  // WF2 system (4)
  "login","logout","create_backup","get_metrics",
  // WF2 composite (6)
  "upsert_note","get_backlinks","find_orphans","search_by_attribute","replace_note_section","bulk_set_attributes",
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
