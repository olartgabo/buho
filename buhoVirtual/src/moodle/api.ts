import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { config } from "../config.js";
import { callFunction, authedFileUrl } from "./client.js";

/** Convert a Moodle unix timestamp (seconds) to ISO date, or null if 0/absent. */
export function tsToIso(ts?: number): string | null {
  if (!ts || ts <= 0) return null;
  return new Date(ts * 1000).toISOString();
}

export interface SiteInfo {
  sitename: string;
  username: string;
  fullname: string;
  userid: number;
  release?: string;
}

let siteInfoCache: SiteInfo | null = null;

export async function getSiteInfo(): Promise<SiteInfo> {
  if (!siteInfoCache) {
    siteInfoCache = await callFunction<SiteInfo>("core_webservice_get_site_info");
  }
  return siteInfoCache;
}

export interface Course {
  id: number;
  shortname: string;
  fullname: string;
  startdate?: number;
  enddate?: number;
  visible?: number;
}

export async function listCourses(): Promise<Course[]> {
  const { userid } = await getSiteInfo();
  return callFunction<Course[]>("core_enrol_get_users_courses", { userid });
}

export interface CourseModule {
  id: number;
  name: string;
  modname: string;
  url?: string;
  description?: string;
  contents?: Array<{
    type: string;
    filename: string;
    filesize: number;
    fileurl: string;
    timemodified: number;
    mimetype?: string;
  }>;
}

export interface CourseSection {
  id: number;
  name: string;
  summary?: string;
  modules: CourseModule[];
}

export async function getCourseContents(courseid: number): Promise<CourseSection[]> {
  return callFunction<CourseSection[]>("core_course_get_contents", { courseid });
}

export interface Assignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  duedate: number;
  allowsubmissionsfromdate: number;
  cutoffdate: number;
  intro: string;
  introattachments?: Array<{ filename: string; fileurl: string; filesize: number; mimetype?: string }>;
}

interface AssignmentsResponse {
  courses: Array<{ id: number; fullname: string; assignments: Assignment[] }>;
}

export async function getAssignments(courseids: number[]): Promise<Assignment[]> {
  const res = await callFunction<AssignmentsResponse>("mod_assign_get_assignments", { courseids });
  return res.courses.flatMap((c) => c.assignments);
}

export interface CalendarEvent {
  id: number;
  name: string;
  description?: string;
  timestart: number;
  timeduration: number;
  courseid?: number;
  modulename?: string;
}

export async function getUpcomingDeadlines(): Promise<CalendarEvent[]> {
  const res = await callFunction<{ events: CalendarEvent[] }>(
    "core_calendar_get_calendar_upcoming_view"
  );
  return res.events ?? [];
}

// ---------------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------------

export interface GradeItem {
  itemname: string | null;
  itemtype: string;
  itemmodule: string | null;
  gradeformatted: string;
  percentageformatted: string;
  feedback: string;
}

export async function getGrades(courseid: number): Promise<GradeItem[]> {
  const { userid } = await getSiteInfo();
  const res = await callFunction<{ usergrades: Array<{ gradeitems: GradeItem[] }> }>(
    "gradereport_user_get_grade_items",
    { courseid, userid }
  );
  return res.usergrades.flatMap((u) => u.gradeitems);
}

// ---------------------------------------------------------------------------
// Assignment submission status
// ---------------------------------------------------------------------------

export interface SubmissionStatus {
  status: string | null;
  submitted: boolean;
  grade: string | null;
  gradedDate: string | null;
  feedback: string | null;
  duedate: string | null;
}

export async function getSubmissionStatus(assignid: number): Promise<SubmissionStatus> {
  const res = await callFunction<{
    lastattempt?: { submission?: { status?: string } };
    feedback?: { grade?: { grade?: string }; gradeddate?: number; plugins?: unknown[] };
    gradingsummary?: { duedate?: number };
  }>("mod_assign_get_submission_status", { assignid });

  const status = res.lastattempt?.submission?.status ?? null;
  return {
    status,
    submitted: status === "submitted",
    grade: res.feedback?.grade?.grade ?? null,
    gradedDate: tsToIso(res.feedback?.gradeddate),
    feedback: null,
    duedate: tsToIso(res.gradingsummary?.duedate),
  };
}

// ---------------------------------------------------------------------------
// Announcements (news forum discussions)
// ---------------------------------------------------------------------------

interface Forum {
  id: number;
  course: number;
  type: string;
  name: string;
}

export interface Discussion {
  id: number;
  name: string;
  message: string;
  timemodified: number;
  userfullname: string;
  course?: number;
}

async function getCourseForums(courseids: number[]): Promise<Forum[]> {
  return callFunction<Forum[]>("mod_forum_get_forums_by_courses", { courseids });
}

async function getForumDiscussions(forumid: number, limit = 10): Promise<Discussion[]> {
  const res = await callFunction<{ discussions: Discussion[] }>(
    "mod_forum_get_forum_discussions",
    { forumid, sortorder: 1, page: 0, perpage: limit }
  );
  return res.discussions ?? [];
}

export async function listAnnouncements(courseid: number, limit = 10): Promise<Discussion[]> {
  const forums = await getCourseForums([courseid]);
  const news = forums.find((f) => f.type === "news");
  if (!news) return [];
  const discussions = await getForumDiscussions(news.id, limit);
  return discussions.map((d) => ({ ...d, course: courseid }));
}

export async function latestAnnouncements(limit = 15): Promise<Discussion[]> {
  const courses = await listCourses();
  const all = await Promise.all(
    courses.map((c) => listAnnouncements(c.id, 5).catch(() => [] as Discussion[]))
  );
  return all
    .flat()
    .sort((a, b) => b.timemodified - a.timemodified)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  subject: string;
  text: string;
  timecreated: number;
  read: boolean;
}

export async function getNotifications(limit = 20): Promise<Notification[]> {
  const res = await callFunction<{ notifications: Notification[] }>(
    "message_popup_get_popup_notifications",
    { useridto: 0, newestfirst: 1, limit, offset: 0 }
  );
  return res.notifications ?? [];
}

// ---------------------------------------------------------------------------
// Course search
// ---------------------------------------------------------------------------

export async function searchCourses(query: string): Promise<Course[]> {
  const res = await callFunction<{ courses: Course[] }>("core_course_search_courses", {
    criterianame: "search",
    criteriavalue: query,
    page: 0,
    perpage: 20,
  });
  return res.courses ?? [];
}

/** Fetch a Moodle file (by its fileurl) into memory. */
export async function fetchFileBuffer(fileurl: string): Promise<Buffer> {
  const res = await fetch(await authedFileUrl(fileurl));
  if (!res.ok) throw new Error(`Failed to download file: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Download a Moodle file (by its fileurl) into the configured download dir. */
export async function downloadFile(fileurl: string, filename: string): Promise<string> {
  const dir = resolve(config.downloadDir);
  await mkdir(dir, { recursive: true });
  const safeName = filename.replace(/[/\\?%*:|"<>]/g, "_");
  const dest = join(dir, safeName);
  await writeFile(dest, await fetchFileBuffer(fileurl));
  return dest;
}
