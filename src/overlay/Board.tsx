import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import type { Backend } from "../backend/types";
import { errorMessage, showsOverBoard, type Brain, type BrainState, type DueChoice } from "../core/brain";
import { currentEvent, freeMinutes } from "../core/calendar";
import { atHour, daysAgo, dayKey, hoursText, parseDate, timeString } from "../core/dates";
import { getLang, L, plural } from "../core/l10n";
import * as life from "../core/life";
import * as lines from "../core/lines";
import { dueDay, dueTime, isRecurring, planned, taskTitle, uiPriority, type TodoTask } from "../core/models";
import { moodEmoji, moodLabel } from "../core/mood";
import { isWorkday } from "../core/prefs";
import { MIN_APP_NAME, normalizeAppName, type StartTrigger } from "../core/triggers";
import { ACCESSORIES, SPECIES_IDS } from "../core/types";
import { canMove } from "../core/wrapup";
import { defaultPose, renderPet, speciesInfo } from "../pets";
import { Icon, type IconName } from "../ui/icons";
import { localeTag } from "../ui/lang";
import type { BoardRequest } from "./App";
import { BubbleView } from "./Bubble";
import { DayStripCard } from "./DayStrip";
import type { BoardPlacement } from "./placement";
import { Popover } from "./Popover";
import { nextWorkdayName, WrapUpSheet } from "./WrapUp";

type View = { kind: "main" } | { kind: "split"; task: TodoTask } | { kind: "wardrobe" } | { kind: "wrapup" };

/** Priority text colors (AA on the board's surfaces) and check-circle colors, P1…P4. */
const PRIO_INK = ["", "var(--p1-ink)", "var(--p2-ink)", "var(--p3-ink)", "var(--p4-ink)"];
const PRIO_LINE = ["", "var(--p1-line)", "var(--p2-line)", "var(--p3-line)", "var(--p4-line)"];

/**
 * A sheet that replaces the list takes the keyboard to its heading when it opens. Without it a mouse click on a button
 * of the list leaves the focus on the page (that button is gone), and Escape would close the whole board instead of
 * going back to the list.
 */
function useHeadingFocus() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return heading;
}

