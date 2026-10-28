import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import type { Backend } from "../backend/types";
import { errorMessage, type Brain, type BrainState, type DueChoice } from "../core/brain";
import { currentEvent, freeMinutes } from "../core/calendar";
import { atHour, daysAgo, dayKey, hoursText, timeString } from "../core/dates";
import { getLang, L, plural } from "../core/l10n";
import * as life from "../core/life";
import * as lines from "../core/lines";
import { dueDay, dueTime, isRecurring, planned, taskTitle, uiPriority, type TodoTask } from "../core/models";
import { moodEmoji, moodLabel } from "../core/mood";
import { ACCESSORIES, SPECIES_IDS } from "../core/types";
import { defaultPose, renderPet, speciesInfo } from "../pets";
import { Icon, type IconName } from "../ui/icons";
import type { BoardRequest } from "./App";
import type { BoardPlacement } from "./placement";
import { Popover } from "./Popover";

type View = { kind: "main" } | { kind: "split"; task: TodoTask } | { kind: "wardrobe" };

/** Priority text colors (AA on the board's surfaces) and check-circle colors, P1…P4. */
const PRIO_INK = ["", "var(--p1-ink)", "var(--p2-ink)", "var(--p3-ink)", "var(--p4-ink)"];
const PRIO_LINE = ["", "var(--p1-line)", "var(--p2-line)", "var(--p3-line)", "var(--p4-line)"];

const short = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

function IconButton({
  icon,
  label,
  onClick,
  danger,
  ref,
  ...aria
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
  ref?: Ref<HTMLButtonElement>;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu" | "dialog";
}) {
  return (
    <button ref={ref} type="button" className={`btn ghost icon${danger ? " danger" : ""}`} title={label} aria-label={label} onClick={onClick} {...aria}>
      <Icon name={icon} size={16} />
    </button>
  );
}

export function Board(props: {
  brain: Brain;
  backend: Backend;
  request: BoardRequest;
  placement: BoardPlacement;
  onClose: () => void;
}) {
  const { brain, backend, request, placement, onClose } = props;
  const s = useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [view, setView] = useState<View>(request.split ? { kind: "split", task: request.split } : { kind: "main" });
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (request.split) setView({ kind: "split", task: request.split });
    else if (request.focusAdd) setView({ kind: "main" });
  }, [request]);

  // Fresh data whenever the board opens (like clicking the macOS pet).
  useEffect(() => {
    void brain.refresh();
  }, [brain, request.seq]);

  // Opened from the keyboard (Enter on the pet): move focus into the board so Tab continues there.
  useEffect(() => {
    if (request.fromKeyboard && !request.focusAdd) ref.current?.focus({ preventScroll: true });
  }, [request]);

  const needsToken = !s.hasToken || s.authError;
  const origin = placement.side === "left" ? "100% 100%" : placement.side === "right" ? "0% 100%" : "50% 100%";

  return (
    <section
      ref={ref}
      tabIndex={-1}
      role="dialog"
      className={`board side-${placement.side}`}
      data-hit=""
      // Anchored by its bottom edge and as tall as its content, up to the room it was given.
      style={{ left: placement.left, bottom: placement.bottom, width: placement.width, maxHeight: placement.height, transformOrigin: origin }}
      aria-label={L("Bảng việc", "Task board")}
    >
      <Header s={s} backend={backend} onClose={onClose} onWardrobe={() => setView({ kind: "wardrobe" })} />
      <div className="board-body">
        {needsToken ? (
          <Connect brain={brain} backend={backend} error={s.errorText} authError={s.hasToken && s.authError} />
        ) : view.kind === "split" ? (
          <SplitSheet brain={brain} s={s} task={view.task} onDone={() => setView({ kind: "main" })} />
        ) : view.kind === "wardrobe" ? (
          <Wardrobe brain={brain} s={s} onBack={() => setView({ kind: "main" })} />
        ) : (
          <Main brain={brain} backend={backend} s={s} focusAdd={request.focusAdd} seq={request.seq} onSplit={(task) => setView({ kind: "split", task })} />
        )}
      </div>
      <Footer brain={brain} s={s} onClose={onClose} />
    </section>
  );
}

