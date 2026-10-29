// The work day at a glance on the board (SPEC v0.4 §4): meetings and timed tasks on a strip, and how the day measures up.
import { useEffect, useRef, useState } from "react";
import type { Brain, BrainState } from "../core/brain";
import { dayKey, addDays, atHour, timeString } from "../core/dates";
import { getLang, L, plural } from "../core/l10n";
import * as lines from "../core/lines";
import { dayStrip } from "../core/load";
import { canWrapUp } from "../core/wrapup";
import { Icon } from "../ui/icons";
import { localeTag } from "../ui/lang";

export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** "08:00", or "Mon 08:00" when that is not tomorrow. */
function untilLabel(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const near = [dayKey(new Date(nowMs)), addDays(dayKey(new Date(nowMs)), 1)].includes(dayKey(d));
  const weekday = near ? "" : `${d.toLocaleDateString(localeTag(getLang()), { weekday: "short" })} `;
  return `${weekday}${timeString(d)}`;
}

/** The hours the strip's axis marks: every 2 hours from the start, and the end (a tick only 1 hour before it gives way). */
export function axisHours(startHour: number, endHour: number): number[] {
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h += 2) hours.push(h);
  if (hours.length > 1 && endHour - hours[hours.length - 1] < 2) hours.pop();
  hours.push(endHour);
  return hours;
}

/** A block narrower than this (px) gets no label; its caption and tooltip say what it is. */
const SEG_LABEL_MIN_PX = 60;
/** Rows of the strip: a bar is 14 px tall with 4 px between rows. */
const BAR = 14;
const LANE = 18;

/** The width of an element, kept up to date (a plausible one before it is measured, and where nothing can measure). */
function useWidth(ref: React.RefObject<HTMLElement | null>, fallback = 340): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth || fallback);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return width;
}

/**
 * The work day at a glance (SPEC v0.4 §4): meetings and timed tasks on a strip with a marker for now, and what is
 * still ahead against the time left ("~6h / 7h left"), calm until the day runs an hour over, and then how far over it
 * is, in words ("~3h45 over": a button that opens the board to move tasks). After 15:00 it also holds the **Wrap up**
 * button; once the day is done it says so, with a way back.
 *
 * The blocks are 14 px bars with their name when they are wide enough, hours marked every 2 hours, and a caption under
 * the strip that follows hover and focus (it says what is now and next otherwise). They are reachable by keyboard:
 * one tab stop, arrow keys between blocks.
 */
