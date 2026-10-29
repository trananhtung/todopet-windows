import { useEffect, useRef, useState, type RefObject } from "react";
import type { CelebrationEvent, Reveal } from "../core/brain";
import type { ChestResult } from "../core/chests";
import { accessoryEmoji } from "../core/life";

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

export interface EffectsAnchor {
  x: number;
  top: number;
  feetY: number;
  size: number;
}

/** A chest reveal and the celebration it came with start within this long of each other (ms). */
const SAME_MOMENT_MS = 1000;

/**
 * Confetti for every finished task; fireworks for combos and golden treats. `delayFor` says how long (seconds) a
 * celebration is held back while the pet ponders for half a beat (0 when the ponder doesn't play); a chest opened
 * with the task pops open beside the pet a moment after its confetti.
 */
export function Effects({
  celebration,
  reveal = null,
  anchor,
  delayFor,
}: {
  celebration: CelebrationEvent | null;
  reveal?: Reveal | null;
  anchor: RefObject<EffectsAnchor>;
  delayFor?: (c: CelebrationEvent) => number;
}) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [chests, setChests] = useState<ChestPop[]>([]);
  /** Chest reveals already popped (the effect re-runs when the celebration changes). */
  const popped = useRef(new Set<number>());
  // Each burst owns its removal timer, so a new celebration never cancels an older burst's cleanup.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (ms: number, run: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      run();
    }, ms);
    timers.current.add(id);
  };

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (!celebration) return;
    const delay = delayFor?.(celebration) ?? 0;
    if (delay > 0 && Date.now() - celebration.start < delay * 1000) {
      later(delay * 1000 - (Date.now() - celebration.start), () => fire(celebration));
      return;
    }
    fire(celebration);
  }, [celebration, anchor, delayFor]);

  // A chest opened with this task: it pops up beside the pet once the confetti is out (after the same ponder).
  useEffect(() => {
    if (!reveal || reveal.kind !== "chest" || Date.now() - reveal.at > 3000 || popped.current.has(reveal.id)) return;
    // Chests open only with a celebration: wait for it, to share its ponder.
    if (!celebration || Math.abs(celebration.start - reveal.at) > SAME_MOMENT_MS) return;
    const delay = delayFor?.(celebration) ?? 0;
    const a = anchor.current;
    if (!a) return;
    const right = a.x + a.size * 0.62 < window.innerWidth - 40;
    const pop: ChestPop = {
      id: reveal.id,
      x: a.x + (right ? 1 : -1) * a.size * 0.42,
      y: a.feetY,
      chest: reveal.chest,
      sparks: sparks(reveal.chest.tier === "legendary" ? 12 : reveal.chest.tier === "rare" ? 10 : 8),
      delay,
    };
    popped.current.add(pop.id);
    setChests((c) => [...c, pop]);
    later(CHEST_MS + delay * 1000, () => setChests((c) => c.filter((x) => x.id !== pop.id)));
  }, [reveal, anchor, celebration, delayFor]);

  function fire(celebration: CelebrationEvent) {
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
    later(BURST_MS, () => setBursts((b) => b.filter((x) => x.id !== burst.id)));
  }

  return (
    <>
      {chests.map((c) => (
        <ChestPopView key={c.id} pop={c} />
      ))}
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

interface ChestPop {
  id: number;
  x: number;
  y: number;
  chest: ChestResult;
  sparks: { dx: number; dy: number; s: number; delay: number }[];
  /** Seconds the pop waits for the pet's ponder (0 when there was none). */
  delay?: number;
}

/** The chest pop: in at 0.25 s after the confetti, opens at ~0.75 s, gone by 2 s. */
const CHEST_MS = 2200;

function sparks(n: number): ChestPop["sparks"] {
  return Array.from({ length: n }, (_, i) => {
    // Mostly upward, like the lid flying open.
    const angle = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * Math.PI * 1.25 + (Math.random() - 0.5) * 0.25;
    const dist = 26 + Math.random() * 22;
    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, s: 0.7 + Math.random() * 0.6, delay: (i % 3) * 0.04 };
  });
}

/** What came out of the chest, as one glyph (the words are in the celebration bubble). */
function prize(c: ChestResult): string {
  switch (c.reward) {
    case "accessory":
      return c.accessory ? accessoryEmoji(c.accessory) : "🎀";
    case "snack":
      return "🍪";
    case "golden":
      return "🌟";
    default:
      return "⭐";
  }
}

function ChestPopView({ pop }: { pop: ChestPop }) {
  const base = (pop.delay ?? 0) + 0.25;
  return (
    <div className={`chest-pop tier-${pop.chest.tier}`} style={{ left: pop.x, top: pop.y, "--d": `${base}s` } as React.CSSProperties} aria-hidden>
      <span className="chest-glow" />
      <span className="chest-box">🎁</span>
      <span className="chest-prize">{prize(pop.chest)}</span>
      {pop.sparks.map((p, i) => (
        <span
          key={i}
          className="chest-spark"
          style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--s": p.s, animationDelay: `${base + 0.5 + p.delay}s` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
