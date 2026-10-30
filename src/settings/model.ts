// Pure helpers behind the Settings window (no DOM, no React), unit-tested in model.test.ts.
import type { BusEvent } from "../backend/types";
import { BackendError } from "../backend/types";
import { L, plural } from "../core/l10n";
import type { LifeState } from "../core/life";
import { addDays, daysBetween } from "../core/dates";
import { MAX_REST_DAYS, MAX_REST_RANGE, type Prefs } from "../core/prefs";

export const SECTION_IDS = ["pet", "todoist", "workday", "focus", "distractions", "calendar", "postponed", "behavior", "updates", "about"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** "#calendar" → "calendar"; anything unknown → "pet". */
export function sectionFromHash(hash: string): SectionId {
  const id = hash.replace(/^#/, "").toLowerCase();
  return (SECTION_IDS as readonly string[]).includes(id) ? (id as SectionId) : "pet";
}

export type NumberKey =
  | "dailyTarget"
  | "workStart"
  | "workEnd"
  | "planDeadline"
  | "remindEvery"
  | "defaultEstimate"
  | "bubbleGap"
  | "nudgeBudget"
  | "focusMinutes"
  | "breakMinutes"
  | "meetingLead"
  | "stuckDays";

/** Same bounds as the clamps in `prefsFromJson` (a test keeps them in sync). */
export const NUMBER_LIMITS: Readonly<Record<NumberKey, { min: number; max: number }>> = {
  dailyTarget: { min: 1, max: 10 },
  workStart: { min: 0, max: 23 },
  workEnd: { min: 1, max: 24 },
  planDeadline: { min: 0, max: 23 },
  remindEvery: { min: 10, max: 240 },
  defaultEstimate: { min: 15, max: 120 },
  bubbleGap: { min: 0, max: 120 },
  nudgeBudget: { min: 0, max: 30 },
  focusMinutes: { min: 5, max: 120 },
  breakMinutes: { min: 1, max: 60 },
  meetingLead: { min: 1, max: 30 },
  stuckDays: { min: 2, max: 14 },
};

export const PET_SCALE = { min: 0.6, max: 1.8, step: 0.05 } as const;

/** What a number box holds while typing → the value to store: rounded and clamped, or null if not a number. */
export function parseBounded(raw: string, min: number, max: number): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** "TikTok, Netflix,, netflix " → ["TikTok", "Netflix"]: trimmed, no blanks, no case-insensitive repeats. */
export function listItems(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(",")) {
    const item = part.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const MAX_CALENDARS = 10;

/** Splits the pasted ICS links (lines or commas) and reports what will be ignored. */
export function checkCalendarText(text: string): { links: string[]; invalid: string[]; overLimit: number } {
  const parts = text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = parts.filter((s) => /^(https|webcal):\/\//i.test(s));
  return {
    links: valid.slice(0, MAX_CALENDARS),
    invalid: parts.filter((s) => !/^(https|webcal):\/\//i.test(s)),
    overLimit: Math.max(0, valid.length - MAX_CALENDARS),
  };
}

export interface UnlockRule {
  kind: "streak" | "tasks";
  value: number;
}

/** How far the user is toward a locked species: best streak in days, or tasks finished. */
export function unlockProgress(unlock: UnlockRule, life: Pick<LifeState, "bestStreak" | "totalDone">): {
  have: number;
  need: number;
  done: boolean;
} {
  const have = Math.max(0, Math.floor(unlock.kind === "streak" ? life.bestStreak : life.totalDone));
  return { have: Math.min(have, unlock.value), need: unlock.value, done: have >= unlock.value };
}

/** Events other windows need after a save: species-changed for a new species, prefs-changed for anything else. */
export function changedEvents(prev: Prefs, next: Prefs): BusEvent[] {
  const events: BusEvent[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof Prefs>;
  let other = false;
  for (const k of keys) {
    // By value: lists (rest days) come back from a save as new arrays.
    if (k === "species" || prev[k] === next[k] || JSON.stringify(prev[k]) === JSON.stringify(next[k])) continue;
    other = true;
    break;
  }
  if (prev.species !== next.species) events.push({ type: "species-changed" });
  if (other) events.push({ type: "prefs-changed" });
  return events;
}

/** A sentence for a failed secrets call, in the user's language. */
export function secretErrorText(e: unknown, which: "todoist" | "anthropic" | "calendar"): string {
  if (e instanceof BackendError) {
    switch (e.kind) {
      case "unauthorized": {
        const text =
          which === "todoist"
            ? L("Todoist không nhận token này. Hãy sao chép lại token API.", "Todoist didn't accept this token. Copy the API token again.")
            : which === "calendar"
              ? L("Lịch không cho đọc link này.", "The calendar refused this link.")
              : L("Anthropic không nhận khoá này.", "Anthropic didn't accept this key.");
        return e.message ? `${text} (${e.message})` : text;
      }
      case "network":
        return L(`Không kết nối được: ${e.message}`, `Couldn't connect: ${e.message}`);
      case "rate_limited":
        return L("Máy chủ đang bận, thử lại sau ít phút.", "The server is busy, try again in a few minutes.") + (e.message ? ` (${e.message})` : "");
      case "invalid":
        return L(`Giá trị không hợp lệ: ${e.message}`, `That doesn't look right: ${e.message}`);
      default:
        return e.message || L("Có lỗi xảy ra.", "Something went wrong.");
    }
  }
  if (e instanceof Error && e.message) return e.message;
  return L("Có lỗi xảy ra.", "Something went wrong.");
}

/** A warning for work hours that don't make sense, or null. */
export function workHoursProblem(p: Pick<Prefs, "workStart" | "workEnd" | "planDeadline">): string | null {
  if (p.workEnd <= p.workStart) return L("Giờ kết thúc phải sau giờ bắt đầu.", "The work day has to end after it starts.");
  if (p.planDeadline < p.workStart || p.planDeadline >= p.workEnd)
    return L("Hạn lên kế hoạch nên nằm trong giờ làm việc.", "The planning deadline should fall inside your work hours.");
  return null;
}

/** "8" → "08:00". */
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export interface RestRun {
  from: string;
  to: string;
  days: string[];
}

/** Rest days from `today` on, grouped into runs of consecutive days ("24–28 Nov"). */
export function restRuns(days: readonly string[], today: string): RestRun[] {
  const runs: RestRun[] = [];
  for (const d of [...days].sort()) {
    if (d < today) continue;
    const last = runs.at(-1);
    if (last && addDays(last.to, 1) === d) {
      last.to = d;
      last.days.push(d);
    } else {
      runs.push({ from: d, to: d, days: [d] });
    }
  }
  return runs;
}

/** Why a new rest-day range can't be added, or null (also while a date is still empty). */
export function restRangeProblem(from: string, to: string, today: string): string | null {
  if (!from || !to) return null;
  const [a, b] = from <= to ? [from, to] : [to, from];
  if (a < today) return L("Chỉ thêm được ngày nghỉ từ hôm nay trở đi.", "Days off can start today at the earliest.");
  if (daysBetween(a, b) + 1 > MAX_REST_RANGE) return L(`Mỗi lần thêm tối đa ${MAX_REST_RANGE} ngày.`, `Add up to ${MAX_REST_RANGE} days at a time.`);
  return null;
}

/** What adding a range of days off did: how many were really added, and a warning when the 60-day cap left some out. */
export function restAddNotice(added: number, cut: number): { kind: "ok" | "error"; text: string } {
  const addedText = L(`Đã thêm ${added} ngày nghỉ.`, `Added ${plural(added, "", "day off", "days off").trim()}.`);
  if (cut > 0) {
    return {
      kind: "error",
      text: `${addedText} ${L(
        `Tối đa ${MAX_REST_DAYS} ngày nghỉ, nên ${cut} ngày xa nhất không được giữ.`,
        `You can have ${MAX_REST_DAYS} at most, so the ${plural(cut, "", "furthest day wasn't", "furthest days weren't").trim()} kept.`,
      )}`,
    };
  }
  if (added === 0) return { kind: "ok", text: L("Những ngày đó đã là ngày nghỉ rồi.", "Those days are already days off.") };
  return { kind: "ok", text: addedText };
}
