// Todoist tasks and "today's picture" (TodoTask and DaySnapshot in Models.swift).
import type { RawStats, RawTask } from "../backend/types";
import { dayKey, parseDate, plainText } from "./dates";

export interface TodoTask {
  id: string;
  content: string;
  description: string | null;
  /** Todoist API priority: 4 = P1 (urgent) … 1 = P4 (normal). */
  priority: number;
  due: { date: string; string: string | null; isRecurring: boolean; datetime: string | null } | null;
  /** Planned length in minutes, when Todoist has one ("day" units count as 8 hours). */
  durationMinutes: number | null;
  projectId: string | null;
  parentId: string | null;
  labels: string[];
  checked: boolean;
  completedAt: string | null;
  childOrder: number | null;
  dayOrder: number | null;
}

export function taskFromRaw(r: RawTask): TodoTask {
  const d = r.duration;
  return {
    id: String(r.id),
    content: r.content ?? "",
    description: r.description ?? null,
    priority: r.priority ?? 1,
    due: r.due
      ? {
          date: r.due.date,
          string: r.due.string ?? null,
          isRecurring: r.due.is_recurring ?? false,
          datetime: r.due.datetime ?? null,
        }
      : null,
    durationMinutes: d ? (d.unit === "day" ? d.amount * 8 * 60 : d.amount) : null,
    projectId: r.project_id ?? null,
    parentId: r.parent_id ?? null,
    labels: r.labels ?? [],
    checked: r.checked ?? false,
    completedAt: r.completed_at ?? null,
    childOrder: r.child_order ?? null,
    dayOrder: r.day_order ?? null,
  };
}

export const taskTitle = (t: TodoTask): string => plainText(t.content);
/** Priority as the Todoist UI shows it: 1 = P1 … 4 = P4. */
export const uiPriority = (t: TodoTask): number => 5 - Math.min(Math.max(t.priority, 1), 4);
export const isRecurring = (t: TodoTask): boolean => t.due?.isRecurring ?? false;
/** Local calendar day the task is due ("yyyy-MM-dd"), also for fixed-timezone tasks given in UTC. */
export function dueDay(t: TodoTask): string | null {
  if (!t.due) return null;
  const time = dueTime(t);
  return time ? dayKey(time) : t.due.date.slice(0, 10);
}

/** Exact due time if the task has one ("3pm"), else null for all-day tasks. */
export function dueTime(t: TodoTask): Date | null {
  if (!t.due) return null;
  if (t.due.datetime) {
    const d = parseDate(t.due.datetime);
    if (d) return d;
  }
  return t.due.date.length > 10 ? parseDate(t.due.date) : null;
}

export const completedDate = (t: TodoTask): Date | null => parseDate(t.completedAt);

export interface Stats {
  completedCount: number;
  streak: number;
  maxStreak: number;
  dailyGoal: number | null;
  karma: number | null;
}

export function statsFromRaw(r: RawStats): Stats {
  return {
    completedCount: r.completed_count ?? 0,
    streak: r.goals?.current_daily_streak?.count ?? 0,
    maxStreak: r.goals?.max_daily_streak?.count ?? 0,
    dailyGoal: r.goals?.daily_goal ?? null,
    karma: r.karma ?? null,
  };
}

/** Today's picture, derived from what Todoist returned. */
export interface DaySnapshot {
  /** Active, due today (or undated tasks matched by the filter). */
  today: TodoTask[];
  /** Active, due before today. */
  overdue: TodoTask[];
  /** Completed today, newest first. */
  completed: TodoTask[];
  /** Due today at a time that has passed. */
  late: TodoTask[];
}

export const emptyDay = (): DaySnapshot => ({ today: [], overdue: [], completed: [], late: [] });
export const planned = (d: DaySnapshot) => d.today.length + d.completed.length;
export const remaining = (d: DaySnapshot) => d.today.length;
export const openTasks = (d: DaySnapshot) => [...d.overdue, ...d.today];

/** Open tasks in "eat the frog" order: highest priority, then earliest time, then oldest overdue. */
export function ranked(tasks: TodoTask[]): TodoTask[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    const x = dueTime(a);
    const y = dueTime(b);
    if (x && y && x.getTime() !== y.getTime()) return x.getTime() - y.getTime();
    if (x && !y) return -1;
    if (!x && y) return 1;
    const dx = dueDay(a);
    const dy = dueDay(b);
    if (dx && dy && dx !== dy) return dx < dy ? -1 : 1;
    return (a.dayOrder ?? a.childOrder ?? 0) - (b.dayOrder ?? b.childOrder ?? 0);
  });
}

/** Open tasks to work on, in order. A task that was split into open sub-steps gives way to its steps. */
export function actionable(d: DaySnapshot): TodoTask[] {
  const open = openTasks(d);
  const parents = new Set(open.map((t) => t.parentId).filter((id): id is string => id !== null));
  return ranked(open).filter((t) => !parents.has(t.id));
}

export function nextTask(d: DaySnapshot): TodoTask | null {
  return actionable(d)[0] ?? ranked(openTasks(d))[0] ?? null;
}

export function buildDay(active: TodoTask[], completed: TodoTask[], now: Date): DaySnapshot {
  const todayKey = dayKey(now);
  const s = emptyDay();
  for (const t of active) {
    if (t.checked) continue;
    const day = dueDay(t);
    if (day !== null && day < todayKey) {
      s.overdue.push(t);
    } else if (day === null || day === todayKey) {
      s.today.push(t);
      const time = dueTime(t);
      if (time && time < now) s.late.push(t);
    }
    // Tasks due later (a custom filter may return them) don't count for today.
  }
  s.today = ranked(s.today);
  s.overdue = ranked(s.overdue);
  s.completed = [...completed].sort((a, b) => ((b.completedAt ?? "") > (a.completedAt ?? "") ? 1 : -1));
  return s;
}
