// The pet diary (PetLog.swift): why each reminder fired, what you did with it, what was held back.
// Entries are kept on this PC only, as one JSON line each, in daily files (14 days).
import type { DiaryApi } from "../backend/types";
import { dayKey, timeString } from "./dates";
import { L } from "./l10n";

export type DiaryKind =
  | "bubble"
  | "response"
  | "hold"
  | "meeting"
  | "focus"
  | "mood"
  | "distraction"
  | "life"
  | "antic"
  | "flow"
  | "sync"
  | "system";

export interface DiaryEntry {
  /** Epoch ms. */
  at: number;
  kind: DiaryKind;
  text: string;
  /** Machine-readable detail for the summary ("picked", "closed", "ignored", "flowStart"…). */
  tag?: string;
  minutes?: number;
}

export const kindIcon: Record<DiaryKind, string> = {
  bubble: "💬",
  response: "👆",
  hold: "🤫",
  meeting: "📅",
  focus: "🍅",
  mood: "🎭",
  distraction: "👀",
  life: "🍙",
  antic: "😈",
  flow: "🎧",
  sync: "🔄",
  system: "⚙️",
};

export function parseEntries(lines: string[]): DiaryEntry[] {
  const out: DiaryEntry[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as DiaryEntry;
      if (typeof e.at === "number" && typeof e.text === "string" && typeof e.kind === "string") out.push(e);
    } catch {
      // A torn line (power loss mid-write) is skipped, never fatal.
    }
  }
  return out;
}

export interface DiarySummary {
  reminders: number;
  ignored: number;
  closed: number;
  picked: number;
  held: number;
  focusMinutes: number;
  distractedMinutes: number;
}

export function summarize(entries: DiaryEntry[]): DiarySummary {
  const s: DiarySummary = { reminders: 0, ignored: 0, closed: 0, picked: 0, held: 0, focusMinutes: 0, distractedMinutes: 0 };
  for (const e of entries) {
    if (e.kind === "bubble" || e.kind === "antic") s.reminders++;
    if (e.kind === "hold") s.held++;
    if (e.kind === "response") {
      if (e.tag === "ignored") s.ignored++;
      else if (e.tag === "closed") s.closed++;
      else if (e.tag === "picked") s.picked++;
    }
    if (e.kind === "flow" && e.tag === "flowEnd") s.focusMinutes += e.minutes ?? 0;
    if (e.kind === "distraction" && e.tag === "end") s.distractedMinutes += e.minutes ?? 0;
  }
  return s;
}

export function summaryLine(s: DiarySummary): string {
  return L(
    `${s.reminders} lời nhắc · ${s.picked} lần bấm · ${s.closed} lần đóng · ${s.ignored} lần bỏ qua · ${s.held} lần giữ lại · ${s.focusMinutes}' vào guồng · ${s.distractedMinutes}' xao nhãng`,
    `${s.reminders} reminders · ${s.picked} tapped · ${s.closed} closed · ${s.ignored} ignored · ${s.held} held back · ${s.focusMinutes}' in the zone · ${s.distractedMinutes}' distracted`,
  );
}

/** The whole day as plain text, ready to paste into Claude for tuning advice. */
export function asText(day: string, entries: DiaryEntry[]): string {
  const head = L(`Nhật ký TodoPet ${day}`, `TodoPet diary ${day}`);
  const body = entries.map((e) => `${timeString(new Date(e.at))} ${kindIcon[e.kind]} ${e.text}`).join("\n");
  return `${head}\n${summaryLine(summarize(entries))}\n\n${body}\n`;
}

/** Writes entries through the backend; throttles repeated messages; does nothing while disabled. */
export class Diary {
  enabled = true;
  private lastByKey = new Map<string, number>();

  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  /** `onWritten` tells other windows (the Diary) that new entries landed; called at most every 2 s. */
  constructor(
    private readonly api: DiaryApi,
    private readonly now: () => number = Date.now,
    private readonly onWritten?: () => void,
  ) {}

  private notifySoon(): void {
    if (!this.onWritten || this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.onWritten?.();
    }, 2000);
  }

  /** `throttle` + `every` (minutes): skip if the same key was written less than `every` minutes ago. */
  add(kind: DiaryKind, text: string, opts: { tag?: string; minutes?: number; throttle?: string; every?: number } = {}): void {
    if (!this.enabled) return;
    const at = this.now();
    if (opts.throttle) {
      const last = this.lastByKey.get(opts.throttle);
      if (last !== undefined && at - last < (opts.every ?? 10) * 60_000) return;
      this.lastByKey.set(opts.throttle, at);
    }
    const entry: DiaryEntry = { at, kind, text: text.replace(/\s*\n\s*/g, " ") };
    if (opts.tag) entry.tag = opts.tag;
    if (opts.minutes !== undefined) entry.minutes = opts.minutes;
    this.api
      .append(dayKey(new Date(at)), JSON.stringify(entry))
      .then(() => this.notifySoon())
      .catch(() => {
        // The diary is best-effort; a full disk must never break the pet.
      });
  }
}
