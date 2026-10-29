import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import type { Backend } from "../backend/types";
import { errorMessage, type Brain, type BrainState, type DueChoice } from "../core/brain";
import { currentEvent, freeMinutes } from "../core/calendar";
import { addDays, atHour, daysAgo, dayKey, hoursText, parseDate, timeString } from "../core/dates";
import { getLang, L, plural } from "../core/l10n";
import * as life from "../core/life";
import * as lines from "../core/lines";
import { dueDay, dueTime, isRecurring, planned, taskTitle, uiPriority, type TodoTask } from "../core/models";
import { decorName, homeDecor } from "../core/craft";
import { dayStrip } from "../core/load";
import { moodEmoji, moodLabel } from "../core/mood";
import { isWorkday, MAX_HOME_ITEMS } from "../core/prefs";
import type { StartTrigger } from "../core/triggers";
import { itemName, placeName, SOUVENIRS } from "../core/trips";
import { DECOR_IDS, SPECIES_IDS, type Accessory, type DecorId, type SpeciesId, type StageIndex } from "../core/types";
import { canMove, canWrapUp, chooseFrog, chooseMove, moveAllToTomorrow, MAX_NOTE_LENGTH, setNote, wrapMoves, type WrapDraft, type WrapMove } from "../core/wrapup";
import { defaultPose, petBounds, renderDecor, renderPet, speciesInfo } from "../pets";
import { Icon, type IconName } from "../ui/icons";
import { localeTag } from "../ui/lang";
import type { BoardRequest } from "./App";
import {
  chestProgress,
  groupTitle,
  oddsPercent,
  previewViewBox,
  seasonLabel,
  seasonLine,
  TIERS,
  tierGives,
  tierName,
  toggleHomeItem,
  tripBanner,
  WARDROBE_GROUPS,
  yarnText,
  type WardrobeGroupId,
} from "./boardGame";
import type { BoardPlacement } from "./placement";
import { Popover } from "./Popover";

type View = { kind: "main" } | { kind: "split"; task: TodoTask } | { kind: "wardrobe" } | { kind: "home" } | { kind: "wrapup" };

/** Priority text colors (AA on the board's surfaces) and check-circle colors, P1…P4. */
const PRIO_INK = ["", "var(--p1-ink)", "var(--p2-ink)", "var(--p3-ink)", "var(--p4-ink)"];
const PRIO_LINE = ["", "var(--p1-line)", "var(--p2-line)", "var(--p3-line)", "var(--p4-line)"];

/** "Start when…" lists this many of today's meetings. */
const MAX_MEETING_CHOICES = 4;

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
  const [view, setView] = useState<View>(request.split ? { kind: "split", task: request.split } : request.wrapUp ? { kind: "wrapup" } : { kind: "main" });
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (request.split) setView({ kind: "split", task: request.split });
    else if (request.wrapUp) setView({ kind: "wrapup" });
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
          <Wardrobe brain={brain} s={s} onBack={() => setView({ kind: "main" })} onHome={() => setView({ kind: "home" })} />
        ) : view.kind === "home" ? (
          <HomeSheet brain={brain} s={s} onBack={() => setView({ kind: "wardrobe" })} />
        ) : view.kind === "wrapup" ? (
          <WrapUpSheet brain={brain} s={s} onBack={() => setView({ kind: "main" })} onDone={onClose} />
        ) : (
          <Main
            brain={brain}
            backend={backend}
            s={s}
            focusAdd={request.focusAdd}
            prefill={request.prefill}
            seq={request.seq}
            onSplit={(task) => setView({ kind: "split", task })}
            onWrapUp={() => setView({ kind: "wrapup" })}
          />
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
      {s.hasToken && !s.authError && <Stats s={s} onWardrobe={onWardrobe} />}
      {s.hasToken && !s.authError && <RepairLine s={s} />}
      {s.loading && <span className="sr-only">{L("Đang đồng bộ", "Syncing")}</span>}
    </header>
  );
}

/** Progress in one compact line: done/target, fullness, XP and stage, streak, and the chests waiting to be opened. */
function Stats({ s, onWardrobe }: { s: BrainState; onWardrobe: () => void }) {
  const ref = useRef<HTMLUListElement>(null);
  // The labels ("today", "full") show whenever they fit; on a narrow board or with long values the icons and
  // tooltips carry them. Measured before paint, so nothing is ever cut mid-word.
  const fit = useRef(() => {
    const ul = ref.current;
    if (!ul) return;
    ul.classList.remove("compact");
    const over = [...ul.querySelectorAll<HTMLElement>(".stat, .stat-label")].some((el) => el.scrollWidth > el.clientWidth + 0.5);
    ul.classList.toggle("compact", over);
  });
  useLayoutEffect(() => fit.current());
  useEffect(() => {
    const ul = ref.current;
    if (!ul || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit.current());
    ro.observe(ul);
    return () => ro.disconnect();
  }, []);
  const held = s.chests.held;
  const done = s.day.completed.length;
  const stage = life.stageOf(s.life.xp);
  const next = life.nextStageXp(stage);
  const base = life.STAGE_THRESHOLDS[stage];
  const satiety = Math.round(s.life.satiety);
  const streak = s.life.streak;
  const snacks = s.life.snacks;
  const dirt = s.life.dirt;
  const days = (n: number) => plural(n, "ngày", "day", "days");
  const quest = s.life.repair;
  const questToday = life.activeRepair(s.life) !== null;
  const streakTitle = [
    L(`Chuỗi ${days(streak)}: mỗi ngày làm việc xong ít nhất 1 việc.`, `${days(streak)} in a row with at least 1 task done.`),
    L("Ngày nghỉ, ngày tắt máy và ngày lịch họp kín không làm đứt chuỗi.", "Days off, days the PC is off and packed meeting days never break it."),
    L(
      `🍪 Túi bánh: ${snacks}/${life.MAX_SNACKS}. Lỡ một ngày thì pet ăn 1 bánh để giữ chuỗi; ngày nào đạt mục tiêu được thêm bánh.`,
      `🍪 Snacks: ${snacks}/${life.MAX_SNACKS}. Miss a day and the pet eats one to keep your streak; hit your daily goal to earn more.`,
    ),
    quest &&
      (questToday
        ? L(`🔧 Xong ${life.REPAIR_TASKS} việc hôm nay để nối lại chuỗi ${quest.streak} ngày (${Math.min(done, life.REPAIR_TASKS)}/${life.REPAIR_TASKS}).`, `🔧 Finish ${life.REPAIR_TASKS} tasks today to bring back your ${quest.streak}-day streak (${Math.min(done, life.REPAIR_TASKS)}/${life.REPAIR_TASKS}).`)
        : L(`🔧 Xong ${life.REPAIR_TASKS} việc vào ngày làm việc tới (đến hết ${shortDay(quest.until)}) để nối lại chuỗi ${quest.streak} ngày.`, `🔧 Finish ${life.REPAIR_TASKS} tasks on your next workday (by ${shortDay(quest.until)}) to bring back your ${quest.streak}-day streak.`)),
    s.stats && L(`Chuỗi Todoist: ${days(s.stats.streak)}.`, `Todoist streak: ${days(s.stats.streak)}.`),
    dirt > 0 && L(`🪰 Bẩn ${dirt} lớp vì lỡ ${dirt} ngày; mỗi việc xong tắm sạch 1 lớp.`, `🪰 ${plural(dirt, "", "layer", "layers").trim()} of dirt from missed days; each finished task washes one off.`),
  ]
    .filter(Boolean)
    .join("\n");
  const stash = [snacks > 0 ? `🍪${snacks > 1 ? `×${snacks}` : ""}` : "", dirt > 0 ? `🪰${dirt > 1 ? `×${dirt}` : ""}` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <ul ref={ref} className="stats" aria-label={L("Tiến độ", "Progress")}>
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
        label={L("no bụng", "full")}
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
        // Compact, to leave room for the snack stash and the flies: the flame and the tooltip say what it is.
        label={L("ngày", streak === 1 ? "day" : "days")}
        labelHidden
        extra={stash}
        title={streakTitle}
      />
      {held > 0 && (
        <li className="stat stat-chest">
          <button
            type="button"
            onClick={onWardrobe}
            title={L(`${held} rương chờ mở: xong việc tiếp theo là mở một rương`, `${plural(held, "", "chest", "chests").trim()} to open: finish your next task to open one`)}
            aria-label={L(`${held} rương chờ mở. Xong việc tiếp theo là mở một rương. Mở tủ đồ`, `${plural(held, "", "chest", "chests").trim()} to open. Finish your next task to open one. Open the wardrobe`)}
          >
            <span aria-hidden>🎁</span>
            <b aria-hidden>{held}</b>
          </button>
        </li>
      )}
    </ul>
  );
}

