// Shutdown ritual (SPEC v0.4 §3): what the Wrap up sheet decides, tomorrow's frog and note, and "done for today".
// Pure: the brain keeps the state and the board draws the sheet.
import { addDays, atHour, dayKey, isDayKey, parseDate } from "./dates";
import { isRecurring, ranked, type TodoTask } from "./models";

/** The Wrap up sheet is in the board menu from this hour on. */
export const WRAP_UP_HOUR = 15;
/** The one-line "where do I start tomorrow?" note, in characters (graphemes). */
export const MAX_NOTE_LENGTH = 140;
/** Plans kept at once: tomorrow's, and a few days of slack for a long weekend. */
const MAX_PLANS = 7;
const MAX_ID_LENGTH = 64;
/** How far ahead "done for today" can last (rest days are capped at 60). */
const MAX_DONE_DAYS = 75;
/** Looking for the next workday: a bit past the 60 rest days there can be in a row. */
const LOOKAHEAD_DAYS = 70;

export const canWrapUp = (now: Date | number): boolean => new Date(now).getHours() >= WRAP_UP_HOUR;

const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const parts = Array.from(segmenter.segment(text), (p) => p.segment);
  return parts.length <= max ? text : parts.slice(0, max).join("");
}

/** One tidy line: spaces collapsed, trimmed, at most `MAX_NOTE_LENGTH`; null when there is nothing or it is not text. */
export function tidyNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = clip(raw.replace(/\s+/g, " ").trim(), MAX_NOTE_LENGTH).trim();
  return text.length > 0 ? text : null;
}

// ---------- What is stored (the `plan` key) ----------

/** What you chose for a day (`day`) when you wrapped up before it: its frog and a note to your future self. */
export interface DayPlan {
  /** The day it is for, "yyyy-MM-dd". */
  day: string;
  frogId: string | null;
  note: string | null;
}

export interface PlanDoc {
  /** One plan per day, by day. */
  plans: DayPlan[];
  /** "Done for today": non-urgent bubbles wait and the pet sleeps until then (epoch ms), the start of the next workday. */
  doneUntil: number | null;
}

export const emptyPlanDoc = (): PlanDoc => ({ plans: [], doneUntil: null });

export const planFor = (doc: PlanDoc, day: string): DayPlan | null => doc.plans.find((p) => p.day === day) ?? null;

/** Sets the day's plan (one per day). A plan with neither a frog nor a note clears it. Keeps the nearest `MAX_PLANS`. */
export function setPlan(doc: PlanDoc, plan: DayPlan): PlanDoc {
  const others = doc.plans.filter((p) => p.day !== plan.day);
  const plans = plan.frogId === null && plan.note === null ? others : [...others, plan];
  return { ...doc, plans: plans.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)).slice(0, MAX_PLANS) };
}

/** Drops the plans of days before `today`; the same object when there is nothing to drop. */
export function prunePlans(doc: PlanDoc, today: string): PlanDoc {
  const plans = doc.plans.filter((p) => p.day >= today);
  return plans.length === doc.plans.length ? doc : { ...doc, plans };
}

export const isDoneForToday = (doc: PlanDoc, now: Date | number): boolean => doc.doneUntil !== null && new Date(now).getTime() < doc.doneUntil;

function planFromItem(x: unknown): DayPlan | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (!isDayKey(r.day)) return null;
  const id = typeof r.frogId === "string" ? r.frogId.trim() : "";
  const frogId = id.length > 0 && id.length <= MAX_ID_LENGTH ? id : null;
  const note = tidyNote(r.note);
  return frogId === null && note === null ? null : { day: r.day, frogId, note };
}

/** Reads the stored document, dropping anything malformed and the days that are over. */
export function planFromJson(raw: unknown, now: number): PlanDoc {
  if (!raw || typeof raw !== "object") return emptyPlanDoc();
  const r = raw as Record<string, unknown>;
  const today = dayKey(new Date(now));
  let doc = emptyPlanDoc();
  if (Array.isArray(r.plans)) {
    for (const item of r.plans) {
      const plan = planFromItem(item);
      if (plan && plan.day >= today) doc = setPlan(doc, plan);
    }
  }
  const until = r.doneUntil;
  const doneUntil = typeof until === "number" && Number.isFinite(until) && until > now && until <= now + MAX_DONE_DAYS * 86_400_000 ? until : null;
  return { ...doc, doneUntil };
}

/** Plain data for storage. */
export function planToJson(doc: PlanDoc): unknown {
  return { plans: doc.plans.map((p) => ({ day: p.day, frogId: p.frogId, note: p.note })), doneUntil: doc.doneUntil };
}

