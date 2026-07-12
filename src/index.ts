#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClientFromEnv } from "./etapi/client.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  const client = createClientFromEnv();
  const server = new McpServer({ name: "trilium-mcp", version: "0.1.0" });
  registerAllTools(server, client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("trilium-mcp failed to start:", err);
  process.exit(1);
});