function Header({ s, backend, onClose, onWardrobe }: { s: BrainState; backend: Backend; onClose: () => void; onWardrobe: () => void }) {
  const info = speciesInfo(s.prefs.species);
  const speciesName = info.name[getLang()];
  const sameName = s.prefs.petName.trim().toLocaleLowerCase() === speciesName.toLocaleLowerCase();
  const avatar = useMemo(
    () =>
      renderPet(s.prefs.species, defaultPose({ mood: s.mood === "celebrating" ? "happy" : s.mood, t: 1.3, stage: life.stageOf(s.life.xp), wearing: s.life.wearing }), {
        size: 48,
        idPrefix: "avatar",
      }),
    [s.prefs.species, s.mood, s.life.xp, s.life.wearing],
  );
  const score = Math.round(s.score);
  const color = s.score >= 75 ? "var(--good)" : s.score >= 50 ? "var(--accent)" : s.score >= 30 ? "var(--warn)" : "var(--bad)";
  return (
    <header className="board-head">
      <div className="board-avatar" aria-hidden dangerouslySetInnerHTML={{ __html: avatar }} />
      <h1 className="board-name" title={sameName ? s.prefs.petName : `${s.prefs.petName} · ${speciesName}`}>
        <span className="pet-name">{s.prefs.petName}</span>
        <small>
          {info.emoji}
          {sameName ? "" : ` ${speciesName}`} · {life.stageName(life.stageOf(s.life.xp))}
        </small>
      </h1>
      <div
        className="mood-line"
        tabIndex={0}
        aria-label={`${moodLabel(s.mood)}, ${L("điểm vui", "happiness")} ${score}. ${L("Vì sao pet thấy vậy", "Why the pet feels this way")}`}
        aria-describedby="mood-reasons"
      >
        <span className="mood-label">
          {moodEmoji(s.mood)} {moodLabel(s.mood)}
        </span>
        <span className="score" aria-hidden>
          <i style={{ width: `${s.score}%`, background: color }} />
        </span>
        <b className="score-num">{score}</b>
        <div className="reasons" role="tooltip" id="mood-reasons">
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
      <div className="head-tools">
        <IconButton icon="hanger" label={L("Tủ đồ & thành tích", "Wardrobe & achievements")} onClick={onWardrobe} />
        <IconButton icon="book" label={L("Nhật ký của pet", "Pet diary")} onClick={() => void backend.system.openWindow("diary")} />
        <IconButton icon="gear" label={L("Cài đặt", "Settings")} onClick={() => void backend.system.openWindow("settings")} />
        <IconButton icon="close" label={L("Đóng (Esc)", "Close (Esc)")} onClick={onClose} />
      </div>
      {s.hasToken && !s.authError && <Stats s={s} />}
      {s.loading && <span className="sr-only">{L("Đang đồng bộ", "Syncing")}</span>}
    </header>
  );
}

/** Progress in one compact line: done/target, fullness, XP and stage, streak. */
function Stats({ s }: { s: BrainState }) {
  const done = s.day.completed.length;
  const stage = life.stageOf(s.life.xp);
  const next = life.nextStageXp(stage);
  const base = life.STAGE_THRESHOLDS[stage];
  const satiety = Math.round(s.life.satiety);
  const streak = s.life.streak;
  const days = (n: number) => plural(n, "ngày", "day", "days");
  return (
    <ul className="stats" aria-label={L("Tiến độ", "Progress")}>
      <Stat
        icon="checkCircle"
        tone="good"
        value={`${done}/${s.target}`}
        label={L("hôm nay", "today")}
        title={L(`Xong ${done}/${s.target} việc hôm nay`, `${done} of ${s.target} done today`)}
        meter={done / Math.max(1, s.target)}
      />
      <Stat
        icon="bowl"
        tone={satiety < 30 ? "bad" : "accent"}
        value={`${satiety}%`}
        label={L("no", "full")}
        title={L(`No ${satiety}% · mỗi việc xong +25%`, `${satiety}% full · each finished task +25%`)}
        meter={satiety / 100}
      />
      <Stat
        icon="star"
        tone="gold"
        value={`${s.life.xp} XP`}
        title={
          next
            ? L(`${life.stageName(stage)} · ${s.life.xp}/${next} XP để lên ${life.stageName((stage + 1) as typeof stage)}`, `${life.stageName(stage)} · ${s.life.xp}/${next} XP to ${life.stageName((stage + 1) as typeof stage)}`)
            : `${life.stageName(stage)} · ${s.life.xp} XP`
        }
        meter={next ? (s.life.xp - base) / (next - base) : 1}
      />
      <Stat
        icon="flame"
        tone="hot"
        value={String(streak)}
        label={L("ngày", streak === 1 ? "day" : "days")}
        extra={s.life.dirt > 0 ? `🪰${s.life.dirt > 1 ? `×${s.life.dirt}` : ""}` : undefined}
        title={
          L(`Chuỗi ngày đạt mục tiêu: ${days(streak)}`, `Goal streak: ${days(streak)}`) +
          (s.stats ? L(` · chuỗi Todoist: ${days(s.stats.streak)}`, ` · Todoist streak: ${days(s.stats.streak)}`) : "") +
          (s.life.dirt > 0 ? L(` · bẩn ${s.life.dirt} lớp (ngày lỡ mục tiêu)`, ` · ${plural(s.life.dirt, "", "layer", "layers").trim()} of dirt from missed days`) : "")
        }
      />
    </ul>
  );
}

