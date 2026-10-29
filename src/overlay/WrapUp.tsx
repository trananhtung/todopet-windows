// The Wrap up sheet (SPEC v0.4 §3): the shutdown ritual in the board.
import { useEffect, useId, useRef, useState } from "react";
import type { Brain, BrainState } from "../core/brain";
import { parseDate } from "../core/dates";
import { getLang, L, plural } from "../core/l10n";
import { openTasks, taskTitle } from "../core/models";
import { canMove, chooseFrog, chooseMove, moveAllToTomorrow, MAX_NOTE_LENGTH, setNote, wrapMoves, type WrapMove } from "../core/wrapup";
import { Icon } from "../ui/icons";
import { localeTag } from "../ui/lang";
import { hh } from "./DayStrip";

const short = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** The next workday's name ("Monday") when it isn't tomorrow; null for tomorrow. */
export function nextWorkdayName(brain: Brain): string | null {
  const next = brain.wrapDay();
  return next.isTomorrow ? null : (parseDate(next.day)?.toLocaleDateString(localeTag(getLang()), { weekday: "long" }) ?? null);
}

/**
 * What to do with one task on the Wrap up sheet: a radio group (one tab stop, arrow keys between the choices, the way a
 * native radio group works), so ten tasks don't take thirty Tab presses.
 */
