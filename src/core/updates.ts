// v0.7 "Always fresh": the update notice and the one-click update as pure rules (SPEC v0.7 §2). The Brain runs them and
// Rust does the network (src-tauri/src/updates.rs); nothing here touches the backend or the clock by itself.
import type { UpdateManualReason, UpdateProgress, UpdateStatus } from "../backend/types";
import { shortText } from "./dates";
import { getLang, L, plural } from "./l10n";
import type { Lang } from "./types";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The first check comes this long after the start, then every `CHECK_EVERY_MS`. */
export const FIRST_CHECK_MS = 2 * MIN;
export const CHECK_EVERY_MS = 6 * HOUR;
/** A check that failed (the network may only just be up, right after logon) is tried again sooner than the 6 hours. */
export const RETRY_AFTER_FAILURE_MS = 30 * MIN;
/** The release notes kept for after the restart (`life.pendingNotes`): the highlights are all that is read back. */
export const MAX_SAVED_NOTES = 1200;
/** A highlight is shortened to this many characters. */
const HIGHLIGHT_MAX = 90;

// ---------- When to check ----------

/** What the schedule needs to remember: when the app started, and the last attempt (a failed one counts, so a down network isn't asked every beat). */
export interface CheckLog {
  startedAt: number;
  last: { at: number; ok: boolean } | null;
}

/** Is an automatic check due? Never when the setting is off. A clock that went back past the last check counts as due. */
export function checkDue(autoCheck: boolean, log: CheckLog, now: number): boolean {
  if (!autoCheck) return false;
  const last = log.last;
  if (!last) return now - log.startedAt >= FIRST_CHECK_MS;
  const since = now - last.at;
  return since < 0 || since >= (last.ok ? CHECK_EVERY_MS : RETRY_AFTER_FAILURE_MS);
}

// ---------- Versions ----------

/** "0.7.1" → [0, 7, 1]. Strictly three numbers (each at most 9999), like the tags Rust accepts; anything else is null. */
export function parseVersion(v: unknown): [number, number, number] | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative, zero or positive as `a` is older than, the same as or newer than `b`; null when either can't be read. */
export function compareVersions(a: string, b: string): number | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Is `available` news: not the version announced last, and not an older one (a release that was pulled back)? */
export function shouldAnnounce(available: string, announced: string | null): boolean {
  if (announced === null) return true;
  const order = compareVersions(available, announced);
  return order === null ? available !== announced : order > 0;
}

/**
 * What the start of `current` is, against the version recorded last time: the `first` run (only recorded), `updated`
 * (a newer version than the last one: the pet celebrates), the `same` one, or `older` (a step back, or a version that
 * can't be read: recorded, nothing to cheer).
 */
export type AfterStart = "first" | "updated" | "same" | "older";
export function afterStart(last: string | null, current: string): AfterStart {
  if (last === null) return "first";
  const order = compareVersions(current, last);
  return order === null ? "older" : order > 0 ? "updated" : order === 0 ? "same" : "older";
}

/** The notes saved before installing (see `life.pendingNotes`), if they are for `version`. */
export function notesFor(pending: { version: string; notes: string } | null, version: string): string | null {
  return pending && pending.version === version ? pending.notes : null;
}

/** Saved notes for a version that is running now or is behind us have done their job (or never will). */
export function notesStale(pending: { version: string; notes: string } | null, current: string): boolean {
  if (!pending) return false;
  const order = compareVersions(pending.version, current);
  return order === null || order <= 0;
}

// ---------- Release notes ----------