// ---------- The next workday ----------

/** The first workday after `now`'s day, as a day key; tomorrow if nothing in the next 70 days looks like one. */
export function nextWorkday(now: Date | number, isWorkday: (d: Date) => boolean): string {
  const today = dayKey(new Date(now));
  for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
    const key = addDays(today, i);
    const date = parseDate(key);
    if (date && isWorkday(date)) return key;
  }
  return addDays(today, 1);
}

/** When "done for today" ends: the start of the next workday's work (epoch ms). */
export function nextWorkdayStart(now: Date | number, workStart: number, isWorkday: (d: Date) => boolean): number {
  const day = parseDate(nextWorkday(now, isWorkday)) ?? new Date(new Date(now).getTime() + 86_400_000);
  return atHour(workStart, 0, day).getTime();
}

// ---------- The sheet ----------

/** What to do with an unfinished task: leave it be, move it to tomorrow, or take it off the plan (no date). */
export type WrapMove = "keep" | "tomorrow" | "none";

export interface WrapDraft {
  /** Choices by task id; a task without one stays. */
  moves: Record<string, WrapMove>;
  /** Tomorrow's frog, if you picked one. */
  frogId: string | null;
  /** The note as typed (tidied when saved). */
  note: string;
}

/** A repeating task keeps its own schedule: moving it would break the repeat, so it can only stay. */
export const canMove = (t: TodoTask): boolean => !isRecurring(t);

const noMove = (draft: WrapDraft, id: string): boolean => (draft.moves[id] ?? "keep") === "none";

/** The sheet's starting point: nothing moves; the frog and note you already chose for tomorrow, else the top task and no note. */
export function newDraft(tasks: TodoTask[], previous: DayPlan | null = null): WrapDraft {
  const kept = previous?.frogId && tasks.some((t) => t.id === previous.frogId) ? previous.frogId : null;
  // A plan that already chose "no frog" (only a note) stays that way.
  const frogId = kept ?? (previous && previous.frogId === null ? null : (ranked(tasks)[0]?.id ?? null));
  return { moves: {}, frogId, note: previous?.note ?? "" };
}

export function chooseMove(draft: WrapDraft, tasks: TodoTask[], id: string, move: WrapMove): WrapDraft {
  const task = tasks.find((t) => t.id === id);
  if (!task || (move !== "keep" && !canMove(task))) return draft;
  const moves = { ...draft.moves };
  if (move === "keep") delete moves[id];
  else moves[id] = move;
  // A task taken off the plan is not on tomorrow's list, so it cannot be the frog.
  return { ...draft, moves, frogId: move === "none" && draft.frogId === id ? null : draft.frogId };
}

/** `null` means "decide tomorrow". */
export function chooseFrog(draft: WrapDraft, tasks: TodoTask[], id: string | null): WrapDraft {
  if (id === null) return { ...draft, frogId: null };
  if (!tasks.some((t) => t.id === id) || noMove(draft, id)) return draft;
  return { ...draft, frogId: id };
}

/** Every task that can move goes to tomorrow; repeating ones stay. */
export function moveAllToTomorrow(draft: WrapDraft, tasks: TodoTask[]): WrapDraft {
  const moves = { ...draft.moves };
  for (const t of tasks) if (canMove(t)) moves[t.id] = "tomorrow";
  return { ...draft, moves };
}

/** While typing: one line, not too long. Spaces are left alone until the note is saved. */
export function setNote(draft: WrapDraft, text: string): WrapDraft {
  return { ...draft, note: clip(text.replace(/[\r\n]/g, " "), MAX_NOTE_LENGTH) };
}

/** The tasks to reschedule, by what was chosen (tasks that can't move never are). */
export function wrapMoves(draft: WrapDraft, tasks: TodoTask[]): { tomorrow: TodoTask[]; none: TodoTask[] } {
  const pick = (move: WrapMove) => tasks.filter((t) => canMove(t) && draft.moves[t.id] === move);
  return { tomorrow: pick("tomorrow"), none: pick("none") };
}

/** The frog if it is still on the list and not going off the plan. */
export function draftFrog(draft: WrapDraft, tasks: TodoTask[]): TodoTask | null {
  if (draft.frogId === null || noMove(draft, draft.frogId)) return null;
  return tasks.find((t) => t.id === draft.frogId) ?? null;
}

/** What to remember for `day`: the frog and the tidy note (both null when there is nothing to remember). */
export function planFromDraft(draft: WrapDraft, tasks: TodoTask[], day: string): DayPlan {
  return { day, frogId: draftFrog(draft, tasks)?.id ?? null, note: tidyNote(draft.note) };
}