export function DayStripCard({ brain, s, lighten, onLighten, onWrapUp }: { brain: Brain; s: BrainState; lighten: boolean; onLighten: () => void; onWrapUp: () => void }) {
  // The marker and the time left move on their own.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const trackRef = useRef<HTMLDivElement>(null);
  const width = useWidth(trackRef);
  // The block that is hovered or has the focus (its caption shows), and the one that is the tab stop.
  const [shown, setShown] = useState<string | null>(null);
  const [stop, setStop] = useState(0);
  // Back to work and Wrap up take the same spot: the second click of a double-click must not land on the one that swapped in.
  const wokeAt = useRef(0);
  const strip = dayStrip(brain.dayInput());
  const done = s.doneUntil !== null;
  const nowMs = brain.clockNow();
  const wrapUpOpen = canWrapUp(nowMs, s.prefs.workEnd);
  if (!strip.hasContent && !wrapUpOpen && !done) return null;
  const now = new Date(brain.loadClock());
  const t0 = atHour(strip.startHour, 0, now).getTime();
  const length = atHour(strip.endHour, 0, now).getTime() - t0;
  const timeAt = (f: number) => timeString(new Date(t0 + f * length));
  const meetings = strip.segments.filter((x) => x.kind === "meeting").length;
  const timed = strip.segments.length - meetings;
  const detail = lines.loadDetail(strip.load);
  const over = !done && strip.load.overBy > 0;
  // "Tomorrow" is the next workday: its name when that isn't tomorrow.
  const dayName = brain.wrapDayName();
  const summary = L(
    `Ngày làm việc ${hh(strip.startHour)} đến ${hh(strip.endHour)}: ${plural(meetings, "cuộc họp", "meeting", "meetings")}, ${plural(timed, "việc có giờ", "timed task", "timed tasks")}. Bây giờ là ${timeString(now)}.`,
    `Work day ${hh(strip.startHour)} to ${hh(strip.endHour)}: ${plural(meetings, "cuộc họp", "meeting", "meetings")}, ${plural(timed, "việc có giờ", "timed task", "timed tasks")}. It is ${timeString(now)} now.`,
  );
  const segKey = (seg: (typeof strip.segments)[number]) => `${seg.kind}-${seg.id}`;
  const segText = (seg: (typeof strip.segments)[number]) => `${seg.kind === "meeting" ? "📅" : "⏰"} ${seg.title} · ${timeAt(seg.start)}–${timeAt(seg.end)}`;
  const segLabel = (seg: (typeof strip.segments)[number]) =>
    `${seg.kind === "meeting" ? L("Cuộc họp", "Meeting") : L("Việc có giờ", "Timed task")}: ${seg.title}, ${timeAt(seg.start)} ${L("đến", "to")} ${timeAt(seg.end)}`;
  const upcoming = strip.segments.find((seg) => t0 + seg.end * length > now.getTime());
  const focusedSeg = strip.segments.find((seg) => segKey(seg) === shown);
  const caption = focusedSeg
    ? segText(focusedSeg)
    : L(`Bây giờ ${timeString(now)}`, `Now ${timeString(now)}`) + (upcoming ? ` · ${L("tiếp theo", "next")}: ${upcoming.title} ${timeAt(upcoming.start)}` : "");
  const active = Math.min(stop, Math.max(0, strip.segments.length - 1));
  const moveStop = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const last = strip.segments.length - 1;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(last, active + 1) : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, active - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    setStop(to);
    trackRef.current?.querySelectorAll<HTMLElement>(".ds-seg")[to]?.focus();
  };
  return (
    <section className={`daystrip level-${done ? "ok" : strip.level}${done ? " is-done" : ""}${lighten ? " is-lighten" : ""}`} aria-label={L("Ngày làm việc hôm nay", "Today's work day")}>
      <div className="ds-head">
        <span className="ds-load" title={done ? undefined : detail}>
          <Icon name={done ? "moon" : "hourglass"} size={14} />
          <span className="ds-text">
            {done ? L(`Xong hôm nay · yên tĩnh tới ${untilLabel(s.doneUntil!, nowMs)}`, `Done for today · quiet until ${untilLabel(s.doneUntil!, nowMs)}`) : lines.loadMeter(strip.load)}
          </span>
          {!done && <span className="sr-only">{detail}</span>}
        </span>
        {lighten && over ? null : over ? (
          // How far over, in words; it is also the way into lightening the day. (While lightening, the banner in the list says it.)
          <button
            type="button"
            className="ds-over"
            aria-pressed={lighten}
            title={L(`Xem việc nào nên dời sang ${dayName ?? "mai"}`, `See which tasks to move to ${dayName ?? "tomorrow"}`)}
            onClick={onLighten}
          >
            {lines.loadOver(strip.load)}
          </button>
        ) : (
          !done &&
          strip.hasContent &&
          strip.load.capacity > 0 && (
            <span className="ds-meter" aria-hidden>
              <i style={{ width: `${strip.ratio * 100}%` }} />
            </span>
          )
        )}
        <span className="spacer" />
        {done ? (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              wokeAt.current = Date.now();
              brain.resumeDay();
            }}
            title={L("Pet thức dậy và nhắc việc lại như thường", "Wake the pet and get the usual reminders back")}
          >
            <Icon name="sun" size={14} />
            {L("Làm tiếp", "Back to work")}
          </button>
        ) : (
          wrapUpOpen && (
            <button
              type="button"
              className="btn small wrap-btn"
              data-wrap-up=""
              onClick={() => {
                if (Date.now() - wokeAt.current < 600) return;
                onWrapUp();
              }}
              title={L(`Dọn nốt ngày: dời việc, chọn việc đầu tiên cho ${dayName ?? "mai"}, ghi một dòng`, `Close the day: move what's left, pick ${dayName ? `${dayName}'s` : "tomorrow's"} first task, leave a note`)}
            >
              <Icon name="moon" size={14} />
              {L("Tổng kết ngày", "Wrap up")}
            </button>
          )
        )}
      </div>
      {/* While lightening the day the timeline folds away: the rows need the room, and the banner under it has the news. */}
      <div className="ds-fold" inert={lighten}>
        <div className="ds-body">
          <div
            className="ds-track"
            ref={trackRef}
            role="group"
            aria-label={summary}
            style={{ height: 4 + strip.lanes * LANE }}
            onKeyDown={moveStop}
            onPointerLeave={() => setShown(null)}
          >
            {axisHours(strip.startHour, strip.endHour).slice(1, -1).map((h) => (
              <i key={h} className="ds-tick" aria-hidden style={{ left: `${((h - strip.startHour) / (strip.endHour - strip.startHour)) * 100}%` }} />
            ))}
            {strip.segments.map((seg, i) => {
              const px = (seg.end - seg.start) * width;
              return (
                <span
                  key={segKey(seg)}
                  className={`ds-seg ${seg.kind === "meeting" ? "meeting" : "timed"}`}
                  role="img"
                  tabIndex={i === active ? 0 : -1}
                  aria-label={segLabel(seg)}
                  title={segText(seg)}
                  style={{ left: `${seg.start * 100}%`, width: `${(seg.end - seg.start) * 100}%`, top: 2 + seg.lane * LANE, height: BAR }}
                  onPointerEnter={() => setShown(segKey(seg))}
                  onFocus={() => {
                    setShown(segKey(seg));
                    setStop(i);
                  }}
                  onBlur={() => setShown((k) => (k === segKey(seg) ? null : k))}
                >
                  {px >= SEG_LABEL_MIN_PX && <span className="ds-label">{seg.title}</span>}
                </span>
              );
            })}
            <i className="ds-past" style={{ width: `${strip.now * 100}%` }} />
            <b className="ds-now" style={{ left: `${strip.now * 100}%` }} title={L(`Bây giờ ${timeString(now)}`, `Now ${timeString(now)}`)} />
          </div>
          <div className="ds-axis" aria-hidden>
            {axisHours(strip.startHour, strip.endHour).map((h, i, all) => (
              <span key={h} className={i === 0 ? "first" : i === all.length - 1 ? "last" : undefined} style={{ left: `${((h - strip.startHour) / (strip.endHour - strip.startHour)) * 100}%` }}>
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
          {strip.segments.length > 0 && (
            <div className="ds-caption">
              {caption}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