/** Markdown marks in front of a line that make it a list item: "- ", "* ", "+ ", "• ", "1. ", "2) ". */
const BULLET = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+/;
const HEADING = /^\s*#{1,6}(?:\s+|$)/;
const ONLY_LINK = /^\s*<?https?:\/\/\S+>?\s*$/i;
const CHANGELOG = /^\s*(?:\*\*|__)?\s*full changelog\b/i;
/** A heading that only repeats the title the notes are shown under: "What's new", "What's Changed", "Release notes for v0.7.1"… */
const GENERIC_TITLE = /^(?:what['’]?s (?:new|changed)|release notes|changelog|highlights|có gì mới|thay đổi|ghi chú phát hành)(?:\s+(?:in|for|of|trong|cho)?\s*(?:version\s+|bản\s+)?v?\d+(?:\.\d+){0,2})?[\s:!.]*$/i;
/** A line that is only `#`s around a name: "### English", "## tiếng việt ##". */
const LANGUAGE_HEADING = /^\s*#{1,6}\s*(.*?)\s*#*\s*$/;

/**
 * Which language a heading line names, or null. The convention for bilingual release notes (SPEC v0.7): a line `### English` and a
 * line `### Tiếng Việt` (any level of `#`, any case, trimmed, accents optional) each start a section.
 */
function languageOf(line: string): Lang | null {
  const m = LANGUAGE_HEADING.exec(line);
  if (!m) return null;
  const name = m[1]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
  return name === "english" ? "en" : name === "tieng viet" ? "vi" : null;
}

/** The text of each language section (headings removed, sections of one language joined), or null when the notes have none. */
function splitLanguages(notes: string): Record<Lang, string> | null {
  const parts: Record<Lang, string[]> = { en: [], vi: [] };
  let current: Lang | null = null;
  let found = false;
  for (const line of notes.split(/\r?\n/)) {
    const lang = languageOf(line);
    if (lang) {
      current = lang;
      found = true;
    } else if (current) {
      parts[current].push(line);
    }
  }
  return found ? { en: parts.en.join("\n").trim(), vi: parts.vi.join("\n").trim() } : null;
}

/**
 * The part of the release notes for `lang`: its section when the notes are written in two languages, else the other language's
 * section, else the whole text. What comes before the first language heading is a title for both and is left out.
 */
export function forLanguage(notes: string, lang: Lang): string {
  const parts = splitLanguages(notes);
  if (!parts) return notes;
  return parts[lang] || parts[lang === "en" ? "vi" : "en"] || notes.trim();
}

/**
 * The notes cut to what is saved for after the restart (`MAX_SAVED_NOTES`). A bilingual note keeps the start of each section, so
 * the cut never leaves out a whole language.
 */
export function shrinkNotes(notes: string, max = MAX_SAVED_NOTES): string {
  if (notes.length <= max) return notes;
  const parts = splitLanguages(notes);
  const heads: Record<Lang, string> = { en: "### English", vi: "### Tiếng Việt" };
  const present = parts ? (["en", "vi"] as const).filter((k) => parts[k] !== "") : [];
  if (!parts || present.length === 0) return notes.slice(0, max);
  const room = Math.floor((max - present.reduce((n, k) => n + heads[k].length + 2, 0)) / present.length);
  return present.map((k) => `${heads[k]}\n${parts[k].slice(0, room)}`).join("\n");
}

/** Plain text out of one line of markdown: no bold or code marks, links keep their words, GitHub's "by @user in <link>" is dropped. */
function plainLine(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+by\s+@[\w-]+\s+in\s+https?:\/\/\S+\s*$/i, "")
    .replace(/\s+in\s+https?:\/\/\S+\s*$/i, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

interface NoteLine {
  text: string;
  bullet: boolean;
}

/** The lines of the notes that say something: no blanks, headings, bare links or "Full Changelog" line. */
function noteLines(notes: string): NoteLine[] {
  const out: NoteLine[] = [];
  for (const raw of notes.split(/\r?\n/)) {
    if (raw.trim() === "" || HEADING.test(raw) || ONLY_LINK.test(raw) || CHANGELOG.test(raw)) continue;
    const bullet = BULLET.test(raw);
    const text = plainLine(bullet ? raw.replace(BULLET, "") : raw);
    if (text) out.push({ text, bullet });
  }
  return out;
}

/**
 * The first `max` (2–3) highlights of the release notes (in the language of the app, see `forLanguage`), as short plain lines.
 * Bullets win over prose when there are any.
 */
export function highlights(notes: string, max = 3): string[] {
  const lines = noteLines(forLanguage(notes, getLang()));
  const bullets = lines.filter((l) => l.bullet);
  return (bullets.length > 0 ? bullets : lines).slice(0, max).map((l) => shortText(l.text, HIGHLIGHT_MAX));
}

/**
 * The notes for reading in Settings (in the language of the app): bullets as dots, no markdown marks, line breaks kept, and no
 * first heading that only repeats the title above them. Never HTML: it is shown as text.
 */
export function tidyNotes(notes: string): string {
  const out: string[] = [];
  let first = true;
  for (const raw of forLanguage(notes, getLang()).split(/\r?\n/)) {
    if (CHANGELOG.test(raw)) continue;
    if (raw.trim() === "") {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }
    const heading = HEADING.test(raw);
    const bullet = !heading && BULLET.test(raw);
    const text = plainLine(heading ? raw.replace(HEADING, "") : bullet ? raw.replace(BULLET, "") : raw);
    const generic = first && heading && GENERIC_TITLE.test(text);
    first = false;
    if (text && !generic) out.push(bullet ? `• ${text}` : text);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

// ---------- Progress ----------

/** What the install shows: the download with its share (null when the size isn't known), or the last step. */
export type Installing = { phase: "downloading"; percent: number | null } | { phase: "installing" };

/** The share downloaded, 0–100, rounded down (never 100 before the last byte); null without a usable total. */
export function percentOf(p: UpdateProgress): number | null {
  if (p.phase === "installing") return 100;
  if (p.total === null || !Number.isFinite(p.total) || p.total <= 0 || !Number.isFinite(p.downloaded)) return null;
  return Math.min(100, Math.max(0, Math.floor((p.downloaded / p.total) * 100)));
}

export function progressText(i: Installing): string {
  if (i.phase === "installing") return L("Đang cài, chút nữa gặp lại nhé!", "Installing, see you in a moment!");
  return i.percent === null ? L("Đang tải…", "Downloading…") : L(`Đang tải… ${i.percent}%`, `Downloading… ${i.percent}%`);
}

/**
 * What a screen reader is told about the download: the start, the halfway mark and the last step, not every percent (the bar
 * itself carries the exact value). It changes only at those three points, so a live region built on it speaks three times.
 */
export function spokenProgress(i: Installing): string {
  if (i.phase === "installing") return progressText(i);
  return i.percent !== null && i.percent >= 50 ? L("Đang tải… 50%", "Downloading… 50%") : L("Đang tải…", "Downloading…");
}

// ---------- Words for the tray, the board and Settings ----------

/** The tray item: "Check for updates…", or "✨ Update to 0.7.1" while one is waiting. */
export function trayLabel(version: string | null): string {
  return version === null ? L("Kiểm tra cập nhật…", "Check for updates…") : L(`✨ Cập nhật lên ${version}`, `✨ Update to ${version}`);
}

/** The small chip on the board: "ready" when one click does it, else "out" with a hint that it goes to the download page. */
export const chipLabel = (version: string, canInstall: boolean): string =>
  canInstall ? L(`✨ Có bản ${version}`, `✨ ${version} is ready`) : L(`✨ Có bản ${version} · tải về`, `✨ ${version} is out · download`);

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function agoText(at: number, now: number): string {
  const ms = now - at;
  if (ms < MIN) return L("vừa xong", "just now");
  if (ms < HOUR) {
    const n = Math.floor(ms / MIN);
    return L(`${n} phút trước`, `${plural(n, "", "minute", "minutes").trim()} ago`);
  }
  if (ms < 24 * HOUR) {
    const n = Math.floor(ms / HOUR);
    return L(`${n} giờ trước`, `${plural(n, "", "hour", "hours").trim()} ago`);
  }
  const n = Math.floor(ms / (24 * HOUR));
  return L(`${n} ngày trước`, `${plural(n, "", "day", "days").trim()} ago`);
}

export interface StatusLine {
  tone: "ok" | "new" | "error" | "info";
  text: string;
  /** When it was checked (or last tried), if that is worth saying. */
  detail?: string;
  /** A failed check that still shows a version found before: the failure is said too, so a press is never answered with silence. */
  problem?: string;
}

/** Settings' one line about where things stand. */
export function statusLine(st: UpdateStatus, checking: boolean, now: number): StatusLine {
  const checked = (label: (ago: string) => string): { detail?: string } => (st.checkedAt !== null ? { detail: label(agoText(st.checkedAt, now)) } : {});
  if (checking) return { tone: "info", text: L("Đang kiểm tra…", "Checking…") };
  const u = st.available;
  if (u) {
    const text = u.canInstall ? L(`Đã có bản ${u.version}`, `Version ${u.version} is ready`) : L(`Đã có bản ${u.version}`, `Version ${u.version} is out`);
    // (A failure keeps the version found before; it was tried, not answered.)
    if (st.error) {
      return {
        tone: "new",
        text,
        ...checked((ago) => L(`Lần thử gần nhất: ${ago}`, `Last tried ${ago}`)),
        problem: L("Chưa kiểm tra được bản mới lúc này. Đây là bản mình tìm thấy trước đó.", "Couldn't check for updates just now. This is what I found earlier."),
      };
    }
    return { tone: "new", text, ...checked((ago) => L(`Kiểm tra lần cuối: ${ago}`, `Checked ${ago}`)) };
  }
  if (st.error) return { tone: "error", text: L("Chưa kiểm tra được bản mới lúc này", "Couldn't check for updates just now"), ...checked((ago) => L(`Lần thử gần nhất: ${ago}`, `Last tried ${ago}`)) };
  if (st.checkedAt === null) return { tone: "info", text: L("Chưa kiểm tra", "Not checked yet") };
  return { tone: "ok", text: L("Bạn đang dùng bản mới nhất 👍", "You're on the newest version 👍"), ...checked((ago) => L(`Kiểm tra lần cuối: ${ago}`, `Checked ${ago}`)) };
}

/**
 * Why one click is off for this install, and what to do instead: kind, short, and always ending at the download page. A reason
 * this version doesn't know yet (Rust may add one) gets a general sentence of the same kind.
 */
export function manualReasonText(r: UpdateManualReason | null | undefined): string {
  switch (r) {
    case "msi":
      return L(
        "TodoPet này được cài từ gói MSI, loại cài cho cả máy và cần quyền quản trị để cập nhật, nên mình không tự cập nhật được. Bạn mở trang tải về, tải bản mới rồi chạy là xong.",
        "This copy of TodoPet was installed from the MSI package, which installs for everyone on this PC and needs an administrator to update, so I can't update myself. Open the download page, get the new installer and run it.",
      );
    case "unsigned":
      return L(
        "Bản phát hành này chưa có tệp cập nhật đã ký, nên mình không tự cài cho an toàn. Trang tải về có bản mới, bạn tải và chạy là được.",
        "This release doesn't come with a signed update file, so I won't install it on my own, to be safe. The download page has it: download it and run it.",
      );
    case "dev":
      return L(
        "Đây là bản phát triển (chưa cài như ứng dụng thật), nên nó không tự cập nhật. Bản mới có ở trang tải về.",
        "This is a development build, not an installed app, so it doesn't update itself. The new version is on the download page.",
      );
    case "check_failed":
      return L(
        "Mình chưa xác minh được tệp cập nhật của bản này, nên không tự cài. Bạn tải bản mới ở trang tải về nhé, an toàn hơn.",
        "I couldn't verify the update file for this release, so I won't install it myself. Please get the new version from the download page instead. It is safer.",
      );
    default:
      return L(
        "Bản cài này chưa cập nhật bằng một cú bấm được, nên mình không tự cập nhật. Bản mới có ở trang tải về, bạn tải và chạy là được.",
        "One click isn't available for this install, so I can't update myself. The new version is on the download page: download it and run it.",
      );
  }
}
