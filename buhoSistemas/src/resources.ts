import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { facets, resolveSubject, searchExams } from "./upbnet/library.js";

/**
 * Resources let an MCP client attach UPBnet exam listings as context:
 *
 *   upbnet://exams/{subject}   -> every past exam of a subject (URL-encode the name)
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    "exams",
    new ResourceTemplate("upbnet://exams/{subject}", { list: undefined }),
    {
      title: "Past exams of a subject",
      description: "All past exams listed in the UPBnet library for one subject",
      mimeType: "application/json",
    },
    async (uri, { subject }) => {
      const resolved = await resolveSubject(decodeURIComponent(String(subject)));
      const exams = await searchExams(resolved);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ subject: resolved, available: facets(exams), exams }, null, 2),
          },
        ],
      };
    }
  );
}
