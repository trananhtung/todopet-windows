import { forwardRef, useEffect, useState } from "react";
import type { Brain, Bubble } from "../core/brain";
import { L } from "../core/l10n";

/** The speech bubble above the pet. It fades after `seconds` unless hovered; the frame loop positions it. */
export const BubbleView = forwardRef<HTMLDivElement, { bubble: Bubble; brain: Brain }>(function BubbleView({ bubble, brain }, ref) {
  const [leaving, setLeaving] = useState(false);
  const [hover, setHover] = useState(false);
  const [left, setLeft] = useState(bubble.seconds * 1000);

  useEffect(() => {
    if (hover) return;
    const started = Date.now();
    const id = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => brain.dismissBubble(bubble.id, "ignored"), 240);
    }, left);
    return () => {
      clearTimeout(id);
      setLeft((l) => Math.max(1500, l - (Date.now() - started)));
    };
    // `left` is only read when the timer (re)starts after a hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, bubble.id, brain]);

  return (
    <div
      ref={ref}
      className={`bubble${bubble.urgent ? " urgent" : ""}${leaving ? " leaving" : ""}`}
      data-hit=""
      role={bubble.actions.length > 0 ? "alertdialog" : "status"}
      aria-live="polite"
      style={{ left: -9999, top: -9999 }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div className="bubble-text">{bubble.text}</div>
      <button className="bubble-close" aria-label={L("Đóng", "Close")} onClick={() => brain.dismissBubble(bubble.id, "closed")}>
        ×
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
