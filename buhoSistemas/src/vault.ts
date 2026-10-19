import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pdfBufferToMarkdown } from "@buho/virtual/pdf";
import { config } from "./config.js";
import type { Exam } from "./upbnet/library.js";

/** Sanitise a path segment for safe use as a folder/file name. */
function safeSegment(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

async function write(path: string, data: string | Buffer): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return path;
}

export function savePdf(exam: Exam, buf: Buffer): Promise<string> {
  return write(join(resolve(config.downloadDir), "exams", safeSegment(exam.subject), `${safeSegment(exam.id)}.pdf`), buf);
}

export interface ConvertedExam {
  path: string;
  /** False when the PDF is a scan with no text layer; the markdown then only has the header. */
  hasText: boolean;
}

/** Write an exam as markdown under VAULT_DIR/<subject>/exams/. */
export async function saveExamMarkdown(exam: Exam, buf: Buffer): Promise<ConvertedExam> {
  const title = `${exam.subject} — ${exam.type} (${exam.semester})`;
  const md = await pdfBufferToMarkdown(buf, title);
  const meta = [
    `- Semester: ${exam.semester}`,
    `- Teacher: ${exam.teacher}`,
    `- Campus: ${exam.campus}`,
    `- Source: ${exam.url}`,
    "",
  ].join("\n");
  // pdfBufferToMarkdown puts "# title" first; slot the metadata right after it.
  const [heading, ...rest] = md.split("\n");
  const body = rest.join("\n");
  const name = `${safeSegment(exam.semester)}_${safeSegment(exam.type)}_${safeSegment(exam.id)}.md`;
  const path = await write(
    join(resolve(config.vaultDir), safeSegment(exam.subject), "exams", name),
    [heading, "", meta, body].join("\n")
  );
  return { path, hasText: /\S/.test(body.replace(/^>.*$/m, "")) };
}

/** Exam URL -> vault path. Exam PDFs don't change once published, so presence means done. */
type ExamCache = Record<string, string>;

function cacheFile(): string {
  return join(resolve(config.cacheDir), "exams.json");
}

export async function loadExamCache(): Promise<ExamCache> {
  try {
    return JSON.parse(await readFile(cacheFile(), "utf8")) as ExamCache;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function saveExamCache(cache: ExamCache): Promise<void> {
  await write(cacheFile(), JSON.stringify(cache, null, 2));
}