function MoveChoice({
  label,
  choices,
  value,
  movable,
  describedBy,
  onChange,
}: {
  label: string;
  choices: [WrapMove, string][];
  value: WrapMove;
  /** False for a repeating task: it can only stay. */
  movable: boolean;
  describedBy?: string;
  onChange: (v: WrapMove) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = choices.filter(([v]) => v === "keep" || movable).map(([v]) => v);
  const step = (e: React.KeyboardEvent) => {
    const i = enabled.indexOf(value);
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? enabled[(i + 1) % enabled.length] : e.key === "ArrowLeft" || e.key === "ArrowUp" ? enabled[(i - 1 + enabled.length) % enabled.length] : e.key === "Home" ? enabled[0] : e.key === "End" ? enabled[enabled.length - 1] : null;
    if (!to) return;
    e.preventDefault();
    onChange(to);
    ref.current?.querySelector<HTMLElement>(`[data-value="${to}"]`)?.focus();
  };
  return (
    <div ref={ref} className="seg" role="radiogroup" aria-label={label} aria-describedby={describedBy} onKeyDown={step}>
      {choices.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          data-value={v}
          aria-checked={value === v}
          tabIndex={value === v ? 0 : -1}
          disabled={v !== "keep" && !movable}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * **Wrap up** (SPEC v0.4 §3): today's wins, tomorrow's first task and the one line for tomorrow (near the top, so they
 * are never far to scroll to), each unfinished task (Tomorrow / No date / Keep, one line each), and **Done for today**
 * in a bar that stays in reach. The choices are made here and applied together when you press the button.
 */
export function WrapUpSheet({ brain, s, onBack, onDone }: { brain: Brain; s: BrainState; onBack: () => void; onDone: () => void }) {
  // The draft lives in the brain (for the day), so closing the board doesn't lose it.
  const draft = s.wrapDraft ?? brain.wrapDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const tasks = openTasks(s.day);
  const overdue = new Set(s.day.overdue.map((t) => t.id));
  const wins = s.day.completed;
  const { tomorrow, none } = wrapMoves(draft, tasks);
  // "Tomorrow" is the next workday: its name when that isn't tomorrow.
  const dayName = nextWorkdayName(brain);
  const choices: [WrapMove, string][] = [
    ["tomorrow", dayName ?? L("Ngày mai", "Tomorrow")],
    ["none", L("Không hạn", "No date")],
    ["keep", L("Giữ", "Keep")],
  ];
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await brain.wrapUp(draft);
    setBusy(false);
    if (result.ok) onDone();
    else {
      const done = result.moved + result.offPlan;
      setError(
        L(
          `Đã dời ${done} việc, ${result.failed} việc chưa dời được${result.error ? ` (${result.error})` : ""}. Pet vẫn đang thức, bạn thử lại nhé.`,
          `Moved ${done}, and ${result.failed} couldn't move${result.error ? ` (${result.error})` : ""}. Your pet is still awake: you can try again.`,
        ),
      );
    }
  };
  const plan = [
    tomorrow.length > 0 && (dayName ? L(`dời ${tomorrow.length} việc sang ${dayName}`, `move ${plural(tomorrow.length, "", "task", "tasks").trim()} to ${dayName}`) : L(`dời ${tomorrow.length} việc sang mai`, `move ${plural(tomorrow.length, "", "task", "tasks").trim()} to tomorrow`)),
    none.length > 0 && L(`bỏ ${none.length} việc khỏi kế hoạch`, `take ${plural(none.length, "", "task", "tasks").trim()} off the plan`),
  ].filter(Boolean);
  const doneLabel = L("Xong hôm nay", "Done for today");
  const frogLabel = dayName ? L(`Làm đầu tiên vào ${dayName}`, `First on ${dayName}`) : L("Làm đầu tiên ngày mai", "First tomorrow");
  return (
    <div className="sheet wrap">
      <div>
        <button className="btn ghost small" onClick={onBack} disabled={busy}>
          <Icon name="arrowLeft" size={14} /> {L("Quay lại", "Back")}
        </button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        <Icon name="moon" size={18} /> {L("Tổng kết ngày", "Wrap up the day")}
      </h2>
      <p className="muted wrap-intro">{L("Vài cú chạm là xong, không có đúng sai: chỉ là dọn bàn cho mai.", "A few taps, no right answers: just a tidy desk for tomorrow.")}</p>

      <section aria-labelledby="wrap-wins">
        <h3 id="wrap-wins">
          {L("Hôm nay bạn đã làm", "Today's wins")} <span className="count good">{wins.length}</span>
        </h3>
        {wins.length === 0 ? (
          <p className="wrap-empty">{L("Hôm nay chưa tick việc nào, và vậy cũng không sao. Mai là một trang mới 🌱", "Nothing ticked off today, and that's okay. Tomorrow is a fresh page 🌱")}</p>
        ) : (
          <ul className="wrap-wins">
            {wins.slice(0, 3).map((t) => (
              <li key={t.id} title={taskTitle(t)}>
                <Icon name="check" size={13} />
                <span>{taskTitle(t)}</span>
              </li>
            ))}
            {wins.length > 3 && <li className="more">{L(`và ${wins.length - 3} việc nữa`, `and ${wins.length - 3} more`)}</li>}
          </ul>
        )}
      </section>

      {/* Tomorrow: the first task and the one line, up here where they are never far to scroll to. */}
      <section className="wrap-tomorrow" aria-label={L("Cho ngày mai", "For tomorrow")}>
        <div className="wrap-field">
          <label htmlFor={`${id}-frog`}>🐸 {frogLabel}</label>
          <select
            id={`${id}-frog`}
            className="field"
            value={draft.frogId ?? ""}
            disabled={tasks.length === 0}
            onChange={(e) => brain.editWrapDraft((d, all) => chooseFrog(d, all, e.target.value === "" ? null : e.target.value))}
          >
            <option value="">{L("Mai mình chọn sau", "I'll decide tomorrow")}</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id} disabled={(draft.moves[t.id] ?? "keep") === "none"}>
                {short(taskTitle(t), 60)}
              </option>
            ))}
          </select>
        </div>
        {draft.frogDone && (
          <p className="muted wrap-frogdone" role="status">
            🐸 {L(`“${short(draft.frogDone, 40)}” đã xong rồi, giỏi quá! Chọn việc khác hoặc để mai tính.`, `“${short(draft.frogDone, 40)}” is already done, nice! Pick another, or decide tomorrow.`)}
          </p>
        )}
        <div className="wrap-field wrap-note">
          <label htmlFor="wrap-note">{L("Mai mình bắt đầu từ đâu?", "Where do I start tomorrow?")}</label>
          <input
            id="wrap-note"
            className="field"
            autoComplete="off"
            maxLength={MAX_NOTE_LENGTH}
            placeholder={L("Một dòng cho chính mình…", "One line for future you…")}
            value={draft.note}
            onChange={(e) => brain.editWrapDraft((d) => setNote(d, e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>
      </section>

      <section aria-labelledby="wrap-open">
        <div className="wrap-head">
          <h3 id="wrap-open">
            {L("Còn dang dở", "Still open")} <span className="count">{tasks.length}</span>
          </h3>
          <span className="spacer" />
          {tasks.some(canMove) && (
            <button type="button" className="btn small" onClick={() => brain.editWrapDraft((d, all) => moveAllToTomorrow(d, all))}>
              {dayName ? L(`Tất cả sang ${dayName}`, `All to ${dayName}`) : L("Tất cả sang mai", "All to tomorrow")}
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
              const why = `${id}-why-${t.id}`;
              const frog = draft.frogId === t.id;
              return (
                <li key={t.id} className={`wrap-row${move === "none" ? " off" : ""}${frog ? " is-frog" : ""}`}>
                  <div className="wrap-title" title={title}>
                    {frog && (
                      <span className="wrap-frog-mark" aria-hidden>
                        🐸
                      </span>
                    )}
                    <span className="wrap-name">{title}</span>
                    {frog && <span className="sr-only">{`: ${frogLabel}`}</span>}
                    {overdue.has(t.id) && <span className="chip late">{L("quá hạn", "overdue")}</span>}
                  </div>
                  <div className="wrap-ctl">
                    {!movable && (
                      <span id={why} className="chip" tabIndex={0} title={L("Việc lặp lại giữ lịch riêng của nó", "A repeating task keeps its own schedule")}>
                        🔁<span className="sr-only">{L("Việc lặp lại giữ lịch riêng của nó, nên chỉ có thể giữ nguyên", "A repeating task keeps its own schedule, so it can only stay")}</span>
                      </span>
                    )}
                    <MoveChoice
                      label={L(`Làm gì với “${short(title, 40)}”`, `What to do with “${short(title, 40)}”`)}
                      choices={choices}
                      value={move}
                      movable={movable}
                      describedBy={movable ? undefined : why}
                      onChange={(v) => brain.editWrapDraft((d, all) => chooseMove(d, all, t.id, v))}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="muted wrap-summary" role="status">
        {plan.length > 0 ? `${plan.join(L(" và ", " and ")).replace(/^./, (c) => c.toLocaleUpperCase())}. ` : ""}
        {L(
          `Pet sẽ ngủ và im lặng tới khi ngày làm việc tiếp theo bắt đầu (${hh(s.prefs.workStart)}). Cuộc họp và việc có giờ vẫn được nhắc.`,
          `Your pet will sleep and stay quiet until the next workday starts (${hh(s.prefs.workStart)}). Meetings and timed tasks still get through.`,
        )}
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="wrap-actions">
        <button className="btn primary" disabled={busy} aria-busy={busy} aria-label={doneLabel} onClick={() => void submit()}>
          <Icon name="moon" size={15} />
          {busy ? "…" : doneLabel}
        </button>
        <button className="btn" onClick={onBack} disabled={busy}>
          {L("Chưa đâu", "Not yet")}
        </button>
      </div>
    </div>
  );
}