/** "12 Nov" / "12 thg 11" for a day key. */
function shortDay(key: string): string {
  const d = parseDate(key);
  return d ? d.toLocaleDateString(localeTag(getLang()), { day: "numeric", month: "short" }) : key;
}

/** Today's repair quest, when there is one: "Finish 2 tasks today to bring back your 6-day streak (1/2)". */
function RepairLine({ s }: { s: BrainState }) {
  const quest = life.activeRepair(s.life);
  if (!quest) return null;
  const need = life.REPAIR_TASKS;
  const have = Math.min(s.day.completed.length, need);
  return (
    <div className="repair-line">
      <Icon name="flame" size={14} />
      <span className="repair-text">
        {quest.restored
          ? L(`Chuỗi ${quest.streak} ngày đã được nối lại`, `Your ${quest.streak}-day streak is back`)
          : L(`Xong ${need} việc hôm nay để nối lại chuỗi ${quest.streak} ngày`, `Finish ${need} tasks today to bring back your ${quest.streak}-day streak`)}
      </span>
      <b className="repair-count" aria-label={L(`đã xong ${have} trên ${need}`, `${have} of ${need} done`)}>
        {have}/{need}
      </b>
    </div>
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
  labelHidden,
}: {
  icon: IconName;
  tone: string;
  value: string;
  label?: string;
  /** Read out but not shown. */
  labelHidden?: boolean;
  title: string;
  meter?: number;
  extra?: string;
}) {
  return (
    <li className={`stat tone-${tone}`} title={title}>
      <Icon name={icon} size={14} />
      <b>{value}</b>
      {label && <span className={labelHidden ? "sr-only" : "stat-label"}>{label}</span>}
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

/** "Take today off": shown on days that would be workdays (the demo always works), pressed on a rest day. */
function DayOffToggle({ brain, s }: { brain: Brain; s: BrainState }) {
  const now = new Date();
  const dayOff = s.prefs.restDays.includes(dayKey(now));
  if (!dayOff && !s.isDemo && !isWorkday({ ...s.prefs, restDays: [] }, now)) return null;
  return (
    <button
      className="btn small day-off"
      onClick={() => void brain.takeDayOff(!dayOff)}
      aria-pressed={dayOff}
      title={
        dayOff
          ? L("Hôm nay là ngày nghỉ. Bấm để làm việc lại.", "Today is a day off. Tap to work after all.")
          : L("Không nhắc việc hôm nay và chuỗi không bị đứt; việc nào lỡ làm xong vẫn được tính", "No reminders today and your streak is safe; anything you do finish still counts")
      }
    >
      <Icon name="leaf" size={14} />
      {L("Nghỉ hôm nay", "Take today off")}
    </button>
  );
}

function Main({
  brain,
  backend,
  s,
  focusAdd,
  prefill,
  seq,
  onSplit,
  onWrapUp,
}: {
  brain: Brain;
  backend: Backend;
  s: BrainState;
  focusAdd: boolean;
  prefill: string | null;
  seq: number;
  onSplit: (t: TodoTask) => void;
  onWrapUp: () => void;
}) {
  const day = s.day;
  const stuckIds = new Map(s.stuck.map((x) => [x.task.id, x.days]));
  const done = day.completed.length;
  const dayOff = s.prefs.restDays.includes(dayKey(new Date()));
  // Nothing to plan on a day off, nor once the day is wrapped up (what you moved to tomorrow was on purpose).
  const toPlan = dayOff || s.doneUntil !== null ? 0 : s.target - planned(day);
  // One confirmation line under the add form, for adds and for moves.
  const [note, setNote] = useState<Note | null>(null);
  return (
    <>
      {s.trip && <TripBanner brain={brain} s={s} />}
      {s.focus && <FocusCard brain={brain} s={s} />}

      <AddTask brain={brain} focusAdd={focusAdd} prefill={prefill} seq={seq} note={note} setNote={setNote} />

      <DayStripCard brain={brain} s={s} onWrapUp={onWrapUp} />
      <PlanNote s={s} />

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
              <TaskRow key={t.id} t={t} brain={brain} s={s} stuckDays={stuckIds.get(t.id)} onSplit={onSplit} onNote={setNote} />
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
          <PinPlace brain={brain} s={s} onNote={setNote} compact={toPlan > 0} />
          <DayOffToggle brain={brain} s={s} />
        </div>
        {day.today.length === 0 ? (
          <div className="tasks empty">{done > 0 ? L("Xong hết rồi! 🎉", "All done! 🎉") : L("Chưa có việc nào. Thêm 3 việc quan trọng nhất nhé.", "Nothing yet. Add your 3 most important tasks.")}</div>
        ) : (
          <ul className="tasks">
            {day.today.map((t) => (
              <TaskRow key={t.id} t={t} brain={brain} s={s} stuckDays={stuckIds.get(t.id)} onSplit={onSplit} onNote={setNote} />
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
                  <button className="check" aria-label={L(`Hoàn tác: ${title}`, `Undo: ${title}`)} title={L("Hoàn tác", "Undo")} onClick={(e) => e.detail < 2 && void brain.undoComplete(t)}>
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

function TaskRow({
  t,
  brain,
  s,
  stuckDays,
  onSplit,
  onNote,
}: {
  t: TodoTask;
  brain: Brain;
  s: BrainState;
  stuckDays?: number;
  onSplit: (t: TodoTask) => void;
  onNote: (n: Note) => void;
}) {
  const [pop, setPop] = useState<"move" | "delete" | "more" | "when" | null>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const plan = s.triggers.find((x) => x.taskId === t.id && !x.fired) ?? null;
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
    plan && (
      <span key="plan" className="chip plan" title={lines.triggerChoice(plan.trigger, s.events)}>
        {lines.triggerChip(plan.trigger, s.events)}
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
    if (restoreFocus) (which === "move" ? moveRef : which === "more" || which === "when" ? moreRef : deleteRef).current?.focus();
  };
  return (
    <li className={`task${pop ? " active" : ""}`} style={{ ["--prio" as string]: PRIO_LINE[prio] }}>
      <button className="check" aria-label={L(`Xong: ${title}`, `Complete: ${title}`)} title={L("Xong", "Complete")} onClick={(e) => e.detail < 2 && void brain.complete(t)}>
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
        <IconButton ref={moreRef} icon="more" label={L("Thêm: thử 2 phút, bắt đầu khi…", "More: try 2 minutes, start when…")} aria-haspopup="menu" aria-expanded={pop === "more" || pop === "when"} onClick={() => setPop(pop === "more" || pop === "when" ? null : "more")} />
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
                const name = short(title, 40);
                const where = due === "today" ? L("hôm nay", "today") : due === "tomorrow" ? L("ngày mai", "tomorrow") : L("ngoài kế hoạch", "off the plan");
                void (due === "no date" ? brain.unplan(t) : brain.reschedule(t, due)).then((ok) =>
                  onNote(
                    ok
                      ? { n: Date.now(), text: L(`Đã dời “${name}” sang ${where} ✓`, `Moved “${name}” to ${where} ✓`), error: false }
                      : { n: Date.now(), text: brain.getSnapshot().errorText ?? L("Chưa dời được, thử lại nhé.", "Couldn't move it, try again."), error: true },
                  ),
                );
              }}
            >
              <Icon name={due === "no date" ? "inbox" : "calendar"} size={15} />
              {label}
            </button>
          ))}
        </Popover>
      )}
      {pop === "more" && (
        <Popover anchor={moreRef} role="menu" label={`“${short(title, 40)}”`} className="menu" onClose={closePop}>
          <div className="menu-body">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPop(null);
                brain.startTwoMinutes(t);
              }}
            >
              <Icon name="play" size={15} />
              {L("Thử 2 phút", "Try 2 minutes")}
            </button>
            <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => setPop("when")}>
              <Icon name="clock" size={15} />
              {L("Bắt đầu khi…", "Start when…")}
              <Icon name="chevronDown" size={13} className="menu-end turn" />
            </button>
          </div>
        </Popover>
      )}
      {pop === "when" && (
        <Popover anchor={moreRef} role="menu" label={L("Bắt đầu khi…", "Start when…")} className="menu" onClose={closePop}>
          <WhenMenu brain={brain} s={s} t={t} plan={plan?.trigger ?? null} onClose={() => setPop(null)} onNote={onNote} />
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

/** "Start when…": after one of today's meetings, when I open an app (a recent one, or typed), or after lunch. */
function WhenMenu({
  brain,
  s,
  t,
  plan,
  onClose,
  onNote,
}: {
  brain: Brain;
  s: BrainState;
  t: TodoTask;
  plan: StartTrigger | null;
  onClose: () => void;
  onNote: (n: Note) => void;
}) {
  const [app, setApp] = useState("");
  const title = taskTitle(t);
  // The next few meetings are enough; the list stays short on a day full of them.
  const choices = useMemo(() => {
    let meetings = 0;
    return brain.startTriggerChoices().filter((c) => c.kind !== "afterMeeting" || ++meetings <= MAX_MEETING_CHOICES);
  }, [brain]);
  const same = (a: StartTrigger, b: StartTrigger | null) =>
    b !== null && a.kind === b.kind && (a.kind !== "afterMeeting" || (b.kind === "afterMeeting" && a.eventId === b.eventId)) && (a.kind !== "appOpen" || (b.kind === "appOpen" && a.app.toLowerCase() === b.app.toLowerCase()));
  const choose = (trigger: StartTrigger) => {
    onClose();
    const ok = brain.setStartTrigger(t, trigger);
    onNote({
      n: Date.now(),
      text: ok ? `⏱ “${short(title, 28)}”: ${lines.triggerChoice(trigger, s.events)}` : L("Chưa hẹn được, thử lại nhé.", "Couldn't set that, try again."),
      error: !ok,
    });
  };
  const typed = app.trim();
  // Arrow, Home and End move the caret in the app field, not between the menu's items.
  const keepKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Home" || e.key === "End" || e.key.startsWith("Arrow")) e.stopPropagation();
  };
  return (
    <div className="menu-body">
      <div className="menu-title">{L("Bắt đầu khi…", "Start when…")}</div>
      {choices.map((c) => (
        // A long meeting title ends in an ellipsis (the CSS), and the tooltip has all of it.
        <button
          key={JSON.stringify(c)}
          type="button"
          role="menuitem"
          title={lines.triggerChoice(c, s.events, Infinity)}
          aria-current={same(c, plan) ? "true" : undefined}
          onClick={() => choose(c)}
        >
          <Icon name={c.kind === "afterMeeting" ? "calendar" : c.kind === "appOpen" ? "reschedule" : "clock"} size={15} />
          <span className="menu-label">{lines.triggerChoice(c, s.events, Infinity)}</span>
          {same(c, plan) && <Icon name="check" size={14} className="menu-end" />}
        </button>
      ))}
      <form
        className="menu-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed) choose({ kind: "appOpen", app: typed });
        }}
      >
        <label className="sr-only" htmlFor={`when-app-${t.id}`}>
          {L("Ứng dụng khác", "Another app")}
        </label>
        <input id={`when-app-${t.id}`} className="field" autoComplete="off" maxLength={60} placeholder={L("Mở ứng dụng khác…", "When I open another app…")} value={app} onChange={(e) => setApp(e.target.value)} onKeyDown={keepKeys} />
        <button className="btn small" disabled={!typed}>
          {L("Đặt", "Set")}
        </button>
      </form>
      {plan && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            brain.clearStartTrigger(t);
            onNote({ n: Date.now(), text: L(`Đã bỏ hẹn giờ cho “${short(title, 28)}”`, `Removed the plan for “${short(title, 28)}”`), error: false });
          }}
        >
          <Icon name="close" size={15} />
          {L("Bỏ hẹn giờ", "Remove the plan")}
        </button>
      )}
    </div>
  );
}

