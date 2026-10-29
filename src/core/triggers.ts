// If-then starts (SPEC v0.4 §5): "start this task after ⟨meeting⟩ / when I open ⟨app⟩ / after lunch".
// Stored locally for the day; each fires once.
import type { ForegroundApp } from "../backend/types";
import type { CalEvent } from "./calendar";
import { isDayKey } from "./dates";

/** Local hour from which "after lunch" holds. */
export const LUNCH_HOUR = 13;
/** Recent apps offered in the "when I open…" menu. */
export const MAX_APP_CHOICES = 3;
/** A typed app name needs this many characters (an exe from the recent apps does not). */
export const MIN_APP_NAME = 3;
/** Stored meeting titles are cut to this many characters. */
export const MAX_TITLE = 60;
/** A meeting id longer than this is stored as a hash. */
const MAX_EVENT_ID = 200;

const MAX_TRIGGERS = 200;
const MAX_TEXT = 200;

export type StartTrigger =
  | { kind: "afterMeeting"; eventId: string; title: string }
  /** `exe` is set when the app was picked from the recent ones: it matches that exact program. */
  | { kind: "appOpen"; app: string; exe?: string }
  | { kind: "afterLunch" };

export interface TaskTrigger {
  taskId: string;
  /** "yyyy-MM-dd" the trigger was set for. */
  day: string;
  trigger: StartTrigger;
  fired: boolean;
  /** Epoch ms the plan was made: an app plan waits for the app to come to the front after this. */
  setAt: number;
  /** "Later": the plan doesn't fire before this (epoch ms). */
  notBefore: number | null;
}

export interface TriggerContext {
  /** Today's day key. */
  day: string;
  now: Date | number;
  /** Today's events. */
  events: CalEvent[];
  /** App in front right now. */
  app: ForegroundApp | null;
  /** When that app came to the front (epoch ms). */
  appSwitchedAt: number;
  /** Events the brain saw end (also covers meetings since dropped from the calendar). */
  endedEventIds: string[];
}

/** A short, stable, non-reversible tag for a piece of text (cyrb53, base 36): not for security, just so ids needn't be stored. */
export function shortHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** What is stored for a calendar event id: the id itself, or a hash of it when it is very long. */
export const eventKey = (id: string): string => (id.length > MAX_EVENT_ID ? `h:${shortHash(id)}` : id);

/** The pet's own window is never an "app to open". */
const isPet = (app: ForegroundApp) => app.exe.toLowerCase().startsWith("todopet") || app.name.trim().toLowerCase() === "todopet";

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
const exeStem = (exe: string) => exe.trim().toLowerCase().replace(/\.exe$/, "");

/**
 * Is `app` the one a plan wants? An app picked from the recent ones is matched by its exe. A typed name needs 3+
 * characters and matches whole words of the app's name (in order: "studio", "Visual Studio") or the exe's name without
 * `.exe`, ignoring case: "e" or "exe" match nothing, "word" doesn't match "Password Manager".
 */
export function appMatches(app: ForegroundApp | null, wanted: string, exe?: string | null): boolean {
  if (!app) return false;
  if (exe) return app.exe.trim().toLowerCase() === exe.trim().toLowerCase();
  const w = wanted.trim().toLowerCase();
  if (w.length < MIN_APP_NAME) return false;
  if (exeStem(app.exe) === w) return true;
  const want = words(w);
  if (want.length === 0) return false;
  return ` ${words(app.name).join(" ")} `.includes(` ${want.join(" ")} `);
}

function holds(t: TaskTrigger, ctx: TriggerContext, now: Date): boolean {
  const trigger = t.trigger;
  switch (trigger.kind) {
    case "afterMeeting": {
      if (ctx.endedEventIds.some((id) => eventKey(id) === trigger.eventId)) return true;
      const event = ctx.events.find((e) => eventKey(e.id) === trigger.eventId);
      return event !== undefined && event.end.getTime() <= now.getTime();
    }
    case "appOpen":
      // The app has to arrive after the plan was made: one that was already in front doesn't count.
      return appMatches(ctx.app, trigger.app, trigger.exe) && ctx.appSwitchedAt > t.setAt;
    case "afterLunch":
      return now.getHours() >= LUNCH_HOUR;
  }
}

/** Today's unfired triggers whose condition holds now (and "Later" has passed), in list order. */
export function dueTriggers(list: TaskTrigger[], ctx: TriggerContext): TaskTrigger[] {
  const now = new Date(ctx.now);
  return list.filter((t) => !t.fired && t.day === ctx.day && (t.notBefore === null || now.getTime() >= t.notBefore) && holds(t, ctx, now));
}

/** Marks the task's trigger for `day` as fired, so it never fires again. */
export function markFired(list: TaskTrigger[], taskId: string, day: string): TaskTrigger[] {
  return list.map((t) => (t.taskId === taskId && t.day === day && !t.fired ? { ...t, fired: true } : t));
}

/** "Later": the task's trigger for `day` is armed again, not before `notBefore` (epoch ms). */
export function rearmTrigger(list: TaskTrigger[], taskId: string, day: string, notBefore: number): TaskTrigger[] {
  return list.map((t) => (t.taskId === taskId && t.day === day ? { ...t, fired: false, notBefore } : t));
}

/** Keeps only today's triggers (fired ones too, so they don't fire again). */
export function pruneTriggers(list: TaskTrigger[], today: string): TaskTrigger[] {
  return list.filter((t) => t.day === today);
}

