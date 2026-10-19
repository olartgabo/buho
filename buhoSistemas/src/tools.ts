import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  facets,
  fetchExamPdf,
  filterExams,
  findSubjects,
  getDisplayName,
  resolveSubject,
  searchExams,
  type Exam,
} from "./upbnet/library.js";
import { loadExamCache, saveExamCache, saveExamMarkdown, savePdf } from "./vault.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/** Wrap a handler so any thrown error becomes a clean MCP error result. */
function safe<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return json(await fn(args));
    } catch (err) {
      return fail(err);
    }
  };
}

const filterShape = {
  semester: z.string().optional().describe('Semester substring, e.g. "2020" or "PRIMERO2020"'),
  campus: z.string().optional().describe('Campus substring, e.g. "La Paz"'),
  teacher: z.string().optional().describe("Teacher name substring"),
};

const subjectArg = z
  .string()
  .describe("Subject name; exact UPBnet name preferred (see find_exam_subjects), accents optional");

/** Re-find an exam by URL so downloads carry its subject/semester metadata. */
async function examByUrl(subject: string, url: string): Promise<Exam> {
  const exams = await searchExams(await resolveSubject(subject));
  const exam = exams.find((e) => e.url === url);
  if (!exam) throw new Error(`No exam with url ${url} under "${subject}". Use search_exams first.`);
  return exam;
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "upbnet_whoami",
    {
      title: "UPBnet: who am I",
      description: "Log in to UPBnet (sistemas.upb.edu) and return the student's display name.",
      inputSchema: {},
    },
    safe(async () => ({ site: "UPBnet", user: await getDisplayName() }))
  );

  server.registerTool(
    "find_exam_subjects",
    {
      title: "Find exam subjects",
      description:
        "Search the UPBnet library's subject list (case- and accent-insensitive, all words must match). " +
        "Returns exact subject names to pass to search_exams.",
      inputSchema: {
        query: z.string().min(1).describe('e.g. "bases de datos", "calculo"'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    safe(async ({ query, limit }) => findSubjects(query, limit))
  );

  server.registerTool(
    "search_exams",
    {
      title: "Search past exams",
      description:
        "List past exams for a subject from the UPBnet library, optionally filtered. Also returns the " +
        "distinct semesters, campuses, teachers and exam types available, for narrowing further.",
      inputSchema: { subject: subjectArg, ...filterShape },
    },
    safe(async ({ subject, ...filters }) => {
      const resolved = await resolveSubject(subject);
      const all = await searchExams(resolved);
      const exams = filterExams(all, filters);
      return { subject: resolved, total: all.length, matched: exams.length, available: facets(all), exams };
    })
  );

  server.registerTool(
    "download_exam",
    {
      title: "Download exam PDF",
      description: "Download one exam PDF (url from search_exams) to DOWNLOAD_DIR/exams/<subject>/.",
      inputSchema: { subject: subjectArg, url: z.string().url().describe("Exam url from search_exams") },
    },
    safe(async ({ subject, url }) => {
      const exam = await examByUrl(subject, url);
      return { exam, path: await savePdf(exam, await fetchExamPdf(exam.url)) };
    })
  );

  server.registerTool(
    "exam_to_markdown",
    {
      title: "Exam to markdown",
      description:
        "Download one exam and convert it to markdown in VAULT_DIR/<subject>/exams/. Returns the path and " +
        "whether text was found; scanned exams have no text layer, so read the PDF from download_exam instead.",
      inputSchema: { subject: subjectArg, url: z.string().url().describe("Exam url from search_exams") },
    },
    safe(async ({ subject, url }) => {
      const exam = await examByUrl(subject, url);
      return { exam, ...(await saveExamMarkdown(exam, await fetchExamPdf(exam.url))) };
    })
  );

  server.registerTool(
    "sync_exams",
    {
      title: "Sync exams to vault",
      description:
        "Convert every (optionally filtered) exam of a subject to markdown in the vault. Incremental: exams " +
        "already synced are skipped.",
      inputSchema: { subject: subjectArg, ...filterShape },
    },
    safe(async ({ subject, ...filters }) => {
      const resolved = await resolveSubject(subject);
      const exams = filterExams(await searchExams(resolved), filters);
      const cache = await loadExamCache();
      const summary = { subject: resolved, converted: 0, skipped: 0, noText: [] as string[], errors: [] as string[] };

      for (const exam of exams) {
        if (cache[exam.url]) {
          summary.skipped++;
          continue;
        }
        try {
          const { path, hasText } = await saveExamMarkdown(exam, await fetchExamPdf(exam.url));
          cache[exam.url] = path;
          summary.converted++;
          if (!hasText) summary.noText.push(exam.id);
        } catch (err) {
          summary.errors.push(`${exam.id}: ${err instanceof Error ? err.message : err}`);
        }
      }

      await saveExamCache(cache);
      return summary;
    })
  );
}
