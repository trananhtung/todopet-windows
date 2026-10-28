import { useEffect, useRef, useState, type RefObject } from "react";
import type { CelebrationEvent } from "../core/brain";

interface Burst {
  id: number;
  x: number;
  y: number;
  particles: { dx: number; dy: number; rot: number; color: string; delay: number; round: boolean }[];
  text: string | null;
  gold: boolean;
}

const COLORS = ["#ff8a5b", "#ffd166", "#06d6a0", "#4cc9f0", "#f72585", "#b388eb", "#ffb4a2"];
const GOLD = ["#ffd700", "#ffe680", "#ffb800", "#fff3b0"];
/** A burst is removed once its longest animation (1.6 s pop text, 0.24 s delay) has finished. */
const BURST_MS = 1900;

/** Confetti for every finished task; fireworks for combos and golden treats. */
export function Effects({ celebration, anchor }: { celebration: CelebrationEvent | null; anchor: RefObject<{ x: number; top: number }> }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  // Each burst owns its removal timer, so a new celebration never cancels an older burst's cleanup.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (!celebration) return;
    const a = anchor.current;
    if (!a) return;
    const big = celebration.kind === "fireworks" || celebration.golden;
    const palette = celebration.golden ? GOLD : COLORS;
    const n = big ? 34 : 14;
    const particles = Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const dist = (big ? 110 : 60) + Math.random() * (big ? 90 : 40);
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - (big ? 40 : 20),
        rot: Math.random() * 540 - 270,
        color: palette[i % palette.length],
        delay: big ? (i % 3) * 0.12 : 0,
        round: i % 2 === 0,
      };
    });
    const text = celebration.golden ? "✨ GOLDEN ✨" : celebration.combo >= 2 ? `×${celebration.combo} COMBO` : null;
    const burst: Burst = { id: celebration.id, x: a.x, y: a.top + 20, particles, text, gold: celebration.golden };
    setBursts((b) => (b.some((x) => x.id === burst.id) ? b : [...b, burst]));
    const id = setTimeout(() => {
      timers.current.delete(id);
      setBursts((b) => b.filter((x) => x.id !== burst.id));
    }, BURST_MS);
    timers.current.add(id);
  }, [celebration, anchor]);

  return (
    <>
      {bursts.map((b) => (
        <div key={b.id} aria-hidden>
          {b.particles.map((p, i) => (
            <span
              key={i}
              className="particle"
              style={
                {
                  left: b.x,
                  top: b.y,
                  background: p.color,
                  borderRadius: p.round ? "50%" : 2,
                  animationDelay: `${p.delay}s`,
                  "--dx": `${p.dx}px`,
                  "--dy": `${p.dy}px`,
                  "--rot": `${p.rot}deg`,
                } as React.CSSProperties
              }
            />
          ))}
          {b.text && (
            <span className={`pop-text${b.gold ? " gold" : ""}`} style={{ left: b.x, top: b.y - 50 }}>
              {b.text}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