/** Sets (or replaces) the task's trigger for `day`, made at `setAt` (epoch ms): one per task per day. */
export function setTrigger(list: TaskTrigger[], taskId: string, day: string, trigger: StartTrigger, setAt: number): TaskTrigger[] {
  return [...list.filter((t) => !(t.taskId === taskId && t.day === day)), { taskId, day, trigger, fired: false, setAt, notBefore: null }];
}

/** Removes the task's trigger for `day`. */
export function clearTrigger(list: TaskTrigger[], taskId: string, day: string): TaskTrigger[] {
  return list.filter((t) => !(t.taskId === taskId && t.day === day));
}

/** The task's trigger for `day`, if any (fired or not). */
export function triggerFor(list: TaskTrigger[], taskId: string, day: string): TaskTrigger | null {
  return list.find((t) => t.taskId === taskId && t.day === day) ?? null;
}

/**
 * Today's plans still waiting for a meeting that is no longer on the calendar (it moved or was cancelled) and that
 * the pet never saw end.
 */
export function goneMeetingPlans(list: TaskTrigger[], events: CalEvent[], endedEventIds: string[], day: string): TaskTrigger[] {
  const known = new Set([...events.map((e) => eventKey(e.id)), ...endedEventIds.map(eventKey)]);
  return list.filter((t) => t.day === day && !t.fired && t.trigger.kind === "afterMeeting" && !known.has(t.trigger.eventId));
}

export interface TriggerChoiceInput {
  /** Today's events. */
  events: CalEvent[];
  now: Date | number;
  /** Apps recently in front, most recent first. */
  recentApps: ForegroundApp[];
  /** The app in front right now: a plan for it would have nothing to wait for, so it isn't offered. */
  current?: ForegroundApp | null;
  /** Same shape as `currentDistraction` in sites.ts, as a yes/no. */
  isDistracting: (app: ForegroundApp | null, url: string | null) => boolean;
}

/**
 * Options for a task's **Start when…** menu: after each meeting today that hasn't ended (by start), when I open one
 * of up to 3 recent non-distracting apps (not the one in front), and after lunch while it is still before 13:00.
 */
export function triggerChoices(input: TriggerChoiceInput): StartTrigger[] {
  const now = new Date(input.now);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const out: StartTrigger[] = [];
  const meetings = input.events
    .filter((e) => e.end.getTime() > now.getTime() && e.start.getTime() < midnight)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const e of meetings) out.push({ kind: "afterMeeting", eventId: eventKey(e.id), title: e.title.slice(0, MAX_TITLE) });
  const seen = new Set<string>();
  const front = input.current?.name.trim().toLowerCase() ?? null;
  for (const app of input.recentApps) {
    if (seen.size >= MAX_APP_CHOICES) break;
    const name = app.name.trim();
    const key = name.toLowerCase();
    if (name.length === 0 || seen.has(key) || key === front || isPet(app) || input.isDistracting(app, null)) continue;
    seen.add(key);
    const exe = app.exe.trim().toLowerCase();
    out.push(exe ? { kind: "appOpen", app: name, exe } : { kind: "appOpen", app: name });
  }
  if (now.getHours() < LUNCH_HOUR) out.push({ kind: "afterLunch" });
  return out;
}

const text = (x: unknown, max = MAX_TEXT): string | null => (typeof x === "string" && x.trim().length > 0 ? x.trim().slice(0, max) : null);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function triggerFromJson(x: unknown): StartTrigger | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  switch (r.kind) {
    case "afterMeeting": {
      const raw = typeof r.eventId === "string" ? r.eventId.trim() : "";
      if (!raw) return null;
      return { kind: "afterMeeting", eventId: eventKey(raw), title: typeof r.title === "string" ? r.title.slice(0, MAX_TITLE) : "" };
    }
    case "appOpen": {
      const app = text(r.app);
      const exe = text(r.exe, 64)?.toLowerCase() ?? null;
      if (!app || (!exe && app.length < MIN_APP_NAME)) return null;
      return exe ? { kind: "appOpen", app, exe } : { kind: "appOpen", app };
    }
    case "afterLunch":
      return { kind: "afterLunch" };
    default:
      return null;
  }
}

/**
 * Reads stored triggers, dropping anything malformed. A later entry for the same task and day wins. A plan stored
 * without the time it was made counts as made at `now`.
 */
export function triggersFromJson(raw: unknown, now = Date.now()): TaskTrigger[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, TaskTrigger>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const taskId = text(r.taskId);
    const trigger = triggerFromJson(r.trigger);
    if (!taskId || !isDayKey(r.day) || !trigger) continue;
    const key = `${taskId}\n${r.day}`;
    byKey.delete(key);
    byKey.set(key, { taskId, day: r.day, trigger, fired: r.fired === true, setAt: finite(r.setAt) ? r.setAt : now, notBefore: finite(r.notBefore) ? r.notBefore : null });
  }
  return [...byKey.values()].slice(-MAX_TRIGGERS);
}

/** Plain data for storage (`StorageApi.save`). */
export function triggersToJson(list: TaskTrigger[]): unknown {
  return list.slice(-MAX_TRIGGERS).map((t) => ({
    taskId: t.taskId,
    day: t.day,
    trigger: { ...t.trigger },
    fired: t.fired,
    setAt: t.setAt,
    notBefore: t.notBefore,
  }));
}
