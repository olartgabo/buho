#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

// stdout carries the MCP protocol. Dependencies that print with console.log
// (pdf.js font warnings during PDF conversion, for one) would corrupt it.
console.log = console.error;

const server = new McpServer({ name: "buho-virtual", version: "0.1.0" });

registerTools(server);
registerResources(server);
registerPrompts(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is reserved for the MCP protocol.
  console.error("buho-virtual server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
