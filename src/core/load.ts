// Overbooked warning and day timeline (SPEC v0.4 §4): task estimates + meetings against the work hours left.
import { busy, type CalEvent } from "./calendar";
import { atHour } from "./dates";
import { dueTime, taskTitle, type TodoTask } from "./models";

const MIN = 60_000;

/** Estimate for a task without a Todoist duration when the caller gives none that makes sense (`prefs.defaultEstimate`). */
export const DEFAULT_ESTIMATE = 30;
/** How far load may exceed capacity before the pet calls the day overbooked. */
export const OVERBOOKED_MINUTES = 60;

export interface DayLoadInput {
  /** Today's open tasks (completed ones are ignored). */
  tasks: TodoTask[];
  /** Today's events. */
  events: CalEvent[];
  now: Date | number;
  /** Work hours as in prefs: whole hours, `workEnd` may be 24. */
  workStart: number;
  workEnd: number;
  /** Minutes for a task without a Todoist duration. */
  defaultEstimate: number;
}

export interface DayLoad {
  /** Sum of the open tasks' estimates. */
  taskMinutes: number;
  /** Meeting minutes still ahead in work hours, overlaps counted once. */
  meetingMinutes: number;
  /** Work minutes left today. */
  capacity: number;
  /** How much load exceeds capacity, never below 0. */
  overBy: number;
}

const validEstimate = (minutes: number) => (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ESTIMATE);

/** The Todoist duration when set, else the default estimate. */
export function taskEstimate(task: TodoTask, defaultEstimate: number): number {
  const d = task.durationMinutes;
  return d !== null && Number.isFinite(d) && d > 0 ? d : validEstimate(defaultEstimate);
}

/** Open tasks that carry their own work: a task split into open sub-steps gives way to them (as in `actionable`). */
function workTasks(tasks: TodoTask[]): TodoTask[] {
  const open = tasks.filter((t) => !t.checked);
  const parents = new Set(open.map((t) => t.parentId).filter((id): id is string => id !== null));
  return open.filter((t) => !parents.has(t.id));
}

/** Work-day bounds on the local day of `now`, as epoch ms. */
function workDay(now: Date, workStart: number, workEnd: number): { start: number; end: number } {
  return { start: atHour(workStart, 0, now).getTime(), end: atHour(workEnd, 0, now).getTime() };
}

export function dayLoad(input: DayLoadInput): DayLoad {
  const now = new Date(input.now);
  const day = workDay(now, input.workStart, input.workEnd);
  const from = Math.max(now.getTime(), day.start);
  const taskMinutes = Math.round(workTasks(input.tasks).reduce((sum, t) => sum + taskEstimate(t, input.defaultEstimate), 0));
  if (from >= day.end) return { taskMinutes, meetingMinutes: 0, capacity: 0, overBy: taskMinutes };
  const busyMs = busy(input.events, new Date(from), new Date(day.end)).reduce((sum, i) => sum + (i.end - i.start), 0);
  const meetingMinutes = Math.round(busyMs / MIN);
  const capacity = Math.round((day.end - from) / MIN);
  return { taskMinutes, meetingMinutes, capacity, overBy: Math.max(0, taskMinutes + meetingMinutes - capacity) };
}

export const isOverbooked = (load: DayLoad): boolean => load.overBy >= OVERBOOKED_MINUTES;

export interface TimelineSegment {
  kind: "meeting" | "task";
  /** Event id or task id. */
  id: string;
  title: string;
  /** Fractions of the work day, 0 ≤ start < end ≤ 1. */
  start: number;
  end: number;
}

export interface Timeline {
  /** Meetings and timed tasks inside the work day, by start (meetings first on a tie). */
  segments: TimelineSegment[];
  /** Where now falls in the work day, clamped to 0..1. */
  now: number;
}

/** The board's day strip: meetings and timed tasks (due time + estimate) as fractions of the work day. */
export function timeline(input: DayLoadInput): Timeline {
  const now = new Date(input.now);
  const day = workDay(now, input.workStart, input.workEnd);
  const length = day.end - day.start;
  if (length <= 0) return { segments: [], now: 0 };
  const fraction = (ms: number) => Math.min(1, Math.max(0, (ms - day.start) / length));
  const segments: TimelineSegment[] = [];
  const add = (kind: TimelineSegment["kind"], id: string, title: string, start: number, end: number) => {
    const s = fraction(start);
    const e = fraction(end);
    if (s < e) segments.push({ kind, id, title, start: s, end: e });
  };
  for (const e of input.events) add("meeting", e.id, e.title, e.start.getTime(), e.end.getTime());
  for (const t of workTasks(input.tasks)) {
    const time = dueTime(t);
    if (time) add("task", t.id, taskTitle(t), time.getTime(), time.getTime() + taskEstimate(t, input.defaultEstimate) * MIN);
  }
  segments.sort((a, b) => a.start - b.start || (a.kind === b.kind ? 0 : a.kind === "meeting" ? -1 : 1));
  return { segments, now: fraction(now.getTime()) };
}
