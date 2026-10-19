import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

function bearerMatches(header: string | undefined, expected: string): boolean {
  const got = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${expected}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Serve MCP over Streamable HTTP at /mcp. `buildServer` is called once per
 * client session. Shared by buhoVirtual, buhoSistemas and buhoHelp.
 */
export function startHttpServer(buildServer: () => McpServer, label: string): void {
  const app = express();
  app.use(express.json());

  // Session id -> transport, so follow-up requests reuse their stream.
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Optional shared secret: if MCP_HTTP_TOKEN is set, require it as a Bearer token.
  // Handy when the endpoint is exposed publicly through a Cloudflare tunnel.
  app.use((req, res, next) => {
    const expected = process.env.MCP_HTTP_TOKEN;
    if (!expected || bearerMatches(req.headers.authorization, expected)) return next();
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
  });

  // Client -> server messages (and the initialize handshake).
  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };
      await buildServer().connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session ID" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  // Server -> client SSE stream (GET) and session teardown (DELETE).
  async function handleSession(req: express.Request, res: express.Response) {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  }

  app.get("/mcp", handleSession);
  app.delete("/mcp", handleSession);

  const port = Number(process.env.PORT || process.env.MCP_HTTP_PORT || 8787);
  app.listen(port, () => {
    // stderr keeps stdout clean, matching the stdio entry's convention.
    console.error(`${label} HTTP server on http://localhost:${port}/mcp`);
  });
}
