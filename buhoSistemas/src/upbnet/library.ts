import * as cheerio from "cheerio";
import { posix } from "node:path";
import { config } from "../config.js";
import { fetchHtml, request, UpbnetError } from "./client.js";

/**
 * The library's "Exámenes" tab (/library). The page's own picker cascades
 * subject -> semester -> campus -> teacher, but every filter accepts "%" and
 * each result row already carries semester, teacher and campus. So one
 * wildcard search per subject returns everything, and filtering happens here.
 */

export interface Exam {
  /** File stem, e.g. "139826_1912_PRIMER_PARCIAL". */
  id: string;
  subject: string;
  semester: string;
  teacher: string;
  campus: string;
  /** e.g. "PRIMER_PARCIAL", "EXAMEN_FINAL". */
  type: string;
  url: string;
}

const NO_DATA = "No existen datos";

const clean = (sel: { text(): string }) =>
  sel.text().replace(/\s+/g, " ").trim();

/** Subject names from the ajaxgetmatters fragment (the code is the name itself). */
export function parseSubjects(html: string): string[] {
  const $ = cheerio.load(html);
  return $("#tableMaterias tbody tr")
    .map((_, tr) => clean($(tr).find("td").eq(1)))
    .get()
    .filter((name) => name && name !== NO_DATA);
}

export function parseExams(html: string, subject: string): Exam[] {
  const $ = cheerio.load(html);
  const exams: Exam[] = [];
  $("#tableExamenes tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    const link = cells.eq(3).find("a[href]");
    const href = link.attr("href");
    if (!href) return;
    const url = new URL(href, config.baseUrl).toString();
    exams.push({
      id: posix.basename(new URL(url).pathname, ".pdf"),
      subject,
      semester: clean(cells.eq(0)),
      teacher: clean(cells.eq(1)),
      campus: clean(cells.eq(2)),
      type: clean(link),
      url,
    });
  });
  return exams;
}

/** The logged-in student's name from the page header. */
export function parseDisplayName(html: string): string | null {
  const $ = cheerio.load(html);
  return clean($(".user-header p").first()) || null;
}

/** Case- and accent-insensitive form used for matching. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

let subjectsCache: Promise<string[]> | undefined;

/** Every subject that has exams or syllabi. ~1.4k names, fetched once per process. */
export function listSubjects(): Promise<string[]> {
  subjectsCache ??= fetchHtml("/library/ajaxgetmatters/", {})
    .then(parseSubjects)
    .catch((err: unknown) => {
      subjectsCache = undefined;
      throw err;
    });
  return subjectsCache;
}

/** Subjects containing every word of the query, ignoring case and accents. */
export function matchSubjects(subjects: string[], query: string, limit = 25): string[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return subjects
    .filter((s) => {
      const n = normalize(s);
      return words.every((w) => n.includes(w));
    })
    .slice(0, limit);
}

export async function findSubjects(query: string, limit?: number): Promise<string[]> {
  return matchSubjects(await listSubjects(), query, limit);
}

/** Resolve a user-typed subject to the exact UPBnet name, or explain what matched. */
export function pickSubject(subjects: string[], query: string): string {
  const literal = subjects.find((s) => s.toLowerCase() === query.trim().toLowerCase());
  if (literal) return literal;
  // UPBnet lists some subjects twice, with and without accents ("ESTADISTICA" and
  // "ESTADÍSTICA"), so an accent-insensitive match can be ambiguous.
  const target = normalize(query);
  const exact = subjects.filter((s) => normalize(s) === target);
  const candidates = exact.length ? exact : matchSubjects(subjects, query, 10);
  if (candidates.length === 1) return candidates[0];
  throw new UpbnetError(
    candidates.length
      ? `"${query}" matches several subjects; pass one exactly: ${candidates.join(" | ")}`
      : `No UPBnet subject matches "${query}". Try find_exam_subjects with a shorter query.`
  );
}

export async function resolveSubject(query: string): Promise<string> {
  return pickSubject(await listSubjects(), query);
}

export interface ExamFilters {
  semester?: string;
  campus?: string;
  teacher?: string;
}

export async function searchExams(subject: string): Promise<Exam[]> {
  const html = await fetchHtml("/library/testsearch", {
    "search[materia]": subject,
    "search[gestion]": "",
    "search[lugar]": "",
    "search[docente]": "",
    "search[codmateria]": subject,
    "search[codgestion]": "%",
    "search[codlugar]": "%",
    "search[coddocente]": "%",
    "search[codmatGes]": "%",
  });
  return parseExams(html, subject);
}

export function filterExams(exams: Exam[], filters: ExamFilters): Exam[] {
  const match = (value: string, wanted?: string) =>
    !wanted || normalize(value).includes(normalize(wanted));
  return exams.filter(
    (e) =>
      match(e.semester, filters.semester) &&
      match(e.campus, filters.campus) &&
      match(e.teacher, filters.teacher)
  );
}

/** Distinct values present in a result set, for narrowing a search. */
export function facets(exams: Exam[]) {
  const distinct = (pick: (e: Exam) => string) => [...new Set(exams.map(pick))];
  return {
    semesters: distinct((e) => e.semester),
    campuses: distinct((e) => e.campus),
    teachers: distinct((e) => e.teacher),
    types: distinct((e) => e.type),
  };
}

/**
 * Fetch an exam PDF. Only UPBnet /examenes/ URLs are accepted, so a tool
 * argument can't point the session at another host or page.
 */
export async function fetchExamPdf(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.origin !== new URL(config.baseUrl).origin || !/^\/examenes\/[^/]+\.pdf$/i.test(parsed.pathname)) {
    throw new UpbnetError(`Not a UPBnet exam URL: ${url}`);
  }
  const res = await request(parsed.pathname);
  return Buffer.from(await res.arrayBuffer());
}

export async function getDisplayName(): Promise<string | null> {
  return parseDisplayName(await fetchHtml("/library"));
}
