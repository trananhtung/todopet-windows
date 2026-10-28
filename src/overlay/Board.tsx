import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { Backend } from "../backend/types";
import { errorMessage, type Brain, type BrainState, type DueChoice } from "../core/brain";
import { currentEvent, freeMinutes } from "../core/calendar";
import { atHour, daysAgo, dayKey, hoursText, timeString } from "../core/dates";
import { getLang, L } from "../core/l10n";
import * as life from "../core/life";
import * as lines from "../core/lines";
import { dueDay, dueTime, isRecurring, planned, taskTitle, uiPriority, type TodoTask } from "../core/models";
import { moodEmoji, moodLabel } from "../core/mood";
import { ACCESSORIES, SPECIES_IDS } from "../core/types";
import { defaultPose, renderPet, speciesInfo } from "../pets";
import type { BoardRequest } from "./App";

type View = { kind: "main" } | { kind: "split"; task: TodoTask } | { kind: "wardrobe" };

const PRIO_VAR = ["", "var(--p1)", "var(--p2)", "var(--p3)", "var(--p4)"];

export function Board(props: {
  brain: Brain;
  backend: Backend;
  request: BoardRequest;
  anchor: { x: number; top: number };
  stageRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onOpenSplit: (t: TodoTask) => void;
}) {
  const { brain, backend, request, anchor, stageRef, onClose } = props;
  const s = useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [view, setView] = useState<View>(request.split ? { kind: "split", task: request.split } : { kind: "main" });

  useEffect(() => {
    if (request.split) setView({ kind: "split", task: request.split });
    else if (request.focusAdd) setView({ kind: "main" });
  }, [request]);

  // Fresh data whenever the board opens (like clicking the macOS pet).
  useEffect(() => {
    void brain.refresh();
  }, [brain, request.seq]);

  const W = stageRef.current?.clientWidth ?? window.innerWidth;
  const H = stageRef.current?.clientHeight ?? window.innerHeight;
  const width = Math.min(404, W - 16);
  const height = Math.max(320, Math.min(660, anchor.top - 16, H - 24));
  const left = Math.min(Math.max(anchor.x - width / 2, 8), W - width - 8);
  const top = Math.max(8, Math.min(anchor.top - height - 8, H - height - 8));

  return (
    <section className="board" data-hit="" style={{ left, top, width, height }} aria-label={L("Bảng việc", "Task board")}>
      <Header s={s} brain={brain} backend={backend} onClose={onClose} onWardrobe={() => setView({ kind: "wardrobe" })} />
      <div className="board-body">
        {!s.hasToken ? (
          <Connect brain={brain} backend={backend} error={s.errorText} />
        ) : view.kind === "split" ? (
          <SplitSheet brain={brain} s={s} task={view.task} onDone={() => setView({ kind: "main" })} />
        ) : view.kind === "wardrobe" ? (
          <Wardrobe brain={brain} s={s} onBack={() => setView({ kind: "main" })} />
        ) : (
          <Main brain={brain} backend={backend} s={s} focusAdd={request.focusAdd} seq={request.seq} onSplit={(task) => setView({ kind: "split", task })} />
        )}
      </div>
      <Footer brain={brain} backend={backend} s={s} />
    </section>
  );
}

