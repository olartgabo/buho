import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getSiteInfo,
  listCourses,
  getCourseContents,
  getAssignments,
  getUpcomingDeadlines,
  getGrades,
  getSubmissionStatus,
  listAnnouncements,
  latestAnnouncements,
  getNotifications,
  searchCourses,
  downloadFile,
  tsToIso,
} from "./moodle/api.js";
import { syncCourse, syncAll } from "./vault/sync.js";
import { pdfBufferToMarkdown } from "./vault/pdf.js";
import { saveMarkdown } from "./vault/markdown.js";

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

export function registerTools(server: McpServer): void {
  // ---- Identity & courses -------------------------------------------------

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Verify the connection and return the authenticated Moodle user and site info.",
      inputSchema: {},
    },
    safe(async () => {
      const info = await getSiteInfo();
      return {
        site: info.sitename,
        user: info.fullname,
        username: info.username,
        userid: info.userid,
        release: info.release,
      };
    })
  );

  server.registerTool(
    "list_courses",
    {
      title: "List courses",
      description: "List all courses the authenticated user is enrolled in.",
      inputSchema: {},
    },
    safe(async () => {
      const courses = await listCourses();
      return courses.map((c) => ({
        id: c.id,
        shortname: c.shortname,
        name: c.fullname,
        visible: c.visible !== 0,
      }));
    })
  );

  server.registerTool(
    "get_course",
    {
      title: "Get course contents",
      description:
        "Return the sections, activities and downloadable materials (files, PDFs, links) of a course.",
      inputSchema: { course_id: z.number().int().describe("Moodle course id (from list_courses)") },
    },
    safe(async ({ course_id }: { course_id: number }) => {
      const sections = await getCourseContents(course_id);
      return sections.map((s) => ({
        section: s.name,
        summary: s.summary,
        modules: s.modules.map((m) => ({
          id: m.id,
          type: m.modname,
          name: m.name,
          url: m.url,
          files: (m.contents ?? [])
            .filter((c) => c.type === "file")
            .map((f) => ({
              filename: f.filename,
              size: f.filesize,
              mimetype: f.mimetype,
              fileurl: f.fileurl,
            })),
        })),
      }));
    })
  );

  server.registerTool(
    "search_courses",
    {
      title: "Search courses",
      description: "Search the site catalogue for courses matching a query.",
      inputSchema: { query: z.string().min(1).describe("Search text") },
    },
    safe(async ({ query }: { query: string }) => {
      const courses = await searchCourses(query);
      return courses.map((c) => ({ id: c.id, shortname: c.shortname, name: c.fullname }));
    })
  );

  // ---- Assignments --------------------------------------------------------

  server.registerTool(
    "list_assignments",
    {
      title: "List assignments",
      description: "List assignments for one or more courses, with due dates and attachments.",
      inputSchema: {
        course_ids: z.array(z.number().int()).min(1).describe("Course ids (from list_courses)"),
      },
    },
    safe(async ({ course_ids }: { course_ids: number[] }) => {
      const assignments = await getAssignments(course_ids);
      return assignments.map((a) => ({
        id: a.id,
        course: a.course,
        title: a.name,
        opens: tsToIso(a.allowsubmissionsfromdate),
        deadline: tsToIso(a.duedate),
        cutoff: tsToIso(a.cutoffdate),
        attachments: (a.introattachments ?? []).map((f) => ({
          filename: f.filename,
          fileurl: f.fileurl,
        })),
      }));
    })
  );

  server.registerTool(
    "get_assignment",
    {
      title: "Get assignment",
      description: "Get the full details (description, deadline, attachments) of a single assignment.",
      inputSchema: {
        course_id: z.number().int().describe("The course the assignment belongs to"),
        assignment_id: z.number().int().describe("The assignment id (from list_assignments)"),
      },
    },
    safe(async ({ course_id, assignment_id }: { course_id: number; assignment_id: number }) => {
      const assignments = await getAssignments([course_id]);
      const a = assignments.find((x) => x.id === assignment_id);
      if (!a) throw new Error(`Assignment ${assignment_id} not found in course ${course_id}`);
      return {
        id: a.id,
        title: a.name,
        description: a.intro,
        opens: tsToIso(a.allowsubmissionsfromdate),
        deadline: tsToIso(a.duedate),
        cutoff: tsToIso(a.cutoffdate),
        attachments: (a.introattachments ?? []).map((f) => ({
          filename: f.filename,
          fileurl: f.fileurl,
        })),
      };
    })
  );

  server.registerTool(
    "submission_status",
    {
      title: "Submission status",
      description:
        "Check whether an assignment has been submitted, and its grade/feedback if available.",
      inputSchema: { assignment_id: z.number().int().describe("Assignment id (from list_assignments)") },
    },
    safe(async ({ assignment_id }: { assignment_id: number }) => getSubmissionStatus(assignment_id))
  );

  // ---- Grades -------------------------------------------------------------

  server.registerTool(
    "get_grades",
    {
      title: "Get grades",
      description: "Get the grade items and your grades for a course.",
      inputSchema: { course_id: z.number().int().describe("Course id (from list_courses)") },
    },
    safe(async ({ course_id }: { course_id: number }) => {
      const items = await getGrades(course_id);
      return items
        .filter((g) => g.itemname)
        .map((g) => ({
          item: g.itemname,
          type: g.itemmodule ?? g.itemtype,
          grade: g.gradeformatted,
          percentage: g.percentageformatted,
          feedback: g.feedback || undefined,
        }));
    })
  );

  // ---- Announcements & notifications -------------------------------------

  server.registerTool(
    "list_announcements",
    {
      title: "List announcements",
      description: "Latest announcements (news forum) for a course.",
      inputSchema: {
        course_id: z.number().int().describe("Course id"),
        limit: z.number().int().min(1).max(50).optional().describe("Max items (default 10)"),
      },
    },
    safe(async ({ course_id, limit }: { course_id: number; limit?: number }) => {
      const items = await listAnnouncements(course_id, limit ?? 10);
      return items.map((d) => ({
        title: d.name,
        by: d.userfullname,
        when: tsToIso(d.timemodified),
        message: d.message,
      }));
    })
  );

  server.registerTool(
    "latest_announcements",
    {
      title: "Latest announcements",
      description: "Most recent announcements across all enrolled courses.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("Max items (default 15)"),
      },
    },
    safe(async ({ limit }: { limit?: number }) => {
      const items = await latestAnnouncements(limit ?? 15);
      return items.map((d) => ({
        course: d.course,
        title: d.name,
        by: d.userfullname,
        when: tsToIso(d.timemodified),
        message: d.message,
      }));
    })
  );

  server.registerTool(
    "notifications",
    {
      title: "Notifications",
      description: "Your recent Moodle notifications (grades, replies, reminders).",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("Max items (default 20)"),
      },
    },
    safe(async ({ limit }: { limit?: number }) => {
      const items = await getNotifications(limit ?? 20);
      return items.map((n) => ({
        subject: n.subject,
        text: n.text,
        when: tsToIso(n.timecreated),
        read: n.read,
      }));
    })
  );

  // ---- Deadlines & digest -------------------------------------------------

  server.registerTool(
    "upcoming_deadlines",
    {
      title: "Upcoming deadlines",
      description: "Upcoming calendar events and deadlines across all courses, sorted by date.",
      inputSchema: {},
    },
    safe(async () => {
      const events = await getUpcomingDeadlines();
      return events
        .map((e) => ({
          id: e.id,
          title: e.name,
          when: tsToIso(e.timestart),
          course: e.courseid,
          type: e.modulename,
        }))
        .sort((a, b) => (a.when ?? "").localeCompare(b.when ?? ""));
    })
  );

  server.registerTool(
    "weekly_digest",
    {
      title: "Weekly digest",
      description:
        "A single overview: upcoming deadlines, latest announcements, and unread notifications.",
      inputSchema: {},
    },
    safe(async () => {
      const [events, announcements, notes] = await Promise.all([
        getUpcomingDeadlines().catch(() => []),
        latestAnnouncements(8).catch(() => []),
        getNotifications(10).catch(() => []),
      ]);
      return {
        deadlines: events
          .map((e) => ({ title: e.name, when: tsToIso(e.timestart), course: e.courseid }))
          .sort((a, b) => (a.when ?? "").localeCompare(b.when ?? "")),
        announcements: announcements.map((d) => ({
          course: d.course,
          title: d.name,
          when: tsToIso(d.timemodified),
        })),
        unread_notifications: notes.filter((n) => !n.read).map((n) => n.subject),
      };
    })
  );

  // ---- Files & vault ------------------------------------------------------

  server.registerTool(
    "download_file",
    {
      title: "Download file",
      description:
        "Download a Moodle file by its fileurl (from get_course / get_assignment) to the local download directory. Returns the local path.",
      inputSchema: {
        fileurl: z.string().url().describe("The fileurl returned by another tool"),
        filename: z.string().describe("Filename to save as"),
      },
    },
    safe(async ({ fileurl, filename }: { fileurl: string; filename: string }) => ({
      saved: await downloadFile(fileurl, filename),
    }))
  );

  server.registerTool(
    "pdf_to_markdown",
    {
      title: "PDF to markdown",
      description:
        "Convert a local PDF file to markdown (text layer). Returns the markdown text.",
      inputSchema: {
        pdf_path: z.string().describe("Local path to a PDF file"),
        title: z.string().optional().describe("Optional H1 title for the output"),
      },
    },
    safe(async ({ pdf_path, title }: { pdf_path: string; title?: string }) => {
      const buf = await readFile(pdf_path);
      return { markdown: await pdfBufferToMarkdown(buf, title) };
    })
  );

  server.registerTool(
    "save_markdown",
    {
      title: "Save markdown",
      description: "Save markdown content into the vault. relPath is relative to VAULT_DIR.",
      inputSchema: {
        rel_path: z.string().describe('e.g. "Algorithms II/Homework5.md"'),
        content: z.string().describe("Markdown content"),
      },
    },
    safe(async ({ rel_path, content }: { rel_path: string; content: string }) => ({
      saved: await saveMarkdown(rel_path, content),
    }))
  );

  server.registerTool(
    "sync_course",
    {
      title: "Sync course",
      description:
        "Download all new files of a course into the vault, converting PDFs to markdown. Incremental — skips unchanged files.",
      inputSchema: {
        course_id: z.number().int().describe("Course id (from list_courses)"),
        convert_pdf: z.boolean().optional().describe("Convert PDFs to markdown (default true)"),
      },
    },
    safe(async ({ course_id, convert_pdf }: { course_id: number; convert_pdf?: boolean }) => {
      const courses = await listCourses();
      const course = courses.find((c) => c.id === course_id);
      if (!course) throw new Error(`Course ${course_id} not found among your enrolments`);
      return syncCourse(course, { convertPdf: convert_pdf });
    })
  );

  server.registerTool(
    "sync_all",
    {
      title: "Sync all courses",
      description:
        "Sync every enrolled course into the vault (incremental). Converts PDFs to markdown by default.",
      inputSchema: {
        convert_pdf: z.boolean().optional().describe("Convert PDFs to markdown (default true)"),
      },
    },
    safe(async ({ convert_pdf }: { convert_pdf?: boolean }) =>
      syncAll({ convertPdf: convert_pdf })
    )
  );
}
