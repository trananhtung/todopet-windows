import { forwardRef, useEffect, useState } from "react";
import type { Brain, Bubble } from "../core/brain";
import { L } from "../core/l10n";
import { Icon } from "../ui/icons";

/**
 * The speech bubble above the pet. It fades after `seconds` unless hovered or focused; the frame loop
 * positions it. It never takes focus by itself (that would steal keystrokes from the app you are in),
 * but its buttons are in the tab order with a visible focus ring.
 */
export const BubbleView = forwardRef<HTMLDivElement, { bubble: Bubble; brain: Brain }>(function BubbleView({ bubble, brain }, ref) {
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
      className={`bubble${bubble.urgent ? " urgent" : ""}${leaving ? " leaving" : ""}${paused ? " paused" : ""}`}
      data-hit=""
      role="status"
      aria-live={bubble.urgent ? "assertive" : "polite"}
      style={{ left: -9999, top: -9999 }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => {
        setFocused(true);
        setLeaving(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="bubble-text">{bubble.text}</div>
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
