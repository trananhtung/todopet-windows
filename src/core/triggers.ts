// If-then starts (SPEC v0.4 §5): "start this task after ⟨meeting⟩ / when I open ⟨app⟩ / after lunch".
// Stored locally for the day; each fires once.
import type { ForegroundApp } from "../backend/types";
import type { CalEvent } from "./calendar";
import { isDayKey } from "./dates";

/** Local hour from which "after lunch" holds. */
export const LUNCH_HOUR = 13;
/** Recent apps offered in the "when I open…" menu. */
export const MAX_APP_CHOICES = 3;

const MAX_TRIGGERS = 200;
const MAX_TEXT = 200;

export type StartTrigger =
  | { kind: "afterMeeting"; eventId: string; title: string }
  | { kind: "appOpen"; app: string }
  | { kind: "afterLunch" };

export interface TaskTrigger {
  taskId: string;
  /** "yyyy-MM-dd" the trigger was set for. */
  day: string;
  trigger: StartTrigger;
  fired: boolean;
}

export interface TriggerContext {
  /** Today's day key. */
  day: string;
  now: Date | number;
  /** Today's events. */
  events: CalEvent[];
  /** App in front right now. */
  app: ForegroundApp | null;
  /** Events the brain saw end (also covers meetings since dropped from the calendar). */
  endedEventIds: string[];
}

/** The pet's own window is never an "app to open". */
const isPet = (app: ForegroundApp) => app.exe.toLowerCase().startsWith("todopet") || app.name.trim().toLowerCase() === "todopet";

/** The foreground app's name (or exe) contains the trigger's app, ignoring case. An empty trigger app matches nothing. */
export function appMatches(app: ForegroundApp | null, wanted: string): boolean {
  const w = wanted.trim().toLowerCase();
  if (!app || w.length === 0) return false;
  return app.name.toLowerCase().includes(w) || app.exe.toLowerCase().includes(w);
}

function holds(trigger: StartTrigger, ctx: TriggerContext, now: Date): boolean {
  switch (trigger.kind) {
    case "afterMeeting": {
      if (ctx.endedEventIds.includes(trigger.eventId)) return true;
      const event = ctx.events.find((e) => e.id === trigger.eventId);
      return event !== undefined && event.end.getTime() <= now.getTime();
    }
    case "appOpen":
      return appMatches(ctx.app, trigger.app);
    case "afterLunch":
      return now.getHours() >= LUNCH_HOUR;
  }
}

/** Today's unfired triggers whose condition holds now, in list order. */
export function dueTriggers(list: TaskTrigger[], ctx: TriggerContext): TaskTrigger[] {
  const now = new Date(ctx.now);
  return list.filter((t) => !t.fired && t.day === ctx.day && holds(t.trigger, ctx, now));
}

/** Marks the task's trigger for `day` as fired, so it never fires again. */
export function markFired(list: TaskTrigger[], taskId: string, day: string): TaskTrigger[] {
  return list.map((t) => (t.taskId === taskId && t.day === day && !t.fired ? { ...t, fired: true } : t));
}

/** Keeps only today's triggers (fired ones too, so they don't fire again). */
export function pruneTriggers(list: TaskTrigger[], today: string): TaskTrigger[] {
  return list.filter((t) => t.day === today);
}

/** Sets (or replaces) the task's trigger for `day`: one per task per day. */
export function setTrigger(list: TaskTrigger[], taskId: string, day: string, trigger: StartTrigger): TaskTrigger[] {
  return [...list.filter((t) => !(t.taskId === taskId && t.day === day)), { taskId, day, trigger, fired: false }];
}

/** Removes the task's trigger for `day`. */
export function clearTrigger(list: TaskTrigger[], taskId: string, day: string): TaskTrigger[] {
  return list.filter((t) => !(t.taskId === taskId && t.day === day));
}

/** The task's trigger for `day`, if any (fired or not). */
export function triggerFor(list: TaskTrigger[], taskId: string, day: string): TaskTrigger | null {
  return list.find((t) => t.taskId === taskId && t.day === day) ?? null;
}

export interface TriggerChoiceInput {
  /** Today's events. */
  events: CalEvent[];
  now: Date | number;
  /** Apps recently in front, most recent first. */
  recentApps: ForegroundApp[];
  /** Same shape as `currentDistraction` in sites.ts, as a yes/no. */
  isDistracting: (app: ForegroundApp | null, url: string | null) => boolean;
}

/**
 * Options for a task's **Start when…** menu: after each meeting today that hasn't ended (by start), when I open one
 * of up to 3 recent non-distracting apps, and after lunch while it is still before 13:00.
 */
export function triggerChoices(input: TriggerChoiceInput): StartTrigger[] {
  const now = new Date(input.now);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const out: StartTrigger[] = [];
  const meetings = input.events
    .filter((e) => e.end.getTime() > now.getTime() && e.start.getTime() < midnight)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const e of meetings) out.push({ kind: "afterMeeting", eventId: e.id, title: e.title });
  const seen = new Set<string>();
  for (const app of input.recentApps) {
    if (seen.size >= MAX_APP_CHOICES) break;
    const name = app.name.trim();
    const key = name.toLowerCase();
    if (name.length === 0 || seen.has(key) || isPet(app) || input.isDistracting(app, null)) continue;
    seen.add(key);
    out.push({ kind: "appOpen", app: name });
  }
  if (now.getHours() < LUNCH_HOUR) out.push({ kind: "afterLunch" });
  return out;
}

const text = (x: unknown): string | null => (typeof x === "string" && x.trim().length > 0 ? x.trim().slice(0, MAX_TEXT) : null);

function triggerFromJson(x: unknown): StartTrigger | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  switch (r.kind) {
    case "afterMeeting": {
      const eventId = text(r.eventId);
      return eventId ? { kind: "afterMeeting", eventId, title: typeof r.title === "string" ? r.title.slice(0, MAX_TEXT) : "" } : null;
    }
    case "appOpen": {
      const app = text(r.app);
      return app ? { kind: "appOpen", app } : null;
    }
    case "afterLunch":
      return { kind: "afterLunch" };
    default:
      return null;
  }
}

/** Reads stored triggers, dropping anything malformed. A later entry for the same task and day wins. */
export function triggersFromJson(raw: unknown): TaskTrigger[] {
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
    byKey.set(key, { taskId, day: r.day, trigger, fired: r.fired === true });
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
  }));
}
