// In-memory backend for the browser demo (`?demo`), the dev hub and tests: sample tasks, a fake calendar,
// and OS samples simulated from the page's own mouse and keyboard.
import type {
  AppCommand,
  Backend,
  BusEvent,
  CursorSample,
  ExtraWindow,
  ForegroundApp,
  RawStats,
  RawTask,
  SystemSample,
  Unsubscribe,
} from "./types";
import { getLang } from "../core/l10n";
import { demoLife } from "../core/life";
import { BackendError } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localStamp = (d: Date) => `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const icsStamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

class Emitter<T> {
  private fns = new Set<(v: T) => void>();
  on(fn: (v: T) => void): Unsubscribe {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  emit(v: T): void {
    for (const fn of this.fns) fn(v);
  }
}

/** Hooks for the demo control panel (and tests) to fake what Windows would report. */
export interface DemoControls {
  /** Pretend this app (and tab address) is in front, or null for "a work app". */
  setForeground(app: ForegroundApp | null, url?: string | null): void;
  /** Pretend the user has been away (idle) for this many seconds. */
  setIdle(seconds: number): void;
  command(c: AppCommand): void;
  /** Give today's tasks long Todoist durations (about 11 hours in all), so the overbooked warning has something to say. */
  setHeavyDay(on: boolean): void;
}

export interface DemoBackend extends Backend {
  demo: DemoControls;
}

const storageAvailable = (() => {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
})();

export function sampleTasks(now: Date): RawTask[] {
  const today = localDay(now);
  const soon = new Date(now);
  soon.setHours(now.getHours() + 1, 0, 0, 0);
  const threeDaysAgo = localDay(new Date(now.getTime() - 3 * 86_400_000));
  // In the app's language (set by the Brain before the first sync), not the browser's.
  const vi = getLang() === "vi";
  return [
    { id: "1", content: vi ? "Viết báo cáo tuần" : "Write the weekly report", priority: 4, due: { date: today, string: "today" } },
    { id: "2", content: vi ? "Gọi cho khách hàng ABC" : "Call client ABC", priority: 3, due: { date: localStamp(soon), string: "today", datetime: null } },
    { id: "4", content: vi ? "Lên kế hoạch sprint tới" : "Plan the next sprint", priority: 2, due: { date: today, string: "today" } },
    {
      id: "3",
      content: vi ? "Trả lời email của sếp" : "Reply to the boss's email",
      description: vi ? "Hỏi về ngân sách quý 4" : "About the Q4 budget",
      priority: 1,
      due: { date: threeDaysAgo, string: "Monday" },
    },
  ];
}

/** One task already done today, so the demo opens on a good day (planned, a little progress) rather than a grumpy one. */
export function sampleDone(now: Date): RawTask[] {
  const vi = getLang() === "vi";
  const done = new Date(now.getTime() - 50 * 60_000);
  return [{ id: "5", content: vi ? "Duyệt bản thiết kế" : "Review the design mockups", priority: 2, checked: true, completed_at: done.toISOString(), due: { date: localDay(now), string: "today" } }];
}

export function demoIcs(now: Date): string {
  const at = (h: number, m = 0) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const h = now.getHours();
  const vi = getLang() === "vi";
  const events = [
    { uid: "demo-1", title: vi ? "Họp nhóm" : "Team sync", start: at(h + 1), end: at(h + 2), desc: "Join: https://meet.google.com/abc-defg-hij" },
    { uid: "demo-2", title: vi ? "Gặp khách hàng" : "Client meeting", start: at(h + 4), end: at(h + 4, 45), desc: "" },
  ];
  const body = events
    .filter((e) => e.start.getDate() === now.getDate())
    .map((e) =>
      [
        "BEGIN:VEVENT",
        `UID:${e.uid}`,
        `DTSTAMP:${icsStamp(now)}`,
        `DTSTART:${icsStamp(e.start)}`,
        `DTEND:${icsStamp(e.end)}`,
        `SUMMARY:${e.title}`,
        e.desc ? `DESCRIPTION:${e.desc}` : "",
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n"),
    )
    .join("\r\n");
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TodoPet//Demo//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;
}

const pause = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** Minutes for today's tasks on the demo's "heavy day": more than a work day, even before the meetings. */
const HEAVY_MINUTES: Readonly<Record<string, number>> = { "1": 240, "2": 180, "4": 240 };

export function createDemoBackend(opts: { now?: () => number; persist?: boolean } = {}): DemoBackend {
  const now = opts.now ?? Date.now;
  const persist = (opts.persist ?? true) && storageAvailable;
  // Created on the first sync, once the Brain has picked the app language.
  let active: RawTask[] | null = null;
  const tasksNow = () => (active ??= sampleTasks(new Date(now())));
  let doneList: RawTask[] | null = null;
  const doneNow = () => (doneList ??= sampleDone(new Date(now())));
  let counter = 100;
  let autostart = false;
  let heavyDay = false;
  // The demo starts connected; Settings can disconnect and reconnect to try those flows.
  const secrets = { todoist: true, anthropic: true, calendarHosts: ["demo.todopet"] };
  const memoryStore = new Map<string, unknown>();
  const memoryDiary = new Map<string, string[]>();

  const samples = new Emitter<SystemSample>();
  const cursors = new Emitter<CursorSample>();
  const commands = new Emitter<AppCommand>();
  const busLocal = new Emitter<BusEvent>();
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("todopet-bus") : null;
  channel?.addEventListener("message", (e: MessageEvent<BusEvent>) => busLocal.emit(e.data));

  // Simulated OS state, driven by the page itself and the demo controls.
  let lastKey = 0;
  let lastInput = now();
  let fakeIdle = 0;
  let front: ForegroundApp | null = { name: "Visual Studio Code", exe: "code.exe", title: "brain.ts — todopet" };
  let frontUrl: string | null = null;
  let switchedAt = now();
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", () => {
      lastKey = now();
      lastInput = now();
    });
    window.addEventListener("mousemove", (e) => {
      lastInput = now();
      cursors.emit({ x: e.clientX, y: e.clientY });
    });
    setInterval(() => {
      samples.emit({
        app: front,
        url: frontUrl,
        idleSeconds: Math.max(fakeIdle, (now() - lastInput) / 1000),
        secondsSinceKey: lastKey ? (now() - lastKey) / 1000 : 999,
        fullscreen: false,
        appSwitchedAt: switchedAt,
      });
    }, 1000);
  }

  const find = (id: string) => tasksNow().findIndex((t) => t.id === id);
  /** Tasks moved off today's list (to a later day or no date). */
  const elsewhere: RawTask[] = [];

  const backend: DemoBackend = {
    kind: "demo",
    todoist: {
      async tasks() {
        await pause();
        const list = structuredClone(tasksNow());
        return heavyDay ? list.map((t) => (HEAVY_MINUTES[t.id] ? { ...t, duration: { amount: HEAVY_MINUTES[t.id], unit: "minute" } } : t)) : list;
      },
      async completed(sinceIso, untilIso) {
        await pause();
        // Like Todoist: only the tasks finished in that time range.
        const since = Date.parse(sinceIso);
        const until = Date.parse(untilIso);
        return structuredClone(
          doneNow().filter((t) => {
            const at = Date.parse(t.completed_at ?? "");
            return !(at < since) && !(at >= until);
          }),
        );
      },
      async stats(): Promise<RawStats> {
        return { completed_count: 42 + doneNow().length, goals: { daily_goal: 3, current_daily_streak: { count: 4 }, max_daily_streak: { count: 9 } }, karma: 1234 };
      },
      async add({ content, dueString, priority, parentId }) {
        await pause();
        counter += 1;
        const d = new Date(now());
        const day = dueString === "today" ? localDay(d) : dueString === "tomorrow" ? localDay(new Date(d.getTime() + 86_400_000)) : null;
        const t: RawTask = { id: String(counter), content, priority, parent_id: parentId, due: day ? { date: day, string: dueString } : null };
        // Tomorrow's tasks don't match "today | overdue"; undated sub-steps stay visible like Todoist's filter would not.
        if (day === localDay(d)) tasksNow().push(t);
        return structuredClone(t);
      },
      async quickAdd(text) {
        await backend.todoist.add({ content: text, dueString: "today", priority: 1, parentId: null });
      },
      async close(id) {
        await pause();
        const i = find(id);
        if (i < 0) return;
        const [t] = tasksNow().splice(i, 1);
        doneNow().push({ ...t, checked: true, completed_at: new Date(now()).toISOString() });
      },
      async reopen(id) {
        await pause();
        const list = doneNow();
        const i = list.findIndex((t) => t.id === id);
        if (i < 0) return;
        const [t] = list.splice(i, 1);
        tasksNow().push({ ...t, checked: false, completed_at: null });
      },
      async reschedule(id, dueString) {
        await pause();
        const d = new Date(now());
        const today = localDay(d);
        const list = tasksNow();
        // A task moved off today's list earlier (tomorrow, a later day, no date) can come back, as after an Undo.
        let i = find(id);
        if (i < 0) {
          const j = elsewhere.findIndex((t) => t.id === id);
          if (j < 0) return;
          list.push(...elsewhere.splice(j, 1));
          i = list.length - 1;
        }
        const date = dueString === "tomorrow" ? localDay(new Date(d.getTime() + 86_400_000)) : /^\d{4}-\d{2}-\d{2}$/.test(dueString) ? dueString : null;
        if (dueString === "no date" || (date !== null && date > today)) {
          // Off the "today | overdue" filter.
          const [t] = list.splice(i, 1);
          elsewhere.push({ ...t, due: date ? { date, string: dueString } : null });
        } else if (date !== null) {
          list[i] = { ...list[i], due: { date, string: dueString } };
        } else if (dueString.startsWith("today at ")) {
          list[i] = { ...list[i], due: { date: `${today}T${dueString.split(" ").pop()}:00`, string: dueString } };
        } else {
          list[i] = { ...list[i], due: { date: today, string: dueString } };
        }
      },
      async remove(id) {
        await pause();
        active = tasksNow().filter((t) => t.id !== id && t.parent_id !== id);
      },
    },
    secrets: {
      async status() {
        return { ...secrets, calendarHosts: [...secrets.calendarHosts] };
      },
      async setTodoistToken(token) {
        if (token.trim().length < 8) throw new BackendError({ kind: "unauthorized", message: "invalid token" });
        secrets.todoist = true;
      },
      async clearTodoistToken() {
        secrets.todoist = false;
      },
      async setAnthropicKey(key) {
        secrets.anthropic = key !== null && key.trim().length > 0;
      },
      async setCalendarLinks(links) {
        const hosts: string[] = [];
        for (const raw of links.slice(0, 10)) {
          try {
            const u = new URL(raw.trim().replace(/^webcal:/i, "https:"));
            if (u.protocol !== "https:") throw new Error("https only");
            if (!hosts.includes(u.hostname)) hosts.push(u.hostname);
          } catch {
            throw new BackendError({ kind: "invalid", message: `Not a calendar link: ${raw.slice(0, 40)}` });
          }
        }
        secrets.calendarHosts = hosts;
      },
    },
    claude: {
      async splitTask({ title, lang }) {
        await pause(900);
        const t = title.length > 40 ? `${title.slice(0, 39)}…` : title;
        return lang === "vi"
          ? [`Mở “${t}” và ghi ra cần những gì`, "Làm 15 phút đầu tiên, phần dễ nhất", "Làm tiếp phần chính trong 25 phút", "Rà lại và ghi bước tiếp theo"]
          : [`Open “${t}” and list what it needs`, "Do the easiest 15 minutes first", "Work on the main part for 25 minutes", "Review and note the next step"];
      },
    },
    calendar: {
      async fetchIcs() {
        return secrets.calendarHosts.map((host) => ({ host, ok: true, text: demoIcs(new Date(now())) }));
      },
    },
    system: {
      onSample: (cb) => samples.on(cb),
      onCursor: (cb) => cursors.on(cb),
      onCommand: (cb) => commands.on(cb),
      async setClickThrough() {},
      async focusOverlay() {},
      async releaseOverlayFocus() {},
      async setTrayStatus(tooltip) {
        if (typeof document !== "undefined" && document.body.classList.contains("overlay")) document.title = tooltip;
      },
      async setTrayLabels() {},
      async openUrl(url) {
        if (/^(https?|msteams|zoommtg):/i.test(url)) window.open(url, "_blank", "noopener");
      },
      async openWindow(which: ExtraWindow) {
        window.open(`/${which}.html?demo`, `todopet-${which}`, "width=640,height=760");
      },
      async getAutostart() {
        return autostart;
      },
      async setAutostart(on) {
        autostart = on;
      },
      async systemLocale() {
        return typeof navigator !== "undefined" ? navigator.language : "en-US";
      },
      async quit() {},
    },
    storage: {
      async load<T>(key: string): Promise<T | null> {
        const seeded = key === "life" ? (demoLife() as T) : null;
        if (!persist) return (memoryStore.get(key) as T) ?? seeded;
        try {
          const raw = localStorage.getItem(`todopet:${key}`);
          return raw ? (JSON.parse(raw) as T) : seeded;
        } catch {
          return null;
        }
      },
      async save(key, value) {
        if (!persist) {
          memoryStore.set(key, structuredClone(value));
          return;
        }
        try {
          localStorage.setItem(`todopet:${key}`, JSON.stringify(value));
        } catch {
          memoryStore.set(key, value);
        }
      },
    },
    diary: {
      async append(day, line) {
        const lines = memoryDiary.get(day) ?? [];
        lines.push(line);
        memoryDiary.set(day, lines);
        if (persist) {
          try {
            localStorage.setItem(`todopet:diary:${day}`, JSON.stringify(lines.slice(-500)));
          } catch {
            // Storage full: the in-memory copy still works.
          }
        }
      },
      async read(day) {
        if (persist) {
          try {
            const raw = localStorage.getItem(`todopet:diary:${day}`);
            if (raw) return JSON.parse(raw) as string[];
          } catch {
            // Fall back to memory.
          }
        }
        return memoryDiary.get(day) ?? [];
      },
      async days() {
        const keys = new Set(memoryDiary.keys());
        if (persist) {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith("todopet:diary:")) keys.add(k.slice("todopet:diary:".length));
          }
        }
        return [...keys].sort().reverse();
      },
    },
    bus: {
      async emit(e) {
        busLocal.emit(e);
        channel?.postMessage(e);
      },
      on: (cb) => busLocal.on(cb),
    },
    demo: {
      setForeground(app, url = null) {
        front = app ?? { name: "Visual Studio Code", exe: "code.exe", title: "brain.ts — todopet" };
        frontUrl = url;
        switchedAt = now();
      },
      setIdle(seconds) {
        fakeIdle = seconds;
      },
      command(c) {
        commands.emit(c);
      },
      setHeavyDay(on) {
        heavyDay = on;
      },
    },
  };
  return backend;
}