/** **📌 Pin my place** in the Today header: keeps what you're on (never saved to disk) with an optional next step. */
function PinPlace({ brain, s, onNote, compact }: { brain: Brain; s: BrainState; onNote: (n: Note) => void; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLButtonElement>(null);
  const label = L("Ghim chỗ này", "Pin my place");
  const shown = s.pinned ? L("Đã ghim", "Pinned") : label;
  const explain = L(
    "Mình nhớ bạn đang làm gì (việc, ứng dụng, trang web) và nhắc lại khi bạn quay lại. Chỉ giữ trong bộ nhớ, không lưu ra máy.",
    "I remember what you're on (task, app, page) and show it when you're back. Kept in memory only, never saved to disk.",
  );
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) ref.current?.focus();
  };
  const submit = () => {
    const ok = brain.pinPlace(text);
    setOpen(false);
    setText("");
    onNote({ n: Date.now(), text: ok ? lines.pinned() : L("Chưa có gì để ghim, mở một ứng dụng hoặc ghi một dòng nhé.", "Nothing to pin yet: open an app, or write a line."), error: !ok });
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`btn small pin${compact ? " compact" : ""}`}
        data-pinned={s.pinned}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${shown}. ${explain}`}
        title={`${label}: ${explain}`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="pin" size={14} />
        <span className={compact ? "sr-only" : undefined}>{shown}</span>
      </button>
      {open && (
        <Popover anchor={ref} role="dialog" label={label} className="confirm pin-form" onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <p>{explain}</p>
            <label className="sr-only" htmlFor="pin-note">
              {L("Bước tiếp theo (không bắt buộc)", "Next step (optional)")}
            </label>
            <input
              id="pin-note"
              className="field"
              data-autofocus
              autoComplete="off"
              maxLength={120}
              placeholder={L("Bước tiếp theo (không bắt buộc)…", "Next step (optional)…")}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="pop-actions">
              {s.pinned && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    brain.unpinPlace();
                    close(true);
                  }}
                >
                  {L("Bỏ ghim", "Unpin")}
                </button>
              )}
              <button type="submit" className="btn small primary">
                <Icon name="pin" size={14} />
                {L("Ghim", "Pin")}
              </button>
            </div>
          </form>
        </Popover>
      )}
    </>
  );
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** "08:00", or "Mon 08:00" when that is not tomorrow. */
function untilLabel(ms: number): string {
  const d = new Date(ms);
  const near = [dayKey(new Date()), addDays(dayKey(new Date()), 1)].includes(dayKey(d));
  const weekday = near ? "" : `${d.toLocaleDateString(localeTag(getLang()), { weekday: "short" })} `;
  return `${weekday}${timeString(d)}`;
}

/**
 * The work day at a glance (SPEC v0.4 §4): meetings and timed tasks on a strip with a marker for now, and what is
 * still ahead against the time left ("~6h / 7h left"), calm until the day runs an hour over. After 15:00 it also holds
 * the **Wrap up** button; once the day is done it says so, with a way back.
 */
function DayStripCard({ brain, s, onWrapUp }: { brain: Brain; s: BrainState; onWrapUp: () => void }) {
  // The marker and the time left move on their own.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const strip = dayStrip(brain.dayInput());
  const done = s.doneUntil !== null;
  const wrapUpOpen = canWrapUp(Date.now());
  if (!strip.hasContent && !wrapUpOpen && !done) return null;
  const now = new Date(brain.loadClock());
  const t0 = atHour(strip.startHour, 0, now).getTime();
  const length = atHour(strip.endHour, 0, now).getTime() - t0;
  const timeAt = (f: number) => timeString(new Date(t0 + f * length));
  const meetings = strip.segments.filter((x) => x.kind === "meeting").length;
  const timed = strip.segments.length - meetings;
  const detail = lines.loadDetail(strip.load);
  const summary = L(
    `Ngày làm việc ${hh(strip.startHour)} đến ${hh(strip.endHour)}: ${plural(meetings, "cuộc họp", "meeting", "meetings")}, ${plural(timed, "việc có giờ", "timed task", "timed tasks")}. Bây giờ là ${timeString(now)}.`,
    `Work day ${hh(strip.startHour)} to ${hh(strip.endHour)}: ${plural(meetings, "cuộc họp", "meeting", "meetings")}, ${plural(timed, "việc có giờ", "timed task", "timed tasks")}. It is ${timeString(now)} now.`,
  );
  return (
    <section className={`daystrip level-${done ? "ok" : strip.level}${done ? " is-done" : ""}`} aria-label={L("Ngày làm việc hôm nay", "Today's work day")}>
      <div className="ds-head">
        <span className="ds-load" title={done ? undefined : detail}>
          <Icon name={done ? "moon" : "hourglass"} size={14} />
          <span className="ds-text">
            {done ? L(`Xong hôm nay · yên tĩnh tới ${untilLabel(s.doneUntil!)}`, `Done for today · quiet until ${untilLabel(s.doneUntil!)}`) : lines.loadMeter(strip.load)}
          </span>
          {!done && <span className="sr-only">{detail}</span>}
        </span>
        {!done && strip.hasContent && strip.load.capacity > 0 && (
          <span className="ds-meter" aria-hidden>
            <i style={{ width: `${strip.ratio * 100}%` }} />
          </span>
        )}
        <span className="spacer" />
        {done ? (
          <button type="button" className="btn small" onClick={() => brain.resumeDay()} title={L("Pet thức dậy và nhắc việc lại như thường", "Wake the pet and get the usual reminders back")}>
            <Icon name="sun" size={14} />
            {L("Làm tiếp", "Back to work")}
          </button>
        ) : (
          wrapUpOpen && (
            <button type="button" className="btn small wrap-btn" onClick={onWrapUp} title={L("Dọn nốt ngày: dời việc, chọn việc đầu tiên cho mai, ghi một dòng", "Close the day: move what's left, pick tomorrow's first task, leave a note")}>
              <Icon name="moon" size={14} />
              {L("Tổng kết ngày", "Wrap up")}
            </button>
          )
        )}
      </div>
      <div className="ds-track" role="img" aria-label={summary}>
        {strip.segments.map((seg) => (
          <i
            key={`${seg.kind}-${seg.id}`}
            className={`ds-seg ${seg.kind === "meeting" ? "meeting" : "timed"}`}
            style={{ left: `${seg.start * 100}%`, width: `${(seg.end - seg.start) * 100}%` }}
            title={`${seg.kind === "meeting" ? "📅" : "⏰"} ${seg.title} · ${timeAt(seg.start)}–${timeAt(seg.end)}`}
          />
        ))}
        <i className="ds-past" style={{ width: `${strip.now * 100}%` }} />
        <b className="ds-now" style={{ left: `${strip.now * 100}%` }} title={L(`Bây giờ ${timeString(now)}`, `Now ${timeString(now)}`)} />
      </div>
      <div className="ds-axis" aria-hidden>
        <span>{hh(strip.startHour)}</span>
        <span>{hh(strip.endHour)}</span>
      </div>
    </section>
  );
}

/** The note you left yourself last time you wrapped up, all day. */
function PlanNote({ s }: { s: BrainState }) {
  const note = s.todayPlan?.note;
  if (!note) return null;
  return (
    <div className="plan-note" title={note}>
      <span aria-hidden>📝</span>
      <span className="plan-note-text">
        <b>{L("Bạn ghi lại: ", "You left yourself: ")}</b>
        {note}
      </span>
    </div>
  );
}

/**
 * **Wrap up** (SPEC v0.4 §3): today's wins, each unfinished task (Tomorrow / No date / Keep), tomorrow's frog, one line
 * for tomorrow, and **Done for today**. The choices are made here and applied together when you press the button.
 */
function WrapUpSheet({ brain, s, onBack, onDone }: { brain: Brain; s: BrainState; onBack: () => void; onDone: () => void }) {
  const [draft, setDraft] = useState<WrapDraft>(() => brain.wrapDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasks = s.day.today;
  const wins = s.day.completed;
  const { tomorrow, none } = wrapMoves(draft, tasks);
  const choices: [WrapMove, string][] = [
    ["tomorrow", L("Ngày mai", "Tomorrow")],
    ["none", L("Không hạn", "No date")],
    ["keep", L("Giữ", "Keep")],
  ];
  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await brain.wrapUp(draft);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error ?? L("Chưa dời được hết, thử lại nhé.", "Couldn't move everything, try again."));
  };
  const plan = [
    tomorrow.length > 0 && L(`dời ${tomorrow.length} việc sang mai`, `move ${plural(tomorrow.length, "", "task", "tasks").trim()} to tomorrow`),
    none.length > 0 && L(`bỏ ${none.length} việc khỏi kế hoạch`, `take ${plural(none.length, "", "task", "tasks").trim()} off the plan`),
  ].filter(Boolean);
  return (
    <div className="sheet wrap">
      <div>
        <button className="btn ghost small" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
      </div>
      <h2>
        <Icon name="moon" size={18} /> {L("Tổng kết ngày", "Wrap up the day")}
      </h2>
      <p className="muted wrap-intro">{L("Vài cú chạm là xong, không có đúng sai: chỉ là dọn bàn cho mai.", "A few taps, no right answers: just a tidy desk for tomorrow.")}</p>

      <section aria-labelledby="wrap-wins">
        <h3 id="wrap-wins">
          {L("Hôm nay bạn đã làm", "Today's wins")} <span className="count good">{wins.length}</span>
        </h3>
        {wins.length === 0 ? (
          <p className="wrap-empty">{L("Chưa tick việc nào, và vậy cũng không sao: bạn đã có mặt 🌱", "Nothing ticked off yet, and that's okay: you showed up 🌱")}</p>
        ) : (
          <ul className="wrap-wins">
            {wins.slice(0, 4).map((t) => (
              <li key={t.id} title={taskTitle(t)}>
                <Icon name="check" size={13} />
                <span>{taskTitle(t)}</span>
              </li>
            ))}
            {wins.length > 4 && <li className="more">{L(`và ${wins.length - 4} việc nữa`, `and ${wins.length - 4} more`)}</li>}
          </ul>
        )}
      </section>

      <section aria-labelledby="wrap-open">
        <div className="wrap-head">
          <h3 id="wrap-open">
            {L("Còn dang dở", "Still open")} <span className="count">{tasks.length}</span>
          </h3>
          <span className="spacer" />
          {tasks.some(canMove) && (
            <button type="button" className="btn small" onClick={() => setDraft((d) => moveAllToTomorrow(d, tasks))}>
              {L("Tất cả sang mai", "All to tomorrow")}
            </button>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="wrap-empty">{L("Không còn việc nào dang dở 🎉", "Nothing left open 🎉")}</p>
        ) : (
          <ul className="wrap-tasks">
            {tasks.map((t) => {
              const title = taskTitle(t);
              const move = draft.moves[t.id] ?? "keep";
              const movable = canMove(t);
              return (
                <li key={t.id} className={`wrap-row${move === "none" ? " off" : ""}`}>
                  <div className="wrap-title" title={title}>
                    {title}
                  </div>
                  <div className="wrap-ctl">
                    <div className="seg" role="group" aria-label={L(`Làm gì với “${short(title, 40)}”`, `What to do with “${short(title, 40)}”`)}>
                      {choices.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={move === value}
                          disabled={value !== "keep" && !movable}
                          onClick={() => setDraft((d) => chooseMove(d, tasks, t.id, value))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {!movable && (
                      <span className="chip" title={L("Việc lặp lại giữ lịch riêng của nó", "A repeating task keeps its own schedule")}>
                        🔁
                      </span>
                    )}
                    <label className="frog-pick" title={L("Con ếch của ngày mai: việc làm đầu tiên", "Tomorrow's frog: the first thing to do")}>
                      <input type="radio" name="wrap-frog" checked={draft.frogId === t.id} disabled={move === "none"} onChange={() => setDraft((d) => chooseFrog(d, tasks, t.id))} />
                      <span>🐸 {L("Đầu tiên mai", "First tomorrow")}</span>
                      <span className="sr-only">{`: ${title}`}</span>
                    </label>
                  </div>
                </li>
              );
            })}
            <li className="wrap-row nofrog">
              <label className="frog-pick">
                <input type="radio" name="wrap-frog" checked={draft.frogId === null} onChange={() => setDraft((d) => chooseFrog(d, tasks, null))} />
                <span>{L("Mai mình chọn sau", "I'll decide tomorrow")}</span>
              </label>
            </li>
          </ul>
        )}
      </section>

      <div className="wrap-note">
        <label htmlFor="wrap-note">{L("Mai mình bắt đầu từ đâu?", "Where do I start tomorrow?")}</label>
        <input
          id="wrap-note"
          className="field"
          autoComplete="off"
          maxLength={MAX_NOTE_LENGTH}
          placeholder={L("Một dòng cho chính mình…", "One line for future you…")}
          value={draft.note}
          onChange={(e) => setDraft((d) => setNote(d, e.target.value))}
        />
      </div>

      <p className="muted wrap-summary" role="status">
        {plan.length > 0 ? `${plan.join(L(" và ", " and ")).replace(/^./, (c) => c.toLocaleUpperCase())}. ` : ""}
        {L(
          `Pet sẽ ngủ và im lặng tới khi ngày làm việc tới bắt đầu (${hh(s.prefs.workStart)}). Cuộc họp và việc có giờ vẫn được nhắc.`,
          `Your pet will sleep and stay quiet until the next workday starts (${hh(s.prefs.workStart)}). Meetings and timed tasks still get through.`,
        )}
      </p>
      {error && <div className="error">{error}</div>}
      <div className="wrap-actions">
        <button className="btn primary" disabled={busy} onClick={() => void submit()}>
          <Icon name="moon" size={15} />
          {busy ? "…" : L("Xong hôm nay", "Done for today")}
        </button>
        <button className="btn" onClick={onBack} disabled={busy}>
          {L("Chưa đâu", "Not yet")}
        </button>
      </div>
    </div>
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

interface Note {
  n: number;
  text: string;
  error: boolean;
}

function AddTask({
  brain,
  focusAdd,
  prefill,
  seq,
  note,
  setNote,
}: {
  brain: Brain;
  focusAdd: boolean;
  /** Text to start the field with ("Team sync: "), from the after-meeting bubble. */
  prefill: string | null;
  seq: number;
  note: Note | null;
  setNote: (n: Note | null) => void;
}) {
  const [text, setText] = useState("");
  const [due, setDue] = useState<DueChoice>("today");
  const [prio, setPrio] = useState(4);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusAdd) input.current?.focus();
  }, [focusAdd, seq]);
  useEffect(() => {
    if (prefill === null) return;
    setText(prefill);
    // After the value lands, with the cursor at its end so typing goes on from "Team sync: ".
    const id = requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prefill.length, prefill.length);
    });
    return () => cancelAnimationFrame(id);
  }, [prefill, seq]);
  useEffect(() => {
    if (!note || note.error) return;
    const id = setTimeout(() => setNote(null), 4500);
    return () => clearTimeout(id);
  }, [note]);
  const submit = async () => {
    const content = text.trim();
    if (!content) return;
    // Clear right away, so whatever is typed next while this add is in flight is kept.
    setText("");
    setBusy(true);
    const ok = await brain.add(content, due, 5 - prio);
    setBusy(false);
    if (!ok) {
      setText((now) => (now.trim() ? now : content));
      setNote({ n: Date.now(), text: brain.getSnapshot().errorText ?? L("Chưa thêm được, thử lại nhé.", "Couldn't add it, try again."), error: true });
      return;
    }
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
      {s.craft !== null && <Yarn value={s.craft} />}
      <button className="btn small" onClick={() => brain.stopFocus()}>
        {L("Dừng", "Stop")}
      </button>
    </div>
  );
}

/** Knitting progress while focusing: a yarn ball inside a ring that fills up, and the percent. */
function Yarn({ value }: { value: number }) {
  const { pct, title } = yarnText(value);
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <span className="yarn" title={title} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={L("Đan đồ cho góc nhà", "Knitting for the home corner")} aria-valuetext={title}>
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" focusable="false">
        <circle className="yarn-track" cx="15" cy="15" r={r} />
        <circle className="yarn-ring" cx="15" cy="15" r={r} strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 15 15)" />
        <circle className="yarn-ball" cx="15" cy="15" r="7.5" />
        <path className="yarn-lines" d="M9.4 12.6c2.7-.2 5.7 1.6 7.2 6M11.7 8.6c2.4 1.3 4.5 3.7 5.1 7.2M8.2 16.6c1.9-.2 4.3.9 5.5 4" />
        <path className="yarn-tail" d="M20.6 19.4c1.4 1 1.6 2.4.6 3.4" />
      </svg>
      <b className="yarn-pct">{pct}%</b>
    </span>
  );
}

/** While the pet is away: where it went, when it's back, and a button to call it home early. */
function TripBanner({ brain, s }: { brain: Brain; s: BrainState }) {
  const b = tripBanner(s.trip!, Date.now());
  const hint = useId();
  return (
    <div className="trip-banner" role="status">
      <span className="trip-icon" aria-hidden>
        <Icon name="luggage" size={16} />
      </span>
      <span className="trip-text">
        <b>{b.title}</b> · {b.back}
      </span>
      <button type="button" className="btn small" title={b.hint} aria-describedby={hint} onClick={() => brain.callBack()}>
        {L("Gọi về", "Call back")}
      </button>
      <span id={hint} className="sr-only">
        {b.hint}
      </span>
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
  // Most useful first: the summary is one line and its tail gets cut on narrow boards.
  const parts = [plural(s.events.length, "cuộc họp", "meeting", "meetings")];
  if (upcoming) parts.push(upcoming === current ? L(`đang họp: ${upcoming.title}`, `now: ${upcoming.title}`) : `${timeString(upcoming.start)} ${upcoming.title}`);
  if (s.suggestions.length > 0) parts.push(plural(s.suggestions.length, "gợi ý giờ làm", "time block", "time blocks"));
  if (s.target < s.prefs.dailyTarget) parts.push(L(`mục tiêu ${s.target} việc`, `target ${s.target}`));
  parts.push(L(`trống ${hoursText(free)}`, `${hoursText(free)} free`));
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

function Wardrobe({ brain, s, onBack, onHome }: { brain: Brain; s: BrainState; onBack: () => void; onHome: () => void }) {
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + i)));
  const perfect = new Set(s.life.perfectDays);
  const locked = SPECIES_IDS.map(speciesInfo).filter((x) => x.unlock);
  return (
    <div className="sheet">
      <div className="sheet-nav">
        <button className="btn ghost small" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
        <button className="btn small" onClick={onHome}>
          <Icon name="home" size={14} /> {L("Góc nhà", "Home")}
        </button>
      </div>
      <h2>
        <Icon name="hanger" size={18} /> {L("Tủ đồ", "Wardrobe")}
      </h2>
      <ChestStrip s={s} />
      {WARDROBE_GROUPS.map((g) => (
        <AccessoryGroup key={g.id} id={g.id} items={g.items} brain={brain} s={s} />
      ))}
      <SouvenirShelf s={s} />
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
      <StickerPage s={s} />
      <h2>
        <Icon name="calendar" size={18} /> {L("Ngày hoàn hảo (30 ngày)", "Perfect days (last 30)")}
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

/** A small heading inside a sheet: title, an owned/total count, and an optional note on the right. */
function GroupHead({ id, title, count, aside }: { id: string; title: string; count: string; aside?: string }) {
  return (
    <div className="w-group-head">
      <h3 id={id}>{title}</h3>
      <span className="count">{count}</span>
      {aside && (
        <span className="w-aside" title={aside}>
          {aside}
        </span>
      )}
    </div>
  );
}

/** Chests held, today's count and the next one, the season in progress, and the published odds. */
function ChestStrip({ s }: { s: BrainState }) {
  const [open, setOpen] = useState(false);
  const odds = useId();
  const c = s.chests;
  const progress = chestProgress(c);
  const season = s.season?.season ?? null;
  return (
    <section className="chests" aria-label={L("Rương quà", "Chests")}>
      <div className="chest-row">
        <span className={`chest-held${c.held > 0 ? " has" : ""}`} title={L("Xong một việc là mở một rương", "Finish a task to open one")}>
          <span aria-hidden>🎁</span>
          <b>×{c.held}</b>
          <span className="sr-only">{L(`${c.held} rương chờ mở. Xong một việc là mở một rương.`, `${plural(c.held, "", "chest", "chests").trim()} to open. Finish a task to open one.`)}</span>
        </span>
        <span className="chest-next">
          <span className="chest-next-text">{progress.text}</span>
          {progress.meter !== null && (
            <span className="chest-meter" aria-hidden>
              <i style={{ width: `${progress.meter * 100}%` }} />
            </span>
          )}
        </span>
        <span className="chest-today" title={L("Mỗi ngày nhận tối đa 3 rương", "Up to 3 chests a day")}>
          {L("hôm nay", "today")} <b>{c.today}/3</b>
        </span>
      </div>
      <div className="chest-row">
        <span className={`season-chip${s.season ? " on" : ""}`}>{seasonLine(s.season, new Date(), localeTag(getLang()))}</span>
        <button type="button" className="odds-toggle" aria-expanded={open} aria-controls={odds} onClick={() => setOpen(!open)}>
          {L("Tỉ lệ quà", "Odds")}
          <Icon name="chevronDown" size={13} className="chev" />
        </button>
      </div>
      {open && (
        <div className="odds" id={odds}>
          <div className="odds-bar" aria-hidden>
            {TIERS.map((t) => (
              <i key={t} className={`tier-${t}`} style={{ flexGrow: oddsPercent(t) }} />
            ))}
          </div>
          <ul>
            {TIERS.map((t) => (
              <li key={t} className={`tier-${t}`}>
                <span className="tier-name">
                  <i aria-hidden />
                  {tierName(t)}
                </span>
                <b className="tier-pct">{oddsPercent(t)}%</b>
                <span className="tier-gives">{tierGives(t, season)}</span>
              </li>
            ))}
          </ul>
          <p className="odds-note">
            {L(
              "Cứ 30 phút làm việc chăm chỉ là có một rương, tối đa 3 rương mỗi ngày. Xong một việc là mở một rương. Quà chỉ để vui thôi, không bán gì cả.",
              "A chest for every 30 minutes of active work, up to 3 a day. Finishing a task opens one. It's all just for fun: nothing is ever sold.",
            )}
          </p>
        </div>
      )}
    </section>
  );
}

/** The pet wearing just this accessory (its upper body, where they all sit), as SVG; drawn once per species, stage and item. */
const wearCache = new Map<string, string>();
function wearSvg(species: SpeciesId, stage: StageIndex, a: Accessory): string {
  const key = `${species}-${stage}-${a}`;
  let svg = wearCache.get(key);
  if (!svg) {
    const pose = defaultPose({ t: 1.3, stage, wearing: [a] });
    const box = previewViewBox(petBounds(species, pose));
    svg = renderPet(species, pose, { size: 48, idPrefix: `wear-${key}` }).replace('viewBox="0 0 160 160"', `viewBox="${box}"`);
    wearCache.set(key, svg);
  }
  return svg;
}

/** One group of accessories: milestones show what unlocks them, chest finds and seasonal ones where they come from. */
function AccessoryGroup({ id, items, brain, s }: { id: WardrobeGroupId; items: readonly Accessory[]; brain: Brain; s: BrainState }) {
  const stage = life.stageOf(s.life.xp);
  const head = useId();
  const owned = items.filter((a) => s.life.unlocked.includes(a)).length;
  const status = (a: Accessory, has: boolean, wearing: boolean): string => {
    if (has) return wearing ? L("Đang đeo", "Wearing") : L("Bấm để đeo", "Tap to wear");
    if (id === "milestone") {
      const p = life.accessoryProgress(a, s.life);
      return `${life.accessoryRequirement(a)} (${p.have}/${p.need})`;
    }
    if (id === "chest") return L("Có trong rương quà", "Found in chests");
    const season = life.SEASONAL_ACCESSORIES[a]!;
    return s.season?.season === season ? L(`${seasonLabel(season)} · đang có trong rương!`, `${seasonLabel(season)} · in chests now!`) : seasonLabel(season);
  };
  return (
    <section className="w-group" aria-labelledby={head}>
      <GroupHead id={head} title={groupTitle(id)} count={`${owned}/${items.length}`} />
      <div className={`wardrobe${id === "chest" ? " cols-4" : ""}`}>
        {items.map((a) => {
          const has = s.life.unlocked.includes(a);
          const wearing = s.life.wearing.includes(a);
          const inSeason = id === "seasonal" && !has && s.season?.season === life.SEASONAL_ACCESSORIES[a];
          return (
            <button
              key={a}
              className={`item${wearing ? " wearing" : ""}${has ? "" : " locked"}${inSeason ? " in-season" : ""}`}
              disabled={!has}
              aria-pressed={wearing}
              onClick={() => brain.toggleAccessory(a)}
            >
              <span className="wear" aria-hidden dangerouslySetInnerHTML={{ __html: wearSvg(s.prefs.species, stage, a) }} />
              {life.accessoryName(a)}
              <small>{status(a, has, wearing)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The 16 souvenirs from trips: the ones brought home on a shelf, the rest as silhouettes. */
function SouvenirShelf({ s }: { s: BrainState }) {
  const head = useId();
  const owned = new Set(s.life.souvenirs);
  return (
    <section className="w-group" aria-labelledby={head}>
      <GroupHead
        id={head}
        title={L("Quà lưu niệm", "Souvenirs")}
        count={`${owned.size}/${SOUVENIRS.length}`}
        aside={L("Xong hết kế hoạch là pet rủ đi chơi", "Finish the day's plan and the pet goes on a trip")}
      />
      <ul className="shelf">
        {SOUVENIRS.map((x) => {
          const has = owned.has(x.id);
          const label = has ? `${itemName(x.id)} · ${L("từ", "from")} ${placeName(x.id)}` : L("Chưa có · đi chơi sẽ mang về", "Not found yet · trips bring these home");
          return (
            <li key={x.id} className={`souvenir${has ? "" : " missing"}`} title={label} aria-label={label}>
              <span aria-hidden>{x.emoji}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Decorations as SVG strings, drawn once per id and size. */
const decorCache = new Map<string, string>();
function decorSvg(id: DecorId, size: number): string {
  const key = `${id}-${size}`;
  let svg = decorCache.get(key);
  if (!svg) {
    svg = renderDecor(id, { size, idPrefix: `board-${key}` });
    decorCache.set(key, svg);
  }
  return svg;
}

/** Board → Wardrobe → Home: the decorations the pet knitted, up to 3 of them set out beside it on the taskbar. */
function HomeSheet({ brain, s, onBack }: { brain: Brain; s: BrainState; onBack: () => void }) {
  const owned = s.life.decor;
  const shown = homeDecor(s.prefs.homeItems, owned);
  const [note, setNote] = useState<string | null>(null);
  const head = useId();
  const knit = Math.round(s.life.craft * 100);
  const pick = (d: DecorId) => {
    const next = toggleHomeItem(s.prefs.homeItems, owned, d);
    if (!next) {
      setNote(L("Góc nhà chỉ vừa 3 món thôi. Cất bớt một món rồi chọn tiếp nhé.", "The corner fits 3. Put one away first, then pick another."));
      return;
    }
    setNote(null);
    void brain.updatePrefs({ homeItems: next });
  };
  const aside =
    owned.length === 0
      ? undefined
      : s.prefs.homeItems.length === 0
        ? L("Đang bày 3 món mới nhất", "Showing your 3 newest")
        : L(`Đã chọn ${shown.length}/${MAX_HOME_ITEMS}`, `${shown.length}/${MAX_HOME_ITEMS} chosen`);
  return (
    <div className="sheet">
      <div className="sheet-nav">
        <button className="btn ghost small" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> {L("Tủ đồ", "Wardrobe")}
        </button>
      </div>
      <h2>
        <Icon name="home" size={18} /> {L("Góc nhà", "Home")}
      </h2>
      <p className="sheet-lead">
        {L("Pet đan mấy món này trong lúc bạn tập trung. Chọn tối đa 3 món để bày cạnh pet trên thanh tác vụ.", "Your pet knits these while you focus. Pick up to 3 to set out beside it on the taskbar.")}
      </p>
      <div className={`home-preview${s.prefs.showHome ? "" : " off"}`} aria-hidden>
        {Array.from({ length: MAX_HOME_ITEMS }, (_, i) =>
          shown[i] ? <span key={shown[i]} className="home-spot" dangerouslySetInnerHTML={{ __html: decorSvg(shown[i], 52) }} /> : <span key={`empty-${i}`} className="home-spot empty" />,
        )}
        {!s.prefs.showHome && <span className="home-off">{L("Đang ẩn", "Hidden")}</span>}
      </div>
      <label className="home-toggle">
        <input type="checkbox" role="switch" className="switch" checked={s.prefs.showHome} onChange={(e) => void brain.updatePrefs({ showHome: e.target.checked })} />
        {L("Bày góc nhà trên thanh tác vụ", "Show home on the taskbar")}
      </label>
      <section className="w-group" aria-labelledby={head}>
        <GroupHead id={head} title={L("Đồ trang trí", "Decorations")} count={`${owned.length}/${DECOR_IDS.length}`} aside={aside} />
        <div className="decor-grid">
          {DECOR_IDS.map((d) => {
            if (!owned.includes(d)) {
              return (
                <div key={d} className="decor missing" title={L("Chưa đan", "Not knitted yet")}>
                  <span className="decor-art" aria-hidden dangerouslySetInnerHTML={{ __html: decorSvg(d, 40) }} />
                  <span className="decor-name">{decorName(d)}</span>
                  <span className="sr-only">{L(", chưa đan", ", not knitted yet")}</span>
                </div>
              );
            }
            const on = shown.includes(d);
            return (
              <button key={d} type="button" className={`decor${on ? " on" : ""}`} aria-pressed={on} onClick={() => pick(d)}>
                <span className="decor-art" aria-hidden dangerouslySetInnerHTML={{ __html: decorSvg(d, 40) }} />
                <span className="decor-name">{decorName(d)}</span>
                {on && (
                  <span className="decor-check" aria-hidden>
                    <Icon name="check" size={10} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <div className={`home-note${note ? " warn" : ""}`} role="status">
        {note ?? (
          <>
            <Icon name="yarn" size={15} />
            <span>
              {owned.length < DECOR_IDS.length
                ? L(`Đan thêm trong những phiên tập trung nhé · món đang đan được ${knit}%`, `Knit them during focus sessions · the next one is ${knit}% done`)
                : L("Đủ cả 12 món rồi! Giờ mỗi món đan xong được +30 XP, tối đa 90 XP mỗi ngày", "All 12 made! Each one knitted now gives +30 XP, up to 90 XP a day")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** The sticker page being filled: 2 gift stickers, one per perfect day, and the empty slots left until the reward. */
function StickerPage({ s }: { s: BrainState }) {
  const { stickerPage: page, pageFilled: filled } = s.life;
  const earned = Math.max(0, filled - life.PAGE_GIFTS);
  // The page's own stickers are the latest perfect days.
  const dates = earned > 0 ? s.life.perfectDays.slice(-earned) : [];
  const left = life.PAGE_SIZE - filled;
  const slots = Array.from({ length: life.PAGE_SIZE }, (_, i) => (i < Math.min(filled, life.PAGE_GIFTS) ? "gift" : i < filled ? "star" : "empty"));
  const perfectHelp = L("Ngày hoàn hảo: đạt mục tiêu và xong hết việc đã lên kế hoạch.", "A perfect day: you hit your goal and finished everything you planned.");
  return (
    <>
      <h2>
        <Icon name="star" size={18} /> {L(`Trang sticker ${page}`, `Sticker page ${page}`)}
      </h2>
      <div className="sticker-page" role="img" aria-label={L(`Trang ${page}: ${filled} trên ${life.PAGE_SIZE} ô đã dán`, `Page ${page}: ${filled} of ${life.PAGE_SIZE} stickers`)}>
        {slots.map((kind, i) => {
          const date = kind === "star" ? dates[i - life.PAGE_GIFTS] : undefined;
          return (
            <span key={i} className={`slot ${kind}`} title={kind === "gift" ? L("Quà tặng 🎁", "A gift 🎁") : date ?? (kind === "star" ? "🌟" : undefined)}>
              {kind === "gift" ? "🎁" : kind === "star" ? "🌟" : ""}
            </span>
          );
        })}
      </div>
      <div className="muted page-note" title={perfectHelp}>
        {filled}/{life.PAGE_SIZE} ·{" "}
        {L(`còn ${left} ngày hoàn hảo nữa là có quà (+50 XP, 🍪)`, `${plural(left, "", "more perfect day", "more perfect days").trim()} for a gift (+50 XP, 🍪)`)}
      </div>
    </>
  );
}

/** "🔔 5 left today": the unsolicited reminders the pet may still use today; the tooltip says what's free. */
function NudgeCount({ s }: { s: BrainState }) {
  const left = s.nudgesLeft;
  const hold = s.nudgeHoldUntil !== null && s.nudgeHoldUntil > Date.now() ? timeString(new Date(s.nudgeHoldUntil)) : null;
  const title =
    L(
      `Hôm nay còn ${left}/${s.prefs.nudgeBudget} lần nhắc. Việc có giờ, cuộc họp, lời chào buổi sáng, tổng kết cuối ngày, thẻ “bạn đang làm gì”, câu hỏi sau họp, cảnh báo quá tải, lời rủ đi chơi và việc bạn tự hẹn giờ không tính.`,
      `${left} of ${s.prefs.nudgeBudget} reminders left today. Timed tasks, meetings, the morning hello, the end-of-day review, the "where was I?" card, the question after a meeting, the overbooked check, the trip offer and plans you set yourself don't count.`,
    ) + (hold ? L(` Đang tạm im tới ${hold}.`, ` Holding reminders until ${hold}.`) : "");
  // A plain span can't carry an aria-label: the count is a status, and the detail is read as hidden text.
  return (
    <span className={`nudges${left === 0 ? " none" : ""}`} role="status" title={title}>
      <span aria-hidden>{left > 0 && !hold ? "🔔" : "🔕"}</span>
      <span aria-hidden>
        {left > 0 ? (
          // The words in .nudges-day give way on a narrow board ("8 left", "8 lượt"); the tooltip says the rest.
          <>
            <span className="nudges-day">{L("còn ", "")}</span>
            {L(`${left} lượt`, `${left} left`)}
            <span className="nudges-day">{L("", " today")}</span>
          </>
        ) : (
          L("hết lượt", "none left")
        )}
      </span>
      <span className="sr-only">{title}</span>
    </span>
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
      {s.hasToken && <NudgeCount s={s} />}
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