function Header({ s, brain, backend, onClose, onWardrobe }: { s: BrainState; brain: Brain; backend: Backend; onClose: () => void; onWardrobe: () => void }) {
  const info = speciesInfo(s.prefs.species);
  const avatar = useMemo(
    () =>
      renderPet(s.prefs.species, defaultPose({ mood: s.mood === "celebrating" ? "happy" : s.mood, t: 1.3, stage: life.stageOf(s.life.xp), wearing: s.life.wearing }), {
        size: 64,
        idPrefix: "avatar",
      }),
    [s.prefs.species, s.mood, s.life.xp, s.life.wearing],
  );
  const color = s.score >= 75 ? "var(--good)" : s.score >= 50 ? "var(--accent)" : s.score >= 30 ? "var(--warn)" : "var(--bad)";
  return (
    <header className="board-head">
      <div className="board-avatar" aria-hidden dangerouslySetInnerHTML={{ __html: avatar }} />
      <div className="board-title">
        <h1>
          {s.prefs.petName} <small>{info.emoji} {info.name[getLang()]}</small>
        </h1>
        <div className="mood-line" tabIndex={0} aria-label={L("Vì sao pet thấy vậy", "Why the pet feels this way")}>
          <span>
            {moodEmoji(s.mood)} {moodLabel(s.mood)}
          </span>
          <span className="score" aria-hidden>
            <i style={{ width: `${s.score}%`, background: color }} />
          </span>
          <b style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(s.score)}</b>
          <div className="reasons" role="tooltip">
            <div className="muted" style={{ marginBottom: 6 }}>
              {L("Điểm vui bắt đầu từ 60:", "Happiness starts at 60:")}
            </div>
            {s.reasons.length === 0 ? (
              <div>{L("Chưa có gì đặc biệt.", "Nothing special yet.")}</div>
            ) : (
              <ul>
                {s.reasons.map((r) => (
                  <li key={r.text}>
                    <b className={r.delta > 0 ? "up" : "down"}>
                      {r.delta > 0 ? "+" : ""}
                      {r.delta}
                    </b>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="head-tools">
        <button className="btn ghost icon" title={L("Tủ đồ & thành tích", "Wardrobe & achievements")} aria-label={L("Tủ đồ", "Wardrobe")} onClick={onWardrobe}>
          🎀
        </button>
        <button className="btn ghost icon" title={L("Nhật ký của pet", "Pet diary")} aria-label={L("Nhật ký", "Diary")} onClick={() => void backend.system.openWindow("diary")}>
          📜
        </button>
        <button className="btn ghost icon" title={L("Cài đặt", "Settings")} aria-label={L("Cài đặt", "Settings")} onClick={() => void backend.system.openWindow("settings")}>
          ⚙️
        </button>
        <button className="btn ghost icon" title={L("Đóng (Esc)", "Close (Esc)")} aria-label={L("Đóng", "Close")} onClick={onClose}>
          ✕
        </button>
      </div>
      {brain.getSnapshot().loading && <span className="sr-only">{L("Đang đồng bộ", "Syncing")}</span>}
    </header>
  );
}

function Connect({ brain, backend, error }: { brain: Brain; backend: Backend; error: string | null }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    await brain.setToken(token);
    setBusy(false);
  };
  return (
    <div className="connect">
      <h2>{L("Kết nối Todoist", "Connect Todoist")}</h2>
      <p>{L("Mình đọc việc hôm nay của bạn để nhắc đúng lúc. Token chỉ lưu trong Windows Credential Manager.", "I read today's tasks so I can nudge you at the right time. The token is kept in Windows Credential Manager only.")}</p>
      <ol>
        <li>
          {L("Mở Todoist → Cài đặt → Tích hợp → Nhà phát triển", "Open Todoist → Settings → Integrations → Developer")}{" "}
          <button className="btn ghost small" onClick={() => void backend.system.openUrl("https://app.todoist.com/app/settings/integrations/developer")}>
            {L("Mở ↗", "Open ↗")}
          </button>
        </li>
        <li>{L("Sao chép API token và dán vào đây.", "Copy the API token and paste it here.")}</li>
      </ol>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="sr-only" htmlFor="token">
          API token
        </label>
        <input id="token" className="field" type="password" autoComplete="off" spellCheck={false} placeholder="API token" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="btn primary" disabled={busy || token.trim().length === 0}>
          {busy ? "…" : L("Lưu & kết nối", "Save & connect")}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function Main({ brain, backend, s, focusAdd, seq, onSplit }: { brain: Brain; backend: Backend; s: BrainState; focusAdd: boolean; seq: number; onSplit: (t: TodoTask) => void }) {
  const day = s.day;
  const stuckIds = new Map(s.stuck.map((x) => [x.task.id, x.days]));
  const done = day.completed.length;
  const stage = life.stageOf(s.life.xp);
  const nextXp = life.nextStageXp(stage);
  const base = life.STAGE_THRESHOLDS[stage];
  return (
    <>
      <div className="progress-strip">
        <div className="stat" title={L("Việc xong hôm nay / mục tiêu", "Done today / target")}>
          {L("Hôm nay", "Today")}
          <b>
            {done}/{s.target}
          </b>
          <div className="meter">
            <i style={{ width: `${Math.min(100, (done / Math.max(1, s.target)) * 100)}%`, background: "var(--good)" }} />
          </div>
        </div>
        <div className="stat" title={L("Độ no: mỗi việc xong +25%", "Fullness: each finished task +25%")}>
          🍙 {L("No", "Full")}
          <b>{Math.round(s.life.satiety)}%</b>
          <div className="meter">
            <i style={{ width: `${s.life.satiety}%`, background: s.life.satiety < 30 ? "var(--bad)" : "var(--accent)" }} />
          </div>
        </div>
        <div className="stat" title={`${s.life.xp} XP`}>
          ⭐ {life.stageName(stage)}
          <b>{s.life.xp} XP</b>
          <div className="meter">
            <i style={{ width: nextXp ? `${((s.life.xp - base) / (nextXp - base)) * 100}%` : "100%", background: "var(--gold)" }} />
          </div>
        </div>
        <div className="stat" title={L("Chuỗi ngày đạt mục tiêu (pet) · chuỗi Todoist", "Goal streak (pet) · Todoist streak")}>
          🔥 {L("Chuỗi", "Streak")}
          <b>
            {s.life.streak}
            {s.stats ? <span className="muted"> · {s.stats.streak}</span> : null}
          </b>
          {s.life.dirt > 0 && <div style={{ fontSize: 11 }}>{"🪰".repeat(s.life.dirt)}</div>}
        </div>
      </div>

      {s.focus && <FocusCard brain={brain} s={s} />}

      <AddTask brain={brain} focusAdd={focusAdd} seq={seq} />

      <CalendarCard brain={brain} backend={backend} s={s} />

      {day.overdue.length > 0 && (
        <div className="section">
          <h2>
            {L("Quá hạn", "Overdue")} <span className="chip late">{day.overdue.length}</span>
            <span className="spacer" />
            <button className="btn small" onClick={() => void brain.pullOverdueToToday()}>
              {L("Dời hết vào hôm nay", "Move all to today")}
            </button>
          </h2>
          <ul className="tasks">
            {day.overdue.map((t) => (
              <TaskRow key={t.id} t={t} brain={brain} s={s} stuckDays={stuckIds.get(t.id)} onSplit={onSplit} />
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <h2>
          {L("Hôm nay", "Today")} <span className="chip">{day.today.length}</span>
          <span className="spacer" />
          {planned(day) < s.target && <span className="chip stuck">{L(`thiếu ${s.target - planned(day)} việc`, `${s.target - planned(day)} to plan`)}</span>}
        </h2>
        {day.today.length === 0 ? (
          <div className="tasks empty">{done > 0 ? L("Xong hết rồi! 🎉", "All done! 🎉") : L("Chưa có việc nào. Thêm 3 việc quan trọng nhất nhé.", "Nothing yet. Add your 3 most important tasks.")}</div>
        ) : (
          <ul className="tasks">
            {day.today.map((t) => (
              <TaskRow key={t.id} t={t} brain={brain} s={s} stuckDays={stuckIds.get(t.id)} onSplit={onSplit} />
            ))}
          </ul>
        )}
      </div>

      {day.completed.length > 0 && (
        <div className="section">
          <h2>
            {L("Đã xong", "Done")} <span className="chip frog">{day.completed.length}</span>
          </h2>
          <ul className="tasks">
            {day.completed.map((t) => (
              <li key={t.id} className="task done">
                <button className="check" aria-label={L("Hoàn tác", "Undo")} title={L("Hoàn tác", "Undo")} onClick={() => void brain.undoComplete(t)}>
                  ✓
                </button>
                <div className="t-title">{taskTitle(t)}</div>
                <span />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function TaskRow({ t, brain, s, stuckDays, onSplit }: { t: TodoTask; brain: Brain; s: BrainState; stuckDays?: number; onSplit: (t: TodoTask) => void }) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const time = dueTime(t);
  const day = dueDay(t);
  const today = dayKey(new Date());
  const late = time !== null && time < new Date();
  const prio = uiPriority(t);
  return (
    <li className="task" style={{ ["--prio" as string]: PRIO_VAR[prio] }}>
      <button className="check" aria-label={L(`Xong: ${taskTitle(t)}`, `Complete: ${taskTitle(t)}`)} onClick={() => void brain.complete(t)}>
        ✓
      </button>
      <div>
        <div className="t-title">{taskTitle(t)}</div>
        <div className="t-meta">
          {s.next?.id === t.id && <span className="chip frog">🐸 {L("làm trước", "do first")}</span>}
          {prio < 4 && <span className="chip" style={{ color: PRIO_VAR[prio] }}>P{prio}</span>}
          {time && <span className={`chip${late ? " late" : ""}`}>⏰ {timeString(time)}</span>}
          {day && day < today && <span className="chip late">{daysAgo(day)}</span>}
          {stuckDays !== undefined && <span className="chip stuck">⏳ {L(`${stuckDays} ngày`, `${stuckDays} days`)}</span>}
          {isRecurring(t) && <span className="chip">🔁</span>}
          {t.parentId && <span className="chip">↳ {L("bước nhỏ", "step")}</span>}
        </div>
      </div>
      <div className="t-actions">
        <button className="btn ghost icon" title={L("Tập trung", "Focus")} aria-label={L("Tập trung", "Focus")} onClick={() => brain.startFocus(t)}>
          ▶
        </button>
        <button className="btn ghost icon" title={L("Chia nhỏ", "Split")} aria-label={L("Chia nhỏ", "Split")} onClick={() => onSplit(t)}>
          ✂️
        </button>
        <button className="btn ghost icon" title={L("Dời", "Move")} aria-label={L("Dời", "Move")} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          →
        </button>
        <button className="btn ghost icon danger" title={L("Xoá", "Delete")} aria-label={L("Xoá", "Delete")} onClick={() => setConfirm(true)}>
          🗑
        </button>
      </div>
      {menu && (
        <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
          {(
            [
              ["today", L("Hôm nay", "Today")],
              ["tomorrow", L("Ngày mai", "Tomorrow")],
              ["no date", L("Bỏ khỏi kế hoạch (không hạn)", "Off the plan (no date)")],
            ] as const
          ).map(([due, label]) => (
            <button
              key={due}
              role="menuitem"
              onClick={() => {
                setMenu(false);
                if (due === "no date") void brain.unplan(t);
                else void brain.reschedule(t, due);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div className="confirm" role="alertdialog">
          <span>{lines.confirmDelete(t)}</span>
          <button className="btn small" onClick={() => setConfirm(false)}>
            {L("Huỷ", "Cancel")}
          </button>
          <button
            className="btn small danger solid"
            onClick={() => {
              setConfirm(false);
              void brain.remove(t);
            }}
          >
            {L("Xoá", "Delete")}
          </button>
        </div>
      )}
    </li>
  );
}

function AddTask({ brain, focusAdd, seq }: { brain: Brain; focusAdd: boolean; seq: number }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState<DueChoice>("today");
  const [prio, setPrio] = useState(4);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusAdd) input.current?.focus();
  }, [focusAdd, seq]);
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const ok = await brain.add(text, due, 5 - prio);
    setBusy(false);
    if (ok) setText("");
  };
  const dues: [DueChoice, string][] = [
    ["today", L("Hôm nay", "Today")],
    ["tomorrow", L("Mai", "Tomorrow")],
    ["none", L("Không hạn", "No date")],
    ["smart", "✨"],
  ];
  return (
    <form
      className="add"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="add-row">
        <label className="sr-only" htmlFor="add-task">
          {L("Việc mới", "New task")}
        </label>
        <input
          id="add-task"
          ref={input}
          className="field"
          placeholder={due === "smart" ? L("Gọi Anna 3pm p1 #Work", "Call Anna 3pm p1 #Work") : L("Thêm việc…", "Add a task…")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary" disabled={busy || !text.trim()}>
          {busy ? "…" : L("Thêm", "Add")}
        </button>
      </div>
      <div className="add-opts">
        <div className="seg" role="group" aria-label={L("Hạn", "Due")}>
          {dues.map(([d, label]) => (
            <button key={d} type="button" aria-pressed={due === d} title={d === "smart" ? L("Cú pháp Todoist", "Todoist syntax") : undefined} onClick={() => setDue(d)}>
              {label}
            </button>
          ))}
        </div>
        {due !== "smart" && (
          <div className="prio" role="group" aria-label={L("Độ ưu tiên", "Priority")}>
            {[1, 2, 3, 4].map((p) => (
              <button key={p} type="button" aria-pressed={prio === p} style={{ color: PRIO_VAR[p] }} onClick={() => setPrio(p)}>
                P{p}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

function FocusCard({ brain, s }: { brain: Brain; s: BrainState }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const f = s.focus!;
  const left = Math.max(0, Math.round((f.end - Date.now()) / 1000));
  return (
    <div className="focus-card">
      <span className="clock">
        {f.isBreak ? "☕" : "🍅"} {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
      </span>
      <span className="what">{f.isBreak ? L("Đang nghỉ", "On a break") : f.task ? taskTitle(f.task) : L("Đang tập trung", "Focusing")}</span>
      <button className="btn small" onClick={() => brain.stopFocus()}>
        {L("Dừng", "Stop")}
      </button>
    </div>
  );
}

function CalendarCard({ brain, backend, s }: { brain: Brain; backend: Backend; s: BrainState }) {
  if (!s.prefs.useCalendar || s.events.length === 0) return null;
  const now = new Date();
  const start = atHour(s.prefs.workStart, 0, now);
  const end = atHour(s.prefs.workEnd, 0, now);
  const free = freeMinutes(s.events, start, end);
  const current = currentEvent(s.events, now);
  return (
    <div className="cal">
      <div className="muted" style={{ marginBottom: 4 }}>
        📅 {L(`${s.events.length} cuộc họp · còn ${hoursText(free)} trống`, `${s.events.length} meeting(s) · ${hoursText(free)} free`)}
        {s.target < s.prefs.dailyTarget && L(` · mục tiêu ${s.target} việc`, ` · target ${s.target}`)}
      </div>
      {s.events.map((e) => (
        <div key={e.id} className={`cal-row${current?.id === e.id ? " now" : ""}`}>
          <time>
            {timeString(e.start)}–{timeString(e.end)}
          </time>
          <span className="what">{e.title}</span>
          {e.joinUrl && e.end > now && (
            <button className="btn small" onClick={() => void backend.system.openUrl(e.joinUrl!)}>
              {L("Vào ↗", "Join ↗")}
            </button>
          )}
        </div>
      ))}
      {s.suggestions.length > 0 && (
        <>
          <div className="muted" style={{ margin: "6px 0 2px" }}>
            {L("Gợi ý khung giờ:", "Suggested time blocks:")}
          </div>
          {s.suggestions.map((sg) => (
            <div key={sg.task.id} className="cal-row">
              <time>
                {timeString(sg.start)}–{timeString(sg.end)}
              </time>
              <span className="what">{taskTitle(sg.task)}</span>
              <button className="btn small" onClick={() => void brain.schedule(sg)}>
                ⏰ {L("Đặt giờ", "Set time")}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SplitSheet({ brain, s, task, onDone }: { brain: Brain; s: BrainState; task: TodoTask; onDone: () => void }) {
  const title = taskTitle(task);
  const [steps, setSteps] = useState<string[]>(["", "", ""]);
  const [firstToday, setFirstToday] = useState(true);
  const [busy, setBusy] = useState<"ask" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const template = () =>
    setSteps([
      L(`Mở và xem lại “${title}” (5 phút)`, `Open and review “${title}” (5 min)`),
      L("Viết ra kết quả mong muốn trong 1 câu", "Write the desired outcome in one sentence"),
      L("Làm 25 phút đầu tiên", "Do the first 25 minutes"),
      L("Ghi lại bước tiếp theo", "Note the next step"),
    ]);
  const ask = async () => {
    setBusy("ask");
    setError(null);
    try {
      setSteps(await brain.suggestSteps(task));
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(null);
  };
  const save = async () => {
    setBusy("save");
    const ok = await brain.split(task, steps, firstToday);
    setBusy(null);
    if (ok) onDone();
    else setError(brain.getSnapshot().errorText ?? L("Không lưu được.", "Couldn't save."));
  };
  const days = s.stuck.find((x) => x.task.id === task.id)?.days;
  return (
    <div className="sheet">
      <div>
        <button className="btn ghost small" onClick={onDone}>
          ← {L("Quay lại", "Back")}
        </button>
      </div>
      <h2>✂️ {L("Chia nhỏ việc", "Split the task")}</h2>
      <div className="muted">
        “{title}”{days ? L(` · nằm trong danh sách ${days} ngày`, ` · on your list for ${days} days`) : ""}
      </div>
      <p style={{ margin: 0, fontSize: 13 }}>{L("Mỗi bước 15–30 phút, bắt đầu bằng động từ. Bước 1 phải dễ đến mức bắt tay vào ngay được.", "Each step 15–30 minutes, starting with a verb. Step 1 should be so easy you can start right now.")}</p>
      <div className="steps">
        {steps.map((st, i) => (
          <div key={i} className="step">
            <b>{i + 1}.</b>
            <input
              className="field"
              aria-label={L(`Bước ${i + 1}`, `Step ${i + 1}`)}
              value={st}
              onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button className="btn ghost icon" aria-label={L("Bỏ bước", "Remove step")} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn small" onClick={() => setSteps([...steps, ""])} disabled={steps.length >= 6}>
            ＋ {L("Thêm bước", "Add step")}
          </button>
          <button className="btn small" onClick={template}>
            📋 {L("Mẫu nhanh", "Quick template")}
          </button>
          {s.hasClaudeKey && (
            <button className="btn small" onClick={() => void ask()} disabled={busy !== null}>
              {busy === "ask" ? L("Claude đang nghĩ…", "Claude is thinking…") : `✨ ${L("Hỏi Claude", "Ask Claude")}`}
            </button>
          )}
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" className="switch" checked={firstToday} onChange={(e) => setFirstToday(e.target.checked)} />
        {L("Đưa bước 1 vào kế hoạch hôm nay", "Put step 1 on today's plan")}
      </label>
      {error && <div className="error">{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn primary" disabled={busy !== null || steps.every((x) => !x.trim())} onClick={() => void save()}>
          {busy === "save" ? "…" : L("Thêm vào Todoist", "Add to Todoist")}
        </button>
        <button
          className="btn"
          onClick={() => {
            void brain.unplan(task);
            onDone();
          }}
        >
          {L("Bỏ khỏi kế hoạch", "Drop from plan")}
        </button>
      </div>
    </div>
  );
}

function Wardrobe({ brain, s, onBack }: { brain: Brain; s: BrainState; onBack: () => void }) {
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + i)));
  const perfect = new Set(s.life.perfectDays);
  const locked = SPECIES_IDS.map(speciesInfo).filter((x) => x.unlock);
  return (
    <div className="sheet">
      <div>
        <button className="btn ghost small" onClick={onBack}>
          ← {L("Quay lại", "Back")}
        </button>
      </div>
      <h2>🎀 {L("Tủ đồ", "Wardrobe")}</h2>
      <div className="wardrobe">
        {ACCESSORIES.map((a) => {
          const has = s.life.unlocked.includes(a);
          const wearing = s.life.wearing.includes(a);
          return (
            <button
              key={a}
              className={`item${wearing ? " wearing" : ""}${has ? "" : " locked"}`}
              disabled={!has}
              aria-pressed={wearing}
              onClick={() => brain.toggleAccessory(a)}
            >
              <span className="emoji">{life.accessoryEmoji(a)}</span>
              {life.accessoryName(a)}
              <small>{has ? (wearing ? L("Đang đeo", "Wearing") : L("Bấm để đeo", "Tap to wear")) : life.accessoryRequirement(a)}</small>
            </button>
          );
        })}
      </div>
      <h2>🥚 {L("Bạn mới", "New friends")}</h2>
      <div className="wardrobe">
        {locked.map((x) => {
          const open = life.meetsUnlock(x.unlock, s.life);
          const have = x.unlock!.kind === "streak" ? s.life.bestStreak : s.life.totalDone;
          return (
            <button key={x.id} className={`item${open ? "" : " locked"}`} disabled={!open} onClick={() => void brain.setSpecies(x.id)}>
              <span className="emoji">{x.emoji}</span>
              {x.name[getLang()]}
              <small>{open ? L("Bấm để chọn", "Tap to choose") : `${x.unlock!.label[getLang()]} (${have}/${x.unlock!.value})`}</small>
            </button>
          );
        })}
      </div>
      <h2>🌟 {L("Sổ sticker (30 ngày)", "Sticker book (30 days)")}</h2>
      <div className="stickers" aria-label={L(`${s.life.perfectDays.length} ngày hoàn hảo`, `${s.life.perfectDays.length} perfect days`)}>
        {days.map((d) => (
          <span key={d} title={d}>
            {perfect.has(d) ? "🌟" : ""}
          </span>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {L(`Tổng ${s.life.totalDone} việc · ${s.life.goldens} bánh vàng · combo cao nhất ×${s.life.bestCombo} · chuỗi dài nhất ${s.life.bestStreak} ngày`, `${s.life.totalDone} tasks in total · ${s.life.goldens} golden treats · best combo ×${s.life.bestCombo} · best streak ${s.life.bestStreak} days`)}
      </div>
    </div>
  );
}

function Footer({ brain, s }: { brain: Brain; backend: Backend; s: BrainState }) {
  const quiet = s.quietUntil !== null && s.quietUntil > Date.now();
  return (
    <footer className="board-foot">
      <span>
        {s.loading ? L("Đang đồng bộ…", "Syncing…") : s.lastSync ? L(`Đồng bộ ${timeString(new Date(s.lastSync))}`, `Synced ${timeString(new Date(s.lastSync))}`) : ""}
        {s.errorText && s.hasToken && <span style={{ color: "var(--bad)" }}> · {s.errorText}</span>}
      </span>
      <span className="spacer" />
      <button className="btn ghost small" onClick={() => void brain.refresh()} title={L("Đồng bộ lại", "Sync now")}>
        ⟳
      </button>
      <button className="btn ghost small" onClick={() => brain.quiet(quiet ? null : 60)}>
        {quiet ? `🔔 ${L("Bật nhắc", "Unmute")}` : `🔕 ${L("Im 1 giờ", "Quiet 1h")}`}
      </button>
      <button className="btn ghost small" onClick={() => brain.hide(60)}>
        🙈 {L("Ẩn 1 giờ", "Hide 1h")}
      </button>
    </footer>
  );
}
