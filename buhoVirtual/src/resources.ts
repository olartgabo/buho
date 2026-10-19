import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listCourses,
  getCourseContents,
  getAssignments,
  tsToIso,
} from "./moodle/api.js";

/**
 * Resources let an MCP client browse and attach Moodle data as context
 * (via upb:// URIs) without an explicit tool call.
 *
 *   upb://courses               -> list of enrolled courses
 *   upb://course/{id}           -> one course's contents
 *   upb://course/{id}/assignments -> that course's assignments
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    "courses",
    "upb://courses",
    {
      title: "Enrolled courses",
      description: "All courses the authenticated user is enrolled in.",
      mimeType: "application/json",
    },
    async (uri) => {
      const courses = await listCourses();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              courses.map((c) => ({ id: c.id, shortname: c.shortname, name: c.fullname })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "course",
    new ResourceTemplate("upb://course/{id}", {
      list: async () => {
        const courses = await listCourses();
        return {
          resources: courses.map((c) => ({
            uri: `upb://course/${c.id}`,
            name: c.fullname,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Course contents",
      description: "Sections, activities and files of a course.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const sections = await getCourseContents(Number(id));
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(sections, null, 2) },
        ],
      };
    }
  );

  server.registerResource(
    "course-assignments",
    new ResourceTemplate("upb://course/{id}/assignments", { list: undefined }),
    {
      title: "Course assignments",
      description: "Assignments (with deadlines) for a course.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const assignments = await getAssignments([Number(id)]);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              assignments.map((a) => ({
                id: a.id,
                title: a.name,
                deadline: tsToIso(a.duedate),
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
