import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Prompts surface as ready-made commands in MCP clients. Each returns a
 * user message that steers the assistant to use this server's tools.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "weekly_summary",
    {
      title: "Weekly summary",
      description: "Summarise the week: deadlines, announcements and notifications.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Use the weekly_digest tool, then give me a concise summary of my week: " +
              "what's due (soonest first), any new announcements, and anything I should act on. " +
              "Flag overdue or due-within-48h items clearly.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "study_plan",
    {
      title: "Study plan",
      description: "Build a study plan for a course from its materials and deadlines.",
      argsSchema: { course: z.string().describe("Course name or shortname") },
    },
    ({ course }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `For the course "${course}": use list_courses to find its id, then get_course and ` +
              `list_assignments. Build a realistic week-by-week study plan that works backward ` +
              `from the deadlines and covers the available materials.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "assignment_checklist",
    {
      title: "Assignment checklist",
      description: "Turn an assignment into an actionable checklist.",
      argsSchema: { assignment: z.string().describe("Assignment name or description") },
    },
    ({ assignment }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Find the assignment "${assignment}" (use list_courses + list_assignments, then ` +
              `get_assignment for details) and turn it into a concrete, ordered checklist of ` +
              `tasks with suggested time estimates, ending before its deadline.`,
          },
        },
      ],
    })
  );
}
