import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Prompts surface as ready-made commands in MCP clients. Each returns a
 * user message that steers the assistant to use this server's tools.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "exam_practice",
    {
      title: "Exam practice",
      description: "Quiz me with questions modelled on a subject's past exams.",
      argsSchema: { subject: z.string().describe("Subject name") },
    },
    ({ subject }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Use find_exam_subjects to get the exact UPBnet name for "${subject}", then search_exams and ` +
              `sync_exams to put its past exams in the vault. Read the most recent ones and quiz me one ` +
              `question at a time in the same style and difficulty. Wait for my answer, correct it, then ` +
              `move on. If an exam had no text layer, say so and work from the others.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "exam_patterns",
    {
      title: "Exam patterns",
      description: "Find the topics and question types that recur across a subject's past exams.",
      argsSchema: { subject: z.string().describe("Subject name") },
    },
    ({ subject }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Use find_exam_subjects for "${subject}", then sync_exams. Across all its past exams, list the ` +
              `topics and question types that recur, how often, and in which exam (primer/segundo parcial, ` +
              `final). Note differences between teachers or campuses if the data shows any. End with the ` +
              `topics I should prioritise.`,
          },
        },
      ],
    })
  );
}
