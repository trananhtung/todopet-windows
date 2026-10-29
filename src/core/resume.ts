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
  /** The task is only the next one in line, not one you were focusing on or last acted on: the card says "Next up". */
  taskIsNext: boolean;
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

/** Words that make a query parameter's name look like a secret (an OAuth code, a signed link, a session id…). */
const SECRET_WORDS = new Set(["token", "code", "key", "secret", "sig", "signature", "auth", "session", "password", "passwd", "pwd", "state", "credential", "credentials", "jwt", "sid"]);
/** Names that run the word together ("sessionid", "accesstoken", "clientsecret"). */
const SECRET_ENDINGS = ["token", "secret", "password", "passwd", "signature", "apikey", "sessionid", "session"];

/** "access_token", "X-Amz-Signature", "apiKey" and "sessionid" look sensitive; "keyword", "author" and "page" don't. */
export function isSecretParam(name: string): boolean {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  const compact = parts.join("");
  return parts.some((w) => SECRET_WORDS.has(w)) || SECRET_ENDINGS.some((e) => compact.endsWith(e));
}

/** The query without the parameters that look like secrets; everything else stays exactly as written. */
function withoutSecretParams(search: string): string {
  if (search.length <= 1) return "";
  const kept = search
    .slice(1)
    .split("&")
    .filter((part) => {
      if (part.length === 0) return false;
      const raw = part.split("=")[0];
      let name = raw;
      try {
        name = decodeURIComponent(raw.replace(/\+/g, " "));
      } catch {
        // A name that isn't valid %-encoding is checked as it is written.
      }
      return !isSecretParam(name);
    });
  return kept.length > 0 ? `?${kept.join("&")}` : "";
}

/** Characters the opener refuses in a link; the URL parser leaves some of them as they are. */
const UNOPENABLE = /["<>\\^`|]/g;

/**
 * An http(s) address for the card and for Reopen: no credentials, no #fragment, no query parameters that look like
 * secrets (`token`, `code`, `key`, `session`…), the characters the opener refuses (pipe, caret, backtick, backslash,
 * quotes, angle brackets) percent-encoded, at most 2048 characters (never ending in a cut %-escape).
 */
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
  u.search = withoutSecretParams(u.search);
  let href = u.href.replace(UNOPENABLE, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  if (href.length > MAX_URL) href = href.slice(0, MAX_URL).replace(/%[0-9a-f]?$/i, "");
  return href;
}

/** Private-window markers in Latin script, whole words, on a lower-cased title with accents removed. */
const PRIVATE_LATIN = new RegExp(
  "(?<![a-z])(?:" +
    [
      "inprivate",
      "incognito",
      "inkognito",
      "private (?:browsing|window|mode|tab)",
      "privates? (?:fenster|surfen|modus)",
      "privater modus",
      "navigation privee",
      "fenetre privee",
      "navegacion privada",
      "ventana (?:privada|de incognito)",
      "navegacao privada",
      "janela (?:privada|anonima)",
      "anonima",
      "navigazione (?:privata|in incognito)",
      "finestra privata",
      "privenavigatie",
      "privevenster",
      "okno prywatne",
      "tryb prywatny",
      "gizli (?:sekme|pencere)",
      "ozel (?:pencere|gezinme)",
      "rieng tu",
      "an danh",
      "samaran",
      "penjelajahan pribadi",
      "jendela pribadi",
    ].join("|") +
    ")(?![a-z])",
);
/** The same in scripts that have no accents to remove (Cyrillic, Japanese, Chinese, Korean, Thai, Arabic, Hindi, Greek). */
const PRIVATE_OTHER = /инкогнито|приватн|シークレット|プライベート(ブラウジング|ウィンドウ)|无痕|無痕|隐身|隱私瀏覽|隐私浏览|私密浏览|私人浏览|시크릿|비공개 브라우징|사생활 보호|ไม่ระบุตัวตน|التصفح (المتخفي|الخاص)|गुप्त|ιδιωτική περιήγηση|ανώνυμη|anonymní|soukromé prohlížení/;

/** Does this window title come from a private or incognito window (InPrivate, Incognito, Private Browsing, "Riêng tư", "Ẩn danh"…)? */
export function isPrivateTitle(title: string | null | undefined): boolean {
  if (typeof title !== "string" || title.length === 0) return false;
  const lower = title.toLowerCase();
  if (PRIVATE_OTHER.test(lower)) return true;
  const plain = lower
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d");
  return PRIVATE_LATIN.test(plain);
}

export interface SnapshotOptions {
  /** The task comes from "next in line" rather than from what you were doing. */
  taskIsNext?: boolean;
  /** False when the page title and address are not to be kept (`prefs.resumeDetails` off). Default true. */
  details?: boolean;
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
  opts: SnapshotOptions = {},
): WorkContext | null {
  const app = sample?.app ?? null;
  const url = sample?.url ?? null;
  if (app && isDistracting(app, url)) return null;
  // A call, the pet itself and shell pop-ups are never where you were.
  const work = app && !isNotWork(app) && !isConferencing(app, url) ? app : null;
  // A private window keeps its app's name only; so does a card the user asked to keep short.
  const details = work !== null && opts.details !== false && !isPrivateTitle(work.title);
  const ctx: WorkContext = {
    taskId: task?.id ?? null,
    taskTitle: task ? clean(taskTitle(task)) : null,
    taskIsNext: task !== null && opts.taskIsNext === true,
    app: work ? clean(work.name) : null,
    windowTitle: details ? clean(work.title) : null,
    url: details ? workUrl(url) : null,
    note: null,
    at: new Date(now).getTime(),
  };
  return ctx.taskId || ctx.app || ctx.windowTitle || ctx.url ? ctx : null;
}

/** The context without its page title and address (the app and the task stay). */
export function withoutDetails(ctx: WorkContext): WorkContext {
  return { ...ctx, windowTitle: null, url: null };
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
  /** The host of that address ("docs.google.com"), shown next to Reopen; null when there is none. */
  host: string | null;
  /** The task is only the next one in line. */
  taskIsNext: boolean;
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
  return { task: ctx.taskTitle, where, note: ctx.note, canReopen: url !== null, host: url ? hostOf(url) : null, taskIsNext: ctx.taskIsNext };
}
