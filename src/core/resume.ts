// "Where was I?" (SPEC v0.4 §1): the last work context, kept in memory only, and when to offer it back.
import type { ForegroundApp, SystemSample } from "../backend/types";
import { shortText } from "./dates";
import { taskTitle, type TodoTask } from "./models";
import { hostOf } from "./sites";

export const MAX_TITLE = 120;
export const MAX_URL = 2048;
/** Window title length on the resume card. */
const SHOWN_TITLE = 60;

export interface WorkContext {
  taskId: string | null;
  taskTitle: string | null;
  /** Friendly app name ("Visual Studio Code"). */
  app: string | null;
  windowTitle: string | null;
  /** http(s) address of the browser tab, without its #fragment. */
  url: string | null;
  /** Optional one-line "next step" (📌 Pin my place). */
  note: string | null;
  /** Epoch ms of the snapshot. */
  at: number;
}

/** Same shape as `currentDistraction` in sites.ts, as a yes/no. */
export type IsDistracting = (app: ForegroundApp | null, url: string | null) => boolean;

/** Windows that are never "where you were": the pet itself, the lock screen and shell pop-ups. */
const NOT_WORK_EXES = ["lockapp.exe", "searchhost.exe", "searchapp.exe", "startmenuexperiencehost.exe", "shellexperiencehost.exe"];
/** The pet's own window (the board has the keyboard) and shell pop-ups are never "where you were". */
export const isNotWorkApp = (app: ForegroundApp) => {
  const exe = app.exe.toLowerCase();
  return exe.startsWith("todopet") || app.name.trim().toLowerCase() === "todopet" || NOT_WORK_EXES.includes(exe);
};
const isNotWork = isNotWorkApp;

/** Call apps and their web pages: being in a meeting isn't the work you come back to after it. */
const CONFERENCING_EXES = ["zoom.exe", "teams.exe", "ms-teams.exe", "webex.exe", "ciscowebex.exe", "skype.exe"];
const CONFERENCING_HOSTS = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "webex.com", "whereby.com"];
export function isConferencing(app: ForegroundApp | null, url: string | null): boolean {
  if (app && CONFERENCING_EXES.includes(app.exe.toLowerCase())) return true;
  const host = url ? hostOf(url) : null;
  return host !== null && CONFERENCING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Trimmed, whitespace collapsed, at most `max` characters; null when empty. */
function clean(s: string | null | undefined, max = MAX_TITLE): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 0 ? shortText(t, max) : null;
}

/** An http(s) address without credentials or #fragment, at most 2048 characters (never ending in a cut %-escape). */
export function workUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.username = "";
  u.password = "";
  let href = u.href;
  if (href.length > MAX_URL) href = href.slice(0, MAX_URL).replace(/%[0-9a-f]?$/i, "");
  return href;
}

/**
 * The context to remember right now, or null when the app in front is a distraction or there is nothing worth keeping.
 * `task` is the running focus task, else the last task acted on in the board, else the next task.
 */
export function snapshot(
  sample: SystemSample | null,
  task: TodoTask | null,
  isDistracting: IsDistracting,
  now: Date | number,
): WorkContext | null {
  const app = sample?.app ?? null;
  const url = sample?.url ?? null;
  if (app && isDistracting(app, url)) return null;
  const work = app && !isNotWork(app) ? app : null;
  const ctx: WorkContext = {
    taskId: task?.id ?? null,
    taskTitle: task ? clean(taskTitle(task)) : null,
    app: work ? clean(work.name) : null,
    windowTitle: work ? clean(work.title) : null,
    url: work ? workUrl(url) : null,
    note: null,
    at: new Date(now).getTime(),
  };
  return ctx.taskId || ctx.app || ctx.windowTitle || ctx.url ? ctx : null;
}

/** The context with a one-line "next step" (or none when the note is empty). */
export function withNote(ctx: WorkContext, note: string | null): WorkContext {
  return { ...ctx, note: clean(note) };
}

export interface ResumeCheck {
  /** Minutes idle or away from the PC. */
  awayMinutes?: number;
  /** A meeting just ended. */
  afterMeeting?: boolean;
  /** Minutes spent on the distraction just left, if one just ended. */
  leftDistractionMinutes?: number | null;
}

/** Coming back after ≥ 5 min away, after a meeting, or leaving a distraction after ≥ 2 min. */
export function shouldOfferResume(c: ResumeCheck): boolean {
  return (c.awayMinutes ?? 0) >= 5 || c.afterMeeting === true || (c.leftDistractionMinutes ?? 0) >= 2;
}

export interface ResumeSummary {
  /** Task title, or null. */
  task: string | null;
  /** "Visual Studio Code — brain.ts", the app alone, or the site's host; null when unknown. */
  where: string | null;
  /** The pin's next step, or null. */
  note: string | null;
  /** There is an http(s) address to reopen. */
  canReopen: boolean;
}

/** "Docs - Google Chrome" in Google Chrome → "Docs" (apps that repeat their name in the title). */
function titleWithoutApp(title: string, app: string | null): string {
  if (!app) return title;
  for (const sep of [" - ", " — ", " – ", " | "]) {
    const suffix = `${sep}${app}`;
    if (title.toLowerCase().endsWith(suffix.toLowerCase()) && title.length > suffix.length) return title.slice(0, -suffix.length).trim();
  }
  return title;
}

/** Short display parts for the resume card ("You were on: ⟨task⟩ · in ⟨where⟩"). */
export function resumeSummary(ctx: WorkContext): ResumeSummary {
  const url = workUrl(ctx.url);
  const rawTitle = ctx.windowTitle ? titleWithoutApp(ctx.windowTitle, ctx.app) : null;
  const title = rawTitle && rawTitle.toLowerCase() !== (ctx.app ?? "").toLowerCase() ? shortText(rawTitle, SHOWN_TITLE) : null;
  let where: string | null = null;
  if (ctx.app && title) where = `${ctx.app} — ${title}`;
  else if (ctx.app) where = ctx.app;
  else if (title) where = title;
  else if (url) where = hostOf(url);
  return { task: ctx.taskTitle, where, note: ctx.note, canReopen: url !== null };
}
