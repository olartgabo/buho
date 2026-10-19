import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Prompts that need both platforms: course material and deadlines from UPB
 * Virtual (Moodle), past exams from UPBnet.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "study_for_exam",
    {
      title: "Study for an exam",
      description: "Build a study guide from a course's material, anchored on what its past exams ask.",
      argsSchema: { course: z.string().describe("Course name as it appears in UPB Virtual") },
    },
    ({ course }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Help me study for "${course}".\n` +
              `1. list_courses to find the Moodle course, then sync_course to pull its material into the vault.\n` +
              `2. find_exam_subjects to find the matching UPBnet subject. Moodle and UPBnet names often differ ` +
              `(codes, abbreviations, accents): if there isn't one clear match, show me the candidates and ask.\n` +
              `3. sync_exams for that subject.\n` +
              `4. Write a study guide: the topics past exams ask most, each mapped to the course material that ` +
              `covers it, plus a few practice questions in the exams' style. Save it with save_markdown.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "exam_week_plan",
    {
      title: "Exam week plan",
      description: "A day-by-day plan for upcoming deadlines, using past exams for the courses involved.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Use upcoming_deadlines to see what's coming. For each course with an exam or major deadline, " +
              "find its UPBnet subject with find_exam_subjects (ask me if the match is unclear) and use " +
              "search_exams to see how many past exams exist. Then give me a day-by-day plan up to the last " +
              "deadline that spends the most time where past exams are hardest, and says which exam to practice " +
              "each day.",
          },
        },
      ],
    })
  );
}
