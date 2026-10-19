import { join, extname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "../config.js";
import { listCourses, getCourseContents, fetchFileBuffer, type Course } from "../moodle/api.js";
import { loadCache, saveCache, isUnchanged, mark } from "../storage/cache.js";
import { pdfBufferToMarkdown } from "./pdf.js";
import { saveMarkdown, safeSegment } from "./markdown.js";

export interface SyncSummary {
  course: string;
  downloaded: number;
  converted: number;
  skipped: number;
  errors: string[];
}

interface SyncOptions {
  convertPdf?: boolean;
}

/** Sync all downloadable files of one course into the vault (incremental). */
export async function syncCourse(
  course: Pick<Course, "id" | "shortname" | "fullname">,
  options: SyncOptions = {}
): Promise<SyncSummary> {
  const convertPdf = options.convertPdf ?? true;
  const cache = await loadCache();
  const summary: SyncSummary = {
    course: course.fullname,
    downloaded: 0,
    converted: 0,
    skipped: 0,
    errors: [],
  };

  const folder = safeSegment(course.shortname || course.fullname || String(course.id));
  const sections = await getCourseContents(course.id);

  for (const section of sections) {
    for (const mod of section.modules) {
      for (const file of mod.contents ?? []) {
        if (file.type !== "file") continue;
        const key = file.fileurl;
        if (isUnchanged(cache, key, file.timemodified)) {
          summary.skipped++;
          continue;
        }
        try {
          const buf = await fetchFileBuffer(file.fileurl);
          const isPdf =
            extname(file.filename).toLowerCase() === ".pdf" ||
            file.mimetype === "application/pdf";

          let savedPath: string;
          if (isPdf && convertPdf) {
            const md = await pdfBufferToMarkdown(buf, file.filename.replace(/\.pdf$/i, ""));
            const rel = join(folder, file.filename.replace(/\.pdf$/i, ".md"));
            savedPath = await saveMarkdown(rel, md);
            summary.converted++;
          } else {
            savedPath = await saveRawFile(folder, file.filename, buf);
          }
          summary.downloaded++;
          mark(cache, key, file.timemodified, savedPath);
        } catch (err) {
          summary.errors.push(`${file.filename}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  await saveCache(cache);
  return summary;
}

/** Sync every enrolled course. */
export async function syncAll(options: SyncOptions = {}): Promise<SyncSummary[]> {
  const courses = await listCourses();
  const summaries: SyncSummary[] = [];
  for (const c of courses) {
    summaries.push(await syncCourse(c, options));
  }
  return summaries;
}

async function saveRawFile(folder: string, filename: string, buf: Buffer): Promise<string> {
  const dir = join(resolve(config.vaultDir), folder, "files");
  await mkdir(dir, { recursive: true });
  const dest = join(dir, safeSegment(filename));
  await writeFile(dest, buf);
  return dest;
}