function Stat({
  icon,
  tone,
  value,
  label,
  title,
  meter,
  extra,
}: {
  icon: IconName;
  tone: string;
  value: string;
  label?: string;
  title: string;
  meter?: number;
  extra?: string;
}) {
  return (
    <li className={`stat tone-${tone}`} title={title}>
      <Icon name={icon} size={14} />
      <b>{value}</b>
      {label && <span className="stat-label">{label}</span>}
      {extra && <span aria-hidden>{extra}</span>}
      {meter !== undefined && (
        <span className="stat-meter" aria-hidden>
          <i style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }} />
        </span>
      )}
    </li>
  );
}

function Connect({ brain, backend, error, authError }: { brain: Brain; backend: Backend; error: string | null; authError: boolean }) {
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
      {authError && <div className="error">{L("Todoist không nhận token đã lưu — dán token mới nhé.", "Todoist refused the saved token — paste a new one.")}</div>}
      <p>{L("Mình đọc việc hôm nay của bạn để nhắc đúng lúc. Token chỉ lưu trong Windows Credential Manager.", "I read today's tasks so I can nudge you at the right time. The token is kept in Windows Credential Manager only.")}</p>
      <ol>
        <li>
          {L("Mở Todoist → Cài đặt → Tích hợp → Nhà phát triển", "Open Todoist → Settings → Integrations → Developer")}{" "}
          <button className="btn ghost small" onClick={() => void backend.system.openUrl("https://app.todoist.com/app/settings/integrations/developer")}>
            {L("Mở", "Open")} <Icon name="external" size={14} />
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
      {error && !authError && <div className="error">{error}</div>}
    </div>
  );
}

