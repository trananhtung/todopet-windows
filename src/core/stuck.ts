// Spots tasks you keep postponing (StuckTracker.swift). Todoist doesn't expose how often a task was rescheduled,
// so the pet keeps its own small log: task id → day keys it sat on your list.
import { daysBetween, dayKey } from "./dates";
import { dueDay, isRecurring, type TodoTask } from "./models";

export type SeenLog = Record<string, string[]>;

export interface StuckTask {
  task: TodoTask;
  /** Days this task has been on your list without getting done. */
  days: number;
}

/** Records today for each open task and forgets tasks not seen for 3 weeks. Returns true when the log changed. */
export function recordSeen(seen: SeenLog, tasks: TodoTask[], now: Date): boolean {
  const today = dayKey(now);
  const cutoff = dayKey(new Date(now.getTime() - 21 * 86_400_000));
  let changed = false;
  for (const t of tasks) {
    if (isRecurring(t)) continue;
    const days = seen[t.id] ?? [];
    if (!days.includes(today)) {
      seen[t.id] = [...days, today].slice(-30);
      changed = true;
    }
  }
  for (const [id, days] of Object.entries(seen)) {
    if ((days[days.length - 1] ?? "") < cutoff) {
      delete seen[id];
      changed = true;
    }
  }
  return changed;
}

/** Days on the list: what we saw ourselves, or how long it has been overdue (counting today), whichever is larger. */
export function stuckDays(seenCount: number, due: string | null, today: string): number {
  if (!due || due >= today) return seenCount;
  return Math.max(seenCount, daysBetween(due, today) + 1);
}

export function findStuck(seen: SeenLog, tasks: TodoTask[], minDays: number, now: Date): StuckTask[] {
  const today = dayKey(now);
  return tasks
    .filter((t) => !isRecurring(t))
    .map((task) => ({ task, days: stuckDays(seen[task.id]?.length ?? 0, dueDay(task), today) }))
    .filter((s) => s.days >= minDays)
    .sort((a, b) => b.days - a.days);
}

/** Pre-fills history (demo mode). */
export function pretendSeen(seen: SeenLog, id: string, days: number, now: Date): void {
  seen[id] = Array.from({ length: days }, (_, i) => dayKey(new Date(now.getTime() - (days - 1 - i) * 86_400_000)));
}