/** A board shorter than this (px) is "compact": the Wrap up sheet fits its list in. */
const COMPACT_BELOW = 600;

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
  "data-split"?: "";
  "data-wardrobe"?: "";
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
  // "Lighten the day": the board opened to move tasks off an overbooked day (it ends when the day fits, or with its close button).
  const [lighten, setLighten] = useState(request.lighten);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (request.split) setView({ kind: "split", task: request.split });
    else if (request.wrapUp) setView({ kind: "wrapup" });
    else if (request.focusAdd || request.lighten || request.focusTaskId) setView({ kind: "main" });
    setLighten(request.lighten);
  }, [request]);

  // Fresh data whenever the board opens (like clicking the macOS pet).
  useEffect(() => {
    void brain.refresh();
  }, [brain, request.seq]);

  // Opened from the keyboard (Enter on the pet): move focus into the board so Tab continues there.
  useEffect(() => {
    if (request.fromKeyboard && !request.focusAdd) ref.current?.focus({ preventScroll: true });
  }, [request]);

  // Back from a sheet: focus goes to the button that opened it (the Wrap up button, the task's Split, the Wardrobe button).
  const lastView = useRef<View>(view);
  useEffect(() => {
    const was = lastView.current;
    lastView.current = view;
    if (was.kind === view.kind || view.kind !== "main") return;
    // (Unless something else asked for the focus: a bubble's "Open" on a task.)
    if (request.focusTaskId) return;
    const board = ref.current;
    if (!board) return;
    let target: HTMLElement | null = null;
    if (was.kind === "wrapup") target = board.querySelector<HTMLElement>("[data-wrap-up]");
    else if (was.kind === "wardrobe") target = board.querySelector<HTMLElement>("[data-wardrobe]");
    else if (was.kind === "split") {
      const row = [...board.querySelectorAll<HTMLElement>("li.task")].find((e) => e.dataset.taskId === was.task.id);
      target = row?.querySelector<HTMLElement>("[data-split]") ?? row ?? null;
    }
    (target ?? board).focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const needsToken = !s.hasToken || s.authError;
  // A board that is short (it opened above the pet, or the screen is) gives its sheets a tighter layout.
  const compact = placement.height < COMPACT_BELOW;
  const origin = placement.side === "left" ? "100% 100%" : placement.side === "right" ? "0% 100%" : "50% 100%";
  // An urgent bubble (a meeting, a timed task) is not held back by the open board: it shows here, with its buttons.
  const banner = s.bubble && showsOverBoard(s.bubble) && !brain.bubbleStale(s.bubble) ? s.bubble : null;
  // A check-in shown here ("Move some?") is read here: once the board closes it isn't shown again over the pet.
  const bannerId = banner?.id ?? null;
  useEffect(() => {
    if (bannerId !== null) brain.bannerRead(bannerId);
  }, [brain, bannerId]);
  useEffect(() => () => brain.boardClosed(), [brain]);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      role="dialog"
      className={`board side-${placement.side}${compact ? " compact" : ""}`}
      data-hit=""
      // Anchored by its bottom edge and as tall as its content, up to the room it was given.
      style={{ left: placement.left, bottom: placement.bottom, width: placement.width, maxHeight: placement.height, transformOrigin: origin }}
      aria-label={L("Bảng việc", "Task board")}
      onKeyDown={(e) => {
        // Escape inside a sheet goes back to the list, like its Back button; from the list it closes the board (App).
        if (e.key === "Escape" && !e.defaultPrevented && view.kind !== "main" && !needsToken) {
          const busy = ref.current?.querySelector("[aria-busy='true']");
          e.preventDefault();
          if (!busy) setView({ kind: "main" });
        }
      }}
    >
      <Header s={s} backend={backend} onClose={onClose} onWardrobe={() => setView({ kind: "wardrobe" })} />
      {banner && <BubbleView key={banner.id} bubble={banner} brain={brain} banner />}
      <div className="board-body">
        {needsToken ? (
          <Connect brain={brain} backend={backend} error={s.errorText} authError={s.hasToken && s.authError} />
        ) : view.kind === "split" ? (
          <SplitSheet brain={brain} s={s} task={view.task} onDone={() => setView({ kind: "main" })} />
        ) : view.kind === "wardrobe" ? (
          <Wardrobe brain={brain} s={s} onBack={() => setView({ kind: "main" })} />
        ) : view.kind === "wrapup" ? (
          <WrapUpSheet brain={brain} s={s} compact={compact} onBack={() => setView({ kind: "main" })} onDone={onClose} />
        ) : (
          <Main
            brain={brain}
            backend={backend}
            s={s}
            focusAdd={request.focusAdd}
            prefill={request.prefill}
            seq={request.seq}
            focusTaskId={request.focusTaskId}
            lighten={lighten}
            onLighten={setLighten}
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
        <IconButton icon="hanger" label={L("Tủ đồ & thành tích", "Wardrobe & achievements")} onClick={onWardrobe} data-wardrobe="" />
        <IconButton icon="book" label={L("Nhật ký của pet", "Pet diary")} onClick={() => void backend.system.openWindow("diary")} />
        <IconButton icon="gear" label={L("Cài đặt", "Settings")} onClick={() => void backend.system.openWindow("settings")} />
        <IconButton icon="close" label={L("Đóng (Esc)", "Close (Esc)")} onClick={onClose} />
      </div>
      {s.hasToken && !s.authError && <Stats s={s} />}
      {s.hasToken && !s.authError && <RepairLine s={s} />}
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
  const now = new Date(brain.clockNow());
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
  focusTaskId,
  lighten,
  onLighten,
  onSplit,
  onWrapUp,
}: {
  brain: Brain;
  backend: Backend;
  s: BrainState;
  focusAdd: boolean;
  prefill: string | null;
  seq: number;
  focusTaskId: string | null;
  lighten: boolean;
  onLighten: (on: boolean) => void;
  onSplit: (t: TodoTask) => void;
  onWrapUp: () => void;
}) {
  const day = s.day;
  const stuckIds = new Map(s.stuck.map((x) => [x.task.id, x.days]));
  const done = day.completed.length;
  const dayOff = s.prefs.restDays.includes(dayKey(new Date(brain.clockNow())));
  // Nothing to plan on a day off, nor once the day is wrapped up (what you moved to tomorrow was on purpose).
  const toPlan = dayOff || s.doneUntil !== null ? 0 : s.target - planned(day);
  // One confirmation line under the add form, for adds and for moves.
  const [note, setNote] = useState<Note | null>(null);

  // Opening the lighten view answers the "Move some?" bubble: it isn't shown again.
  useEffect(() => {
    brain.setLightening(lighten);
  }, [brain, lighten]);
  // Lightening the day: it goes on until the day fits (the strip updates as tasks move), or you close it.
  const load = brain.currentLoad();
  const over = load.overBy;
  const fits = over <= 0;
  // A move that makes it fit says so in its own note ("Moved … ✓ Nice, today fits now ✓"); any other way says it here.
  const moving = useRef(false);
  useEffect(() => {
    if (!lighten || !fits) return;
    onLighten(false);
    if (!moving.current) setNote({ n: Date.now(), text: lines.dayFits(), error: false });
  }, [lighten, fits, onLighten]);
  // After a task leaves the list, the keyboard stays in the board instead of falling to the page: on the next row's
  // "→ Tomorrow" (the one before it when it was the last), or, when that move made the day fit and the view closed,
  // on the add field.
  const listRef = useRef<HTMLElement>(null);
  const refocus = useRef<{ index: number; until: number } | null>(null);
  useEffect(() => {
    const at = refocus.current;
    if (!at) return;
    refocus.current = null;
    if (Date.now() > at.until) return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("li.task") ?? [])];
    const goOf = (r: HTMLElement) => r.querySelector<HTMLButtonElement>(".lighten-go:not(:disabled)");
    const stays = lighten && !fits;
    let target: HTMLElement | null | undefined;
    if (stays) {
      target = rows.slice(at.index).map(goOf).find(Boolean) ?? rows.slice(0, at.index).reverse().map(goOf).find(Boolean) ?? listRef.current?.querySelector<HTMLElement>(".lighten-banner button");
    } else {
      // The day fits and the view closed: back to the top of the board, where the add field and the note about it are
      // (not on the next row's tick: a second Enter would finish a task you only meant to move).
      target = listRef.current?.closest(".board")?.querySelector<HTMLElement>("#add-task");
    }
    (target ?? listRef.current?.closest<HTMLElement>(".board"))?.focus({ preventScroll: true });
  }, [day.today.length]);
  // The view opens on its first "→ Tomorrow" (whoever opened it: the chip, a bubble's button), so the keyboard
  // continues in the list; when it ends and the focus has nowhere to be, it goes to the chip it came from.
  const wasLightening = useRef(false);
  useEffect(() => {
    if (lighten && !wasLightening.current) {
      wasLightening.current = true;
      const go = listRef.current?.querySelector<HTMLElement>(".lighten-go:not(:disabled)");
      go?.focus({ preventScroll: true });
      // The timeline folds away over a fifth of a second; once it has, the first rows are brought into view (scrolling
      // before would aim at where they were).
      const id = window.setTimeout(() => {
        const body = go?.closest(".board-body");
        const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("li.task") ?? [])];
        if (!go || !body || rows.length === 0) return;
        // The first few rows all in view: that is what lightening is about. If they are not, the list starts at the top.
        const b = body.getBoundingClientRect();
        const first = rows[0].getBoundingClientRect();
        const last = rows[Math.min(rows.length, 3) - 1].getBoundingClientRect();
        if (first.top < b.top || last.bottom > b.bottom) listRef.current?.scrollIntoView?.({ block: "start" });
      }, 260);
      return () => window.clearTimeout(id);
    } else if (!lighten && wasLightening.current) {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) {
        const board = listRef.current?.closest<HTMLElement>(".board");
        (board?.querySelector<HTMLElement>(".ds-over") ?? board?.querySelector<HTMLElement>("#add-task") ?? board)?.focus({ preventScroll: true });
      }
    }
    wasLightening.current = lighten;
  }, [lighten]);

  // "Open" on a meeting's related task: scroll to it, give it the focus, and flash it so the eye finds it.
  const [flash, setFlash] = useState<string | null>(null);
  const focused = useRef(-1);
  useEffect(() => {
    if (!focusTaskId || focused.current === seq) return;
    const li = [...document.querySelectorAll<HTMLElement>(".board [data-task-id]")].find((e) => e.dataset.taskId === focusTaskId);
    if (!li) return;
    focused.current = seq;
    li.scrollIntoView?.({ block: "nearest" });
    li.focus({ preventScroll: true });
    setFlash(focusTaskId);
    setTimeout(() => setFlash(null), 2400);
  }, [focusTaskId, seq, day]);

  const dayName = nextWorkdayName(brain);
  return (
    <>
      {s.focus && <FocusCard brain={brain} s={s} />}

      <AddTask brain={brain} focusAdd={focusAdd} prefill={prefill} seq={seq} note={note} setNote={setNote} />

      <DayStripCard brain={brain} s={s} lighten={lighten} onLighten={() => onLighten(!lighten)} onWrapUp={onWrapUp} />
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
              <TaskRow key={t.id} t={t} brain={brain} s={s} stuckDays={stuckIds.get(t.id)} flash={flash === t.id} onSplit={onSplit} onNote={setNote} />
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="sec-today" ref={listRef}>
        <div className="sec-head">
          <h2 id="sec-today">
            {L("Hôm nay", "Today")} <span className="count">{day.today.length}</span>
          </h2>
          <span className="spacer" />
          {toPlan > 0 && <span className="chip stuck">{L(`thiếu ${toPlan} việc`, `${toPlan} to plan`)}</span>}
          <PinPlace brain={brain} s={s} onNote={setNote} compact={toPlan > 0} />
          <DayOffToggle brain={brain} s={s} />
        </div>
        {lighten && (
          <div className="lighten-banner" role="status">
            <Icon name="hourglass" size={15} />
            <span className="lighten-text">
              <b>{lines.loadOver(load)}</b> {lines.lightenHint(dayName ?? L("ngày mai", "tomorrow"))}
            </span>
            <button type="button" className="btn ghost icon" aria-label={L("Đóng", "Close")} title={L("Đóng", "Close")} onClick={() => onLighten(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {day.today.length === 0 ? (
          <div className="tasks empty">{done > 0 ? L("Xong hết rồi! 🎉", "All done! 🎉") : L("Chưa có việc nào. Thêm 3 việc quan trọng nhất nhé.", "Nothing yet. Add your 3 most important tasks.")}</div>
        ) : (
          <ul className="tasks">
            {day.today.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                brain={brain}
                s={s}
                stuckDays={stuckIds.get(t.id)}
                flash={flash === t.id}
                lighten={lighten}
                dayName={dayName}
                onMoved={(phase, ok) => {
                  moving.current = phase === "start";
                  if (phase === "start") refocus.current = { index: day.today.findIndex((x) => x.id === t.id), until: Date.now() + 4000 };
                  // It didn't move: nothing leaves the list, so the keyboard stays on the button it is on.
                  else if (ok === false) refocus.current = null;
                }}
                onSplit={onSplit}
                onNote={setNote}
              />
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
  flash = false,
  lighten = false,
  dayName = null,
  onMoved,
  onSplit,
  onNote,
}: {
  t: TodoTask;
  brain: Brain;
  s: BrainState;
  stuckDays?: number;
  /** Just opened from a bubble: the row flashes once. */
  flash?: boolean;
  /** Lightening the day: the row shows its estimate and a one-tap move to the next workday. */
  lighten?: boolean;
  /** The next workday's name when it isn't tomorrow. */
  dayName?: string | null;
  onMoved?: (phase: "start" | "end", ok?: boolean) => void;
  onSplit: (t: TodoTask) => void;
  onNote: (n: Note) => void;
}) {
  const [pop, setPop] = useState<"move" | "delete" | "more" | "when" | "whenApp" | "replace" | null>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const plan = s.triggers.find((x) => x.taskId === t.id && !x.fired) ?? null;
  const title = taskTitle(t);
  const time = dueTime(t);
  const day = dueDay(t);
  const clock = new Date(brain.clockNow());
  const today = dayKey(clock);
  const late = time !== null && time < clock;
  const prio = uiPriority(t);
  const est = lighten ? brain.estimateOf(t) : null;
  const where = dayName ?? L("ngày mai", "tomorrow");
  const moveOne = () => {
    onMoved?.("start");
    const name = short(title, 40);
    const before = brain.currentLoad();
    void brain.moveToNextWorkday(t).then((ok) => {
      onMoved?.("end", ok);
      const after = brain.currentLoad();
      // What it bought back (a task inside a meeting frees less than its estimate), so the arithmetic is no surprise.
      const freed = Math.round(before.taskMinutes - after.taskMinutes);
      onNote(
        ok
          ? {
              n: Date.now(),
              text: L(`Đã dời “${name}” sang ${where} ✓`, `Moved “${name}” to ${where} ✓`) + (freed >= 15 ? lines.freesTime(freed) : "") + (after.overBy <= 0 ? ` ${lines.dayFits()}` : ""),
              error: false,
            }
          : { n: Date.now(), text: brain.getSnapshot().errorText ?? L("Chưa dời được, thử lại nhé.", "Couldn't move it, try again."), error: true },
      );
    });
  };
  // Up and down the "→ Tomorrow" buttons, like the rows of a list.
  const goKeys = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const gos = [...(e.currentTarget.closest("ul")?.querySelectorAll<HTMLButtonElement>(".lighten-go:not(:disabled)") ?? [])];
    const i = gos.indexOf(e.currentTarget);
    const to = e.key === "ArrowDown" ? gos[Math.min(gos.length - 1, i + 1)] : e.key === "ArrowUp" ? gos[Math.max(0, i - 1)] : e.key === "Home" ? gos[0] : gos[gos.length - 1];
    if (!to) return;
    e.preventDefault();
    to.focus();
  };
  const meta = [
    est && (
      <span
        key="est"
        className={`chip est${est.own ? "" : " dflt"}`}
        title={est.own ? L(`${est.minutes} phút, theo Todoist`, `${est.minutes} min, from Todoist`) : L(`${est.minutes} phút: ước tính mặc định của bạn`, `${est.minutes} min: your default estimate`)}
      >
        <span className="sr-only">{L("Ước tính ", "Estimate ")}</span>
        {lines.estimateLabel(est.minutes)}
      </span>
    ),
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
        {daysAgo(day, clock)}
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
    if (restoreFocus) (which === "move" ? moveRef : which === "more" || which === "when" || which === "whenApp" || which === "replace" ? moreRef : deleteRef).current?.focus();
  };
  // Try 2 minutes replaces a running session: ask first, so a focus you are in the middle of is never lost by a tap.
  const running = s.focus && !s.focus.isBreak ? s.focus : null;
  return (
    <li
      className={`task${pop ? " active" : ""}${lighten ? " lightening" : ""}${flash ? " flash" : ""}`}
      style={{ ["--prio" as string]: PRIO_LINE[prio] }}
      data-task-id={t.id}
      tabIndex={-1}
    >
      <button className="check" aria-label={L(`Xong: ${title}`, `Complete: ${title}`)} title={L("Xong", "Complete")} onClick={(e) => e.detail < 2 && void brain.complete(t)}>
        <Icon name="check" size={12} />
      </button>
      <div className="t-body">
        <div className="t-title" title={title}>
          {title}
        </div>
        {meta.length > 0 && <div className="t-meta">{meta}</div>}
      </div>
      {/* Lightening the day, a row is its tick and its "→ Tomorrow": five hover icons would cover its title and add Tab stops. */}
      {!lighten && (
        <div className="t-actions">
          <IconButton icon="play" label={L("Tập trung", "Focus")} onClick={() => brain.startFocus(t)} />
          <IconButton icon="scissors" label={L("Chia nhỏ", "Split")} onClick={() => onSplit(t)} data-split="" />
          <IconButton ref={moveRef} icon="reschedule" label={L("Dời", "Move")} aria-haspopup="menu" aria-expanded={pop === "move"} onClick={() => setPop(pop === "move" ? null : "move")} />
          <IconButton ref={moreRef} icon="more" label={L("Thêm: thử 2 phút, bắt đầu khi…", "More: try 2 minutes, start when…")} aria-haspopup="menu" aria-expanded={pop === "more" || pop === "when" || pop === "whenApp" || pop === "replace"} onClick={() => setPop(pop === "more" || pop === "when" || pop === "whenApp" || pop === "replace" ? null : "more")} />
          <IconButton ref={deleteRef} icon="trash" danger label={L("Xoá", "Delete")} aria-haspopup="dialog" aria-expanded={pop === "delete"} onClick={() => setPop(pop === "delete" ? null : "delete")} />
        </div>
      )}
      {lighten && (
        <button
          type="button"
          className="btn small lighten-go"
          disabled={!canMove(t)}
          title={canMove(t) ? L(`Dời “${short(title, 40)}” sang ${where}`, `Move “${short(title, 40)}” to ${where}`) : L("Việc lặp lại giữ lịch riêng của nó", "A repeating task keeps its own schedule")}
          aria-label={L(`Dời “${short(title, 40)}” sang ${where}`, `Move “${short(title, 40)}” to ${where}`)}
          onClick={(e) => e.detail < 2 && moveOne()}
          onKeyDown={goKeys}
        >
          <span aria-hidden>→</span> {dayName ?? L("Ngày mai", "Tomorrow")}
        </button>
      )}
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
                closePop(true);
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
                if (running) {
                  setPop("replace");
                  return;
                }
                closePop(true);
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
      {pop === "replace" && running && (
        <Popover anchor={moreRef} role="alertdialog" label={L("Đổi sang thử 2 phút", "Switch to 2 minutes")} className="confirm switch-form" onClose={closePop}>
          <p>{lines.switchToStarter(Math.max(0, Math.trunc((brain.clockNow() - running.start) / 60_000)))}</p>
          <div className="pop-actions">
            <button type="button" className="btn small" data-autofocus onClick={() => closePop(true)}>
              {L("Tiếp tục phiên này", "Keep going")}
            </button>
            <button
              type="button"
              className="btn small primary"
              onClick={() => {
                closePop(true);
                brain.startTwoMinutes(t);
              }}
            >
              <Icon name="play" size={14} />
              {L("Chuyển sang 2 phút", "Switch to 2 minutes")}
            </button>
          </div>
        </Popover>
      )}
      {pop === "when" && (
        <Popover anchor={moreRef} role="menu" label={L("Bắt đầu khi…", "Start when…")} className="menu" onClose={closePop}>
          <WhenMenu brain={brain} s={s} t={t} plan={plan?.trigger ?? null} onClose={() => closePop(true)} onAnotherApp={() => setPop("whenApp")} onNote={onNote} />
        </Popover>
      )}
      {pop === "whenApp" && (
        <Popover anchor={moreRef} role="dialog" label={L("Ứng dụng khác", "Another app")} className="confirm pin-form app-form" onClose={closePop}>
          <AnotherApp brain={brain} s={s} t={t} onClose={closePop} onNote={onNote} />
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

/** "Start when…": after one of today's meetings, when I open an app (a recent one, or another that opens its own dialog), or after lunch. */
function WhenMenu({
  brain,
  s,
  t,
  plan,
  onClose,
  onAnotherApp,
  onNote,
}: {
  brain: Brain;
  s: BrainState;
  t: TodoTask;
  plan: StartTrigger | null;
  onClose: () => void;
  onAnotherApp: () => void;
  onNote: (n: Note) => void;
}) {
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
      <button type="button" role="menuitem" aria-haspopup="dialog" onClick={onAnotherApp}>
        <Icon name="reschedule" size={15} />
        <span className="menu-label">{L("Ứng dụng khác…", "Another app…")}</span>
      </button>
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

/**
 * The dialog behind "Another app…": the name of an app to wait for (3+ characters), with its own focus and Escape. The
 * start of a name is enough ("fig"), and so is the program's name as Task Manager shows it ("Figma.exe"). It says
 * which app lately in front the name matches, and when none does it still sets the plan, and says so kindly.
 */
function AnotherApp({
  brain,
  s,
  t,
  onClose,
  onNote,
}: {
  brain: Brain;
  s: BrainState;
  t: TodoTask;
  onClose: (restoreFocus: boolean) => void;
  onNote: (n: Note) => void;
}) {
  const [app, setApp] = useState("");
  const id = useId();
  const typed = normalizeAppName(app);
  const ok = typed.length >= MIN_APP_NAME;
  // What it matches among the apps used lately, worked out from what is typed (nothing to say before 3 letters).
  const match = ok ? brain.recentAppMatch(typed) : null;
  const submit = () => {
    if (!ok) return;
    onClose(true);
    const trigger: StartTrigger = { kind: "appOpen", app: typed };
    const set = brain.setStartTrigger(t, trigger);
    onNote({
      n: Date.now(),
      text: set
        ? `⏱ “${short(taskTitle(t), 28)}”: ${lines.triggerChoice(trigger, s.events)}${match ? "" : `. ${lines.appUnseen()}`}`
        : L("Chưa hẹn được, thử lại nhé.", "Couldn't set that, try again."),
      error: !set,
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={`${id}-app`}>{L("Mở ứng dụng nào thì bắt đầu?", "Start when I open which app?")}</label>
      <input
        id={`${id}-app`}
        className="field"
        data-autofocus
        autoComplete="off"
        maxLength={60}
        aria-describedby={`${id}-hint ${id}-match`}
        placeholder={L("Ví dụ: Figma", "e.g. Figma")}
        value={app}
        onChange={(e) => setApp(e.target.value)}
      />
      <p id={`${id}-hint`} className="hint">
        {L(
          `Ít nhất ${MIN_APP_NAME} chữ. Gõ đầu tên là đủ: “fig” là Figma, “chrome.exe” là Chrome.`,
          `At least ${MIN_APP_NAME} letters. The start of the name is enough: “fig” finds Figma, “chrome.exe” finds Chrome.`,
        )}
      </p>
      <p id={`${id}-match`} className={`hint app-match${match ? " seen" : ""}`} aria-live="polite">
        {ok ? (match ? lines.appSeen(match.name) : lines.appUnseen()) : ""}
      </p>
      <div className="pop-actions">
        <button type="button" className="btn small" onClick={() => onClose(true)}>
          {L("Huỷ", "Cancel")}
        </button>
        <button type="submit" className="btn small primary" disabled={!ok}>
          {L("Đặt", "Set")}
        </button>
      </div>
    </form>
  );
}

/** **📌 Pin my place** in the Today header: keeps what you're on (never saved to disk) with an optional next step. */
function PinPlace({ brain, s, onNote, compact }: { brain: Brain; s: BrainState; onNote: (n: Note) => void; compact: boolean }) {
  const [open, setOpen] = useState(false);
  // The last note stays (in this window's memory) so pinning again starts from it; unpinning clears it.
  const [text, setText] = useState("");
  const ref = useRef<HTMLButtonElement>(null);
  const describedBy = useId();
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
    close(true);
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
        aria-describedby={describedBy}
        title={`${label}: ${explain}`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="pin" size={14} />
        <span className={compact ? "sr-only" : undefined}>{shown}</span>
      </button>
      <span id={describedBy} className="sr-only">
        {explain}
      </span>
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
                    setText("");
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
    // Whatever you were typing stays: the prefill only fills an empty field.
    setText((draft) => (draft.trim() ? draft : prefill));
    // After the value lands, with the cursor at its end so typing goes on from "Team sync: ".
    const id = requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
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
  const left = Math.max(0, Math.round((f.end - brain.clockNow()) / 1000));
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
  const now = new Date(brain.clockNow());
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
  const heading = useHeadingFocus();
  return (
    <div className="sheet">
      <div>
        <button className="btn ghost small" onClick={onDone}>
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
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
  const today = new Date(brain.clockNow());
  const days = Array.from({ length: 30 }, (_, i) => dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + i)));
  const perfect = new Set(s.life.perfectDays);
  const locked = SPECIES_IDS.map(speciesInfo).filter((x) => x.unlock);
  const progress = (a: (typeof ACCESSORIES)[number]) => {
    const p = life.accessoryProgress(a, s.life);
    return `${p.have}/${p.need}`;
  };
  const heading = useHeadingFocus();
  return (
    <div className="sheet">
      <div>
        <button className="btn ghost small" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
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
              <small>{has ? (wearing ? L("Đang đeo", "Wearing") : L("Bấm để đeo", "Tap to wear")) : `${life.accessoryRequirement(a)} (${progress(a)})`}</small>
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
      `Hôm nay còn ${left}/${s.prefs.nudgeBudget} lần nhắc. Việc có giờ, cuộc họp, lời chào buổi sáng, tổng kết cuối ngày, thẻ “bạn đang làm gì”, câu hỏi sau họp, cảnh báo quá tải và việc bạn tự hẹn giờ không tính.`,
      `${left} of ${s.prefs.nudgeBudget} reminders left today. Timed tasks, meetings, the morning hello, the end-of-day review, the "where was I?" card, the question after a meeting, the overbooked check and plans you set yourself don't count.`,
    ) + (hold ? L(` Đang tạm im tới ${hold}.`, ` Holding reminders until ${hold}.`) : "");
  // A plain span can't carry an aria-label: the count is a status, and the detail is read as hidden text.
  return (
    <span className={`nudges${left === 0 ? " none" : ""}`} role="status" title={title}>
      <span aria-hidden>{left > 0 && !hold ? "🔔" : "🔕"}</span>
      <span aria-hidden>{left > 0 ? L(`còn ${left} lượt`, `${left} left today`) : L("hết lượt", "none left")}</span>
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