function Main({ brain, backend, s, focusAdd, seq, onSplit }: { brain: Brain; backend: Backend; s: BrainState; focusAdd: boolean; seq: number; onSplit: (t: TodoTask) => void }) {
  const day = s.day;
  const stuckIds = new Map(s.stuck.map((x) => [x.task.id, x.days]));
  const done = day.completed.length;
  const toPlan = s.target - planned(day);
  return (
    <>
      {s.focus && <FocusCard brain={brain} s={s} />}

      <AddTask brain={brain} focusAdd={focusAdd} seq={seq} />

      {day.overdue.length > 0 && (
        <section className="section" aria-labelledby="sec-overdue">
          <div className="sec-head">
            <h2 id="sec-overdue">
              {L("Quá hạn", "Overdue")} <span className="count late">{day.overdue.length}</span>
            </h2>
            <span className="spacer" />
            <button className="btn small" onClick={() => void brain.pullOverdueToToday()}>
              {L("Dời hết vào hôm nay", "Move all to today")}
            </button>
          </div>
          <ul className="tasks">
            {day.overdue.map((t) => (
              <TaskRow key={t.id} t={t} brain={brain} s={s} stuckDays={stuckIds.get(t.id)} onSplit={onSplit} />
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="sec-today">
        <div className="sec-head">
          <h2 id="sec-today">
            {L("Hôm nay", "Today")} <span className="count">{day.today.length}</span>
          </h2>
          <span className="spacer" />
          {toPlan > 0 && <span className="chip stuck">{L(`thiếu ${toPlan} việc`, `${toPlan} to plan`)}</span>}
        </div>
        {day.today.length === 0 ? (
          <div className="tasks empty">{done > 0 ? L("Xong hết rồi! 🎉", "All done! 🎉") : L("Chưa có việc nào. Thêm 3 việc quan trọng nhất nhé.", "Nothing yet. Add your 3 most important tasks.")}</div>
        ) : (
          <ul className="tasks">
            {day.today.map((t) => (
              <TaskRow key={t.id} t={t} brain={brain} s={s} stuckDays={stuckIds.get(t.id)} onSplit={onSplit} />
            ))}
          </ul>
        )}
      </section>

      {day.completed.length > 0 && (
        <section className="section" aria-labelledby="sec-done">
          <div className="sec-head">
            <h2 id="sec-done">
              {L("Đã xong", "Done")} <span className="count good">{day.completed.length}</span>
            </h2>
          </div>
          <ul className="tasks">
            {day.completed.map((t) => {
              const title = taskTitle(t);
              return (
                <li key={t.id} className="task done">
                  <button className="check" aria-label={L(`Hoàn tác: ${title}`, `Undo: ${title}`)} title={L("Hoàn tác", "Undo")} onClick={() => void brain.undoComplete(t)}>
                    <Icon name="check" size={12} />
                  </button>
                  <div className="t-body">
                    <div className="t-title" title={title}>
                      {title}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <CalendarCard brain={brain} backend={backend} s={s} />
    </>
  );
}

function TaskRow({ t, brain, s, stuckDays, onSplit }: { t: TodoTask; brain: Brain; s: BrainState; stuckDays?: number; onSplit: (t: TodoTask) => void }) {
  const [pop, setPop] = useState<"move" | "delete" | null>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const title = taskTitle(t);
  const time = dueTime(t);
  const day = dueDay(t);
  const today = dayKey(new Date());
  const late = time !== null && time < new Date();
  const prio = uiPriority(t);
  const meta = [
    s.next?.id === t.id && (
      <span key="next" className="chip frog">
        🐸 {L("làm trước", "do first")}
      </span>
    ),
    prio < 4 && (
      <span key="p" className="chip prio" style={{ color: PRIO_INK[prio] }}>
        P{prio}
      </span>
    ),
    time && (
      <span key="time" className={`chip${late ? " late" : ""}`}>
        ⏰ {timeString(time)}
      </span>
    ),
    day && day < today && (
      <span key="ago" className="chip late">
        {daysAgo(day)}
      </span>
    ),
    stuckDays !== undefined && (
      <span key="stuck" className="chip stuck" title={L(`Bị dời ${stuckDays} ngày`, `Postponed for ${stuckDays} days`)}>
        ⏳ {plural(stuckDays, "ngày", "day", "days")}
      </span>
    ),
    isRecurring(t) && (
      <span key="rec" className="chip" title={L("Lặp lại", "Repeats")}>
        🔁
      </span>
    ),
    t.parentId && (
      <span key="sub" className="chip">
        ↳ {L("bước nhỏ", "step")}
      </span>
    ),
  ].filter(Boolean);
  const closePop = (restoreFocus: boolean) => {
    const which = pop;
    setPop(null);
    if (restoreFocus) (which === "move" ? moveRef : deleteRef).current?.focus();
  };
  return (
    <li className={`task${pop ? " active" : ""}`} style={{ ["--prio" as string]: PRIO_LINE[prio] }}>
      <button className="check" aria-label={L(`Xong: ${title}`, `Complete: ${title}`)} title={L("Xong", "Complete")} onClick={() => void brain.complete(t)}>
        <Icon name="check" size={12} />
      </button>
      <div className="t-body">
        <div className="t-title" title={title}>
          {title}
        </div>
        {meta.length > 0 && <div className="t-meta">{meta}</div>}
      </div>
      <div className="t-actions">
        <IconButton icon="play" label={L("Tập trung", "Focus")} onClick={() => brain.startFocus(t)} />
        <IconButton icon="scissors" label={L("Chia nhỏ", "Split")} onClick={() => onSplit(t)} />
        <IconButton ref={moveRef} icon="reschedule" label={L("Dời", "Move")} aria-haspopup="menu" aria-expanded={pop === "move"} onClick={() => setPop(pop === "move" ? null : "move")} />
        <IconButton ref={deleteRef} icon="trash" danger label={L("Xoá", "Delete")} aria-haspopup="dialog" aria-expanded={pop === "delete"} onClick={() => setPop(pop === "delete" ? null : "delete")} />
      </div>
      {pop === "move" && (
        <Popover anchor={moveRef} role="menu" label={L(`Dời “${short(title, 40)}”`, `Move “${short(title, 40)}”`)} className="menu" onClose={closePop}>
          {(
            [
              ["today", L("Hôm nay", "Today")],
              ["tomorrow", L("Ngày mai", "Tomorrow")],
              ["no date", L("Bỏ khỏi kế hoạch (không hạn)", "Off the plan (no date)")],
            ] as const
          ).map(([due, label]) => (
            <button
              key={due}
              type="button"
              role="menuitem"
              onClick={() => {
                setPop(null);
                if (due === "no date") void brain.unplan(t);
                else void brain.reschedule(t, due);
              }}
            >
              <Icon name={due === "no date" ? "inbox" : "calendar"} size={15} />
              {label}
            </button>
          ))}
        </Popover>
      )}
      {pop === "delete" && (
        <Popover anchor={deleteRef} role="alertdialog" label={L("Xoá việc", "Delete task")} className="confirm" onClose={closePop}>
          <p>{lines.confirmDelete(t)}</p>
          <div className="pop-actions">
            <button type="button" className="btn small" data-autofocus onClick={() => closePop(true)}>
              {L("Huỷ", "Cancel")}
            </button>
            <button
              type="button"
              className="btn small danger solid"
              onClick={() => {
                setPop(null);
                void brain.remove(t);
              }}
            >
              <Icon name="trash" size={14} />
              {L("Xoá", "Delete")}
            </button>
          </div>
        </Popover>
      )}
    </li>
  );
}

function addedNote(due: DueChoice, title: string): string {
  const q = `“${short(title, 32)}”`;
  switch (due) {
    case "today":
      return L(`Đã thêm ${q} vào Hôm nay`, `Added ${q} to Today`);
    case "tomorrow":
      return L(`Đã thêm ${q} cho ngày mai`, `Added ${q} for tomorrow`);
    case "none":
      return L(`Đã thêm ${q}, không hạn (ngoài kế hoạch)`, `Added ${q} with no date (off the plan)`);
    default:
      return L(`Đã thêm ${q} theo cú pháp Todoist`, `Added ${q} with Todoist's date`);
  }
}

function AddTask({ brain, focusAdd, seq }: { brain: Brain; focusAdd: boolean; seq: number }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState<DueChoice>("today");
  const [prio, setPrio] = useState(4);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ n: number; text: string; error: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusAdd) input.current?.focus();
  }, [focusAdd, seq]);
  useEffect(() => {
    if (!note || note.error) return;
    const id = setTimeout(() => setNote(null), 4500);
    return () => clearTimeout(id);
  }, [note]);
  const submit = async () => {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    const ok = await brain.add(content, due, 5 - prio);
    setBusy(false);
    if (!ok) {
      setNote({ n: Date.now(), text: brain.getSnapshot().errorText ?? L("Chưa thêm được, thử lại nhé.", "Couldn't add it, try again."), error: true });
      return;
    }
    setText("");
    setNote({ n: Date.now(), text: addedNote(due, content), error: false });
    // Due and priority are per task: back to the defaults so the next task isn't silently P1 or tomorrow.
    setDue("today");
    setPrio(4);
    input.current?.focus();
  };
  const dues: [DueChoice, string][] = [
    ["today", L("Hôm nay", "Today")],
    ["tomorrow", L("Mai", "Tomorrow")],
    ["none", L("Không hạn", "No date")],
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
          autoComplete="off"
          placeholder={due === "smart" ? L("Gọi Anna 3pm p1 #Work", "Call Anna 3pm p1 #Work") : L("Thêm việc…", "Add a task…")}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (note?.error) setNote(null);
          }}
        />
        <button className="btn primary" disabled={busy || !text.trim()}>
          {busy ? "…" : L("Thêm", "Add")}
        </button>
      </div>
      <div className="add-opts">
        <div className="seg" role="group" aria-label={L("Hạn", "Due")}>
          {dues.map(([d, label]) => (
            <button key={d} type="button" aria-pressed={due === d} onClick={() => setDue(d)}>
              {label}
            </button>
          ))}
          <button type="button" aria-pressed={due === "smart"} title={L("Cú pháp Todoist (ngày, giờ, p1, #dự án)", "Todoist syntax (date, time, p1, #project)")} aria-label={L("Cú pháp Todoist", "Todoist syntax")} onClick={() => setDue("smart")}>
            <Icon name="sparkle" size={14} />
          </button>
        </div>
        {due !== "smart" && (
          <div className="prio" role="group" aria-label={L("Độ ưu tiên", "Priority")}>
            {[1, 2, 3, 4].map((p) => (
              <button key={p} type="button" aria-pressed={prio === p} title={L(`Ưu tiên ${p}`, `Priority ${p}`)} style={{ color: PRIO_INK[p] }} onClick={() => setPrio(p)}>
                P{p}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`add-note${note?.error ? " error-note" : ""}`} role="status" aria-live="polite">
        {note && (
          <span key={note.n} className="note">
            <Icon name={note.error ? "warning" : "check"} size={14} />
            <span className="note-text" title={note.text}>
              {note.text}
            </span>
          </span>
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

/** Today's meetings, folded to one line; time-block suggestions inside. */
function CalendarCard({ brain, backend, s }: { brain: Brain; backend: Backend; s: BrainState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // It sits below the task lists: bring the opened card into view.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  if (!s.prefs.useCalendar || s.events.length === 0) return null;
  const now = new Date();
  const start = atHour(s.prefs.workStart, 0, now);
  const end = atHour(s.prefs.workEnd, 0, now);
  const free = freeMinutes(s.events, start, end);
  const current = currentEvent(s.events, now);
  const upcoming = current ?? s.events.find((e) => e.start > now) ?? null;
  const soon = upcoming && upcoming.joinUrl && (upcoming === current || upcoming.start.getTime() - now.getTime() < 15 * 60_000) ? upcoming : null;
  const parts = [plural(s.events.length, "cuộc họp", "meeting", "meetings"), L(`trống ${hoursText(free)}`, `${hoursText(free)} free`)];
  if (upcoming) parts.push(upcoming === current ? L(`đang họp: ${upcoming.title}`, `now: ${upcoming.title}`) : `${timeString(upcoming.start)} ${upcoming.title}`);
  if (s.suggestions.length > 0) parts.push(plural(s.suggestions.length, "gợi ý giờ làm", "time block", "time blocks"));
  if (s.target < s.prefs.dailyTarget) parts.push(L(`mục tiêu ${s.target} việc`, `target ${s.target}`));
  const join = (url: string) => void backend.system.openUrl(url);
  return (
    <section ref={ref} className={`cal${open ? " open" : ""}`} aria-label={L("Lịch hôm nay", "Today's calendar")}>
      <div className="cal-head">
        <button type="button" className="cal-summary" aria-expanded={open} aria-controls="cal-detail" onClick={() => setOpen(!open)} title={parts.join(" · ")}>
          <Icon name="calendar" size={15} />
          <span className="cal-text">{parts.join(" · ")}</span>
          <Icon name="chevronDown" size={14} className="chev" />
        </button>
        {soon && !open && (
          <button type="button" className="btn small" onClick={() => join(soon.joinUrl!)}>
            {L("Vào", "Join")} <Icon name="external" size={13} />
          </button>
        )}
      </div>
      {open && (
        <div className="cal-detail" id="cal-detail">
          {s.events.map((e) => (
            <div key={e.id} className={`cal-row${current?.id === e.id ? " now" : ""}`}>
              <time>
                {timeString(e.start)}–{timeString(e.end)}
              </time>
              <span className="what" title={e.title}>
                {e.title}
              </span>
              {e.joinUrl && e.end > now && (
                <button type="button" className="btn small" onClick={() => join(e.joinUrl!)}>
                  {L("Vào", "Join")} <Icon name="external" size={13} />
                </button>
              )}
            </div>
          ))}
          {s.suggestions.length > 0 && (
            <>
              <div className="cal-sub">{L("Gợi ý khung giờ cho việc:", "Suggested time blocks:")}</div>
              {s.suggestions.map((sg) => (
                <div key={sg.task.id} className="cal-row">
                  <time>
                    {timeString(sg.start)}–{timeString(sg.end)}
                  </time>
                  <span className="what" title={taskTitle(sg.task)}>
                    {taskTitle(sg.task)}
                  </span>
                  <button type="button" className="btn small" onClick={() => void brain.schedule(sg)}>
                    <Icon name="clock" size={13} /> {L("Đặt giờ", "Set time")}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
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
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
      </div>
      <h2>
        <Icon name="scissors" size={18} /> {L("Chia nhỏ việc", "Split the task")}
      </h2>
      <div className="muted sheet-sub" title={title}>
        “{title}”{days ? L(` · nằm trong danh sách ${days} ngày`, ` · on your list for ${plural(days, "ngày", "day", "days")}`) : ""}
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
            <IconButton icon="close" label={L(`Bỏ bước ${i + 1}`, `Remove step ${i + 1}`)} onClick={() => setSteps(steps.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn small" onClick={() => setSteps([...steps, ""])} disabled={steps.length >= 6}>
            <Icon name="plus" size={14} /> {L("Thêm bước", "Add step")}
          </button>
          <button className="btn small" onClick={template}>
            <Icon name="template" size={14} /> {L("Mẫu nhanh", "Quick template")}
          </button>
          {s.hasClaudeKey && (
            <button className="btn small" onClick={() => void ask()} disabled={busy !== null}>
              <Icon name="sparkle" size={14} /> {busy === "ask" ? L("Claude đang nghĩ…", "Claude is thinking…") : L("Hỏi Claude", "Ask Claude")}
            </button>
          )}
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" className="switch" checked={firstToday} onChange={(e) => setFirstToday(e.target.checked)} />
        {L("Đưa bước 1 vào kế hoạch hôm nay", "Put step 1 on today's plan")}
      </label>
      {error && <div className="error">{error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
      </div>
      <h2>
        <Icon name="hanger" size={18} /> {L("Tủ đồ", "Wardrobe")}
      </h2>
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
      <h2>
        <Icon name="paw" size={18} /> {L("Bạn mới", "New friends")}
      </h2>
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
      <h2>
        <Icon name="star" size={18} /> {L("Sổ sticker (30 ngày)", "Sticker book (30 days)")}
      </h2>
      <div className="stickers" role="img" aria-label={L(`${s.life.perfectDays.length} ngày hoàn hảo`, `${plural(s.life.perfectDays.length, "", "perfect day", "perfect days").trim()}`)}>
        {days.map((d) => (
          <span key={d} title={d}>
            {perfect.has(d) ? "🌟" : ""}
          </span>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {L(
          `Tổng ${s.life.totalDone} việc · ${s.life.goldens} bánh vàng · combo cao nhất ×${s.life.bestCombo} · chuỗi dài nhất ${s.life.bestStreak} ngày`,
          `${plural(s.life.totalDone, "", "task", "tasks").trim()} in total · ${plural(s.life.goldens, "", "golden treat", "golden treats").trim()} · best combo ×${s.life.bestCombo} · best streak ${plural(s.life.bestStreak, "", "day", "days").trim()}`,
        )}
      </div>
    </div>
  );
}

function Footer({ brain, s, onClose }: { brain: Brain; s: BrainState; onClose: () => void }) {
  const quiet = s.quietUntil !== null && s.quietUntil > Date.now();
  const status = s.loading ? L("Đang đồng bộ…", "Syncing…") : s.lastSync ? L(`Đồng bộ ${timeString(new Date(s.lastSync))}`, `Synced ${timeString(new Date(s.lastSync))}`) : "";
  const err = s.errorText && s.hasToken ? s.errorText : null;
  return (
    <footer className="board-foot">
      <span className="sync" title={err ? `${status} · ${err}` : status}>
        {status}
        {err && <span className="foot-error"> · {err}</span>}
      </span>
      <span className="spacer" />
      <button className="btn ghost small icon" onClick={() => void brain.refresh()} title={L("Đồng bộ lại", "Sync now")} aria-label={L("Đồng bộ lại", "Sync now")}>
        <Icon name="refresh" size={15} className={s.loading ? "spin" : undefined} />
      </button>
      <button className="btn ghost small" onClick={() => brain.quiet(quiet ? null : 60)} aria-pressed={quiet}>
        <Icon name={quiet ? "bell" : "bellOff"} size={15} />
        {quiet ? L("Bật nhắc", "Unmute") : L("Im 1 giờ", "Quiet 1h")}
      </button>
      <button
        className="btn ghost small"
        onClick={() => {
          // The pet goes away, so the board it belongs to goes too.
          onClose();
          brain.hide(60);
        }}
      >
        <Icon name="eyeOff" size={15} />
        {L("Ẩn 1 giờ", "Hide 1h")}
      </button>
    </footer>
  );
}
