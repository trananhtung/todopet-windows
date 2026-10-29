import { forwardRef, useEffect, useState } from "react";
import type { Brain, Bubble } from "../core/brain";
import { L } from "../core/l10n";
import { Icon } from "../ui/icons";

/**
 * The speech bubble above the pet. It fades after `seconds` unless hovered or focused; the frame loop
 * positions it. It never takes focus by itself (that would steal keystrokes from the app you are in),
 * but its buttons are in the tab order with a visible focus ring.
 *
 * `banner` is the same bubble inside the open board (an urgent one: a meeting, a timed task): a strip under the
 * header, with the same words and buttons, which the frame loop leaves alone.
 */
export const BubbleView = forwardRef<HTMLDivElement, { bubble: Bubble; brain: Brain; banner?: boolean }>(function BubbleView({ bubble, brain, banner = false }, ref) {
  const [leaving, setLeaving] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [left, setLeft] = useState(bubble.seconds * 1000);
  const paused = hover || focused;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    let fade: ReturnType<typeof setTimeout> | undefined;
    const id = setTimeout(() => {
      setLeaving(true);
      fade = setTimeout(() => brain.dismissBubble(bubble.id, "ignored"), 240);
    }, left);
    return () => {
      clearTimeout(id);
      if (fade !== undefined) clearTimeout(fade);
      setLeft((l) => Math.max(1500, l - (Date.now() - started)));
    };
    // `left` is only read when the timer (re)starts after a hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, bubble.id, brain]);

  return (
    <div
      ref={ref}
      className={`bubble${banner ? " banner" : ""}${bubble.urgent ? " urgent" : ""}${leaving ? " leaving" : ""}${paused ? " paused" : ""}`}
      data-hit=""
      role="status"
      aria-live={bubble.urgent ? "assertive" : "polite"}
      style={banner ? undefined : { left: -9999, top: -9999 }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => {
        setFocused(true);
        setLeaving(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={
        banner
          ? (e) => {
              // Escape on a banner closes the banner, not the board it sits in; the keyboard stays in the board.
              if (e.key !== "Escape" || e.defaultPrevented) return;
              e.preventDefault();
              const board = e.currentTarget.closest<HTMLElement>(".board");
              brain.dismissBubble(bubble.id, "closed");
              board?.focus({ preventScroll: true });
            }
          : undefined
      }
    >
      <div className="bubble-text">{bubble.text}</div>
      {bubble.detail && <div className="bubble-detail">{bubble.detail}</div>}
      <button className="bubble-close" aria-label={L("Đóng", "Close")} title={L("Đóng", "Close")} onClick={() => brain.dismissBubble(bubble.id, "closed")}>
        <Icon name="close" size={14} />
      </button>
      {bubble.actions.length > 0 && (
        <div className="bubble-actions">
          {bubble.actions.map((a, i) => (
            <button key={a.title} className={`btn small${a.primary ? " primary" : ""}`} onClick={() => brain.pickAction(bubble.id, i)}>
              {a.title}
            </button>
          ))}
        </div>
      )}
      <div className="bubble-timer" aria-hidden>
        <i style={{ animationDuration: `${bubble.seconds}s` }} />
      </div>
    </div>
  );
});
