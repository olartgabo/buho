#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startHttpServer } from "@buho/virtual/http";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

startHttpServer(() => {
  const server = new McpServer({ name: "buho-sistemas", version: "0.1.0" });
  registerTools(server);
  registerResources(server);
  registerPrompts(server);
  return server;
}, "buho-sistemas");
