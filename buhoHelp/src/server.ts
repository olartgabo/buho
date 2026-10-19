#!/usr/bin/env node
import "./env.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./build.js";

// stdout carries the MCP protocol. Dependencies that print with console.log
// (pdf.js font warnings during PDF conversion, for one) would corrupt it.
console.log = console.error;

async function main() {
  await buildServer().connect(new StdioServerTransport());
  // stderr only — stdout is reserved for the MCP protocol.
  console.error("buho-help server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
