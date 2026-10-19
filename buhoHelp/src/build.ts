import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as virtual from "@buho/virtual";
import * as sistemas from "@buho/sistemas";
import { registerPrompts } from "./prompts.js";

/** One server exposing UPB Virtual and UPBnet tools side by side, plus cross-site prompts. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "buho-help", version: "0.1.0" });
  for (const part of [virtual, sistemas]) {
    part.registerTools(server);
    part.registerResources(server);
    part.registerPrompts(server);
  }
  registerPrompts(server);
  return server;
}
