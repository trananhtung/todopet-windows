import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ACCESSORIES, CELEBRATIONS, MOODS, SPECIES_IDS, type SpeciesId } from "../core/types";
import { SPECIES, defaultPose, speciesInfo, type PetPose } from "../pets";
import { appIconSvg } from "../pets/icon";
import { LivePreview } from "./LivePreview";
import { PetView } from "./PetView";
import "./gallery.css";

const params = new URLSearchParams(location.search);
const STATIC = params.has("static");
const T0 = 1.3;
/** `?size=200` renders the detail cards larger for close inspection. */
const CARD = Math.min(400, Math.max(64, Number(params.get("size")) || 128));

const MOOD_LABEL: Record<string, string> = {
  happy: "Happy",
  normal: "Chill",
  annoyed: "Annoyed",
  angry: "Grumpy",
  sleeping: "Sleeping",
  focus: "Focus",
  celebrating: "Celebrating",
};
const STAGES = ["Baby", "Kid", "Teen", "Grown-up", "Master"];

/** Times that show each celebration at an interesting moment (deterministic, also in static mode). */
const CELEBRATION_T: Record<string, number> = { jump: 1.136, spin: 1.15, flip: 1.068, dance: 1.3, fireworks: 1.136 };

interface Shot {
  label: string;
  pose: Partial<PetPose>;
}

function shotsFor(): { title: string; note?: string; shots: Shot[] }[] {
  const walk: Shot[] = [0, 1, 2, 3, 4, 5].map((i) => ({
    label: `φ ${(i / 3).toFixed(2)}π`,
    pose: { walking: true, walkPhase: (i / 6) * 2 * Math.PI },
  }));
  return [
    { title: "Moods", shots: MOODS.map((m) => ({ label: MOOD_LABEL[m], pose: { mood: m } })) },
    { title: "Walking", note: "one stride, walkPhase 0 → 2π", shots: walk },
    {
      title: "Interaction",
      shots: [
        { label: "Held", pose: { held: true } },
        { label: "Hovered", pose: { hovered: true } },
        { label: "Hovered, happy", pose: { hovered: true, mood: "happy" } },
        { label: "Look left", pose: { lookX: -1 } },
        { label: "Look up-right", pose: { lookX: 1, lookY: -1 } },
        { label: "Facing left", pose: { facing: -1, walking: true, walkPhase: 1 } },
        { label: "Calm, walking", pose: { calm: true, walking: true, walkPhase: 1.2 } },
        { label: "Blend annoyed→happy", pose: { prevMood: "annoyed", mood: "happy", blend: 0.5 } },
      ],
    },
    { title: "Growth", shots: STAGES.map((s, i) => ({ label: s, pose: { stage: i as PetPose["stage"] } })) },
    {
      title: "Care",
      shots: [
        { label: "Hungry", pose: { hungry: true, t: 0.5 } },
        { label: "Dirt 1", pose: { dirt: 1 } },
        { label: "Dirt 2", pose: { dirt: 2 } },
        { label: "Dirt 3", pose: { dirt: 3 } },
      ],
    },
    {
      title: "Accessories",
      shots: [
        ...ACCESSORIES.map((a) => ({ label: a, pose: { wearing: [a] } })),
        { label: "Shades + scarf + top hat", pose: { wearing: ["scarf", "sunglasses", "tophat"] } },
        { label: "Crown + scarf, Master", pose: { wearing: ["crown", "scarf"], stage: 4 } },
        { label: "Bow + shades, walking", pose: { wearing: ["bow", "sunglasses"], walking: true, walkPhase: 1 } },
        { label: "Grad cap, happy", pose: { wearing: ["gradcap", "sunglasses"], mood: "happy" } },
        { label: "Top hat, Baby", pose: { wearing: ["tophat"], stage: 0 } },
      ],
    },
    {
      title: "Celebrations",
      shots: [
        ...CELEBRATIONS.map((k) => ({ label: k, pose: { mood: "celebrating" as const, celebration: k, t: CELEBRATION_T[k] } })),
        { label: "Golden", pose: { mood: "celebrating", celebration: "jump", golden: true, t: 1.136 } },
        { label: "Treat falling", pose: { mood: "celebrating", celebration: "dance", food: "🍙", foodT: 0.55 } },
        { label: "Nom!", pose: { mood: "celebrating", celebration: "dance", food: "🍙", foodT: 1.0 } },
      ],
    },
    {
      title: "Flip film strip",
      note: "must never leave the box, even at Master with a top hat",
      shots: [0.15, 0.3, 0.45, 0.6, 0.75].map((ph) => ({
        label: `phase ${ph}`,
        pose: { mood: "celebrating" as const, celebration: "flip" as const, t: (2 + ph) / 2.2, stage: 4 as const, wearing: ["tophat" as const] },
      })),
    },
  ];
}

/** `?matrix=moods|life|wear|party` shows every species against one set of poses (for side-by-side review). */
const MATRICES: Record<string, Shot[]> = {
  idle: [
    { label: "Chill", pose: {} },
    { label: "Happy", pose: { mood: "happy" } },
    { label: "Annoyed", pose: { mood: "annoyed" } },
    { label: "Sleeping", pose: { mood: "sleeping" } },
  ],
  moods: [...MOODS.map((m) => ({ label: MOOD_LABEL[m], pose: { mood: m } })), { label: "Held", pose: { held: true } }],
  life: [
    { label: "Baby", pose: { stage: 0 } },
    { label: "Kid", pose: { stage: 1 } },
    { label: "Master", pose: { stage: 4 } },
    { label: "Hungry", pose: { hungry: true, t: 0.5 } },
    { label: "Dirt 3", pose: { dirt: 3 } },
    { label: "Walking", pose: { walking: true, walkPhase: 1.1 } },
    { label: "Facing left", pose: { facing: -1, walking: true, walkPhase: 1.1 } },
  ],
  wear: [
    ...ACCESSORIES.map((a) => ({ label: a, pose: { wearing: [a] } })),
    { label: "combo", pose: { wearing: ["scarf", "sunglasses", "tophat"] } },
  ],
  party: [
    ...CELEBRATIONS.map((k) => ({ label: k, pose: { mood: "celebrating" as const, celebration: k, t: CELEBRATION_T[k] } })),
    { label: "golden", pose: { mood: "celebrating", golden: true, t: 1.136 } },
    { label: "treat", pose: { mood: "celebrating", celebration: "dance", food: "🍙", foodT: 0.6 } },
  ],
};

function Matrix({ name }: { name: string }) {
  const shots = MATRICES[name] ?? MATRICES.moods;
  const only = params.get("only")?.split(",");
  const rows = only ? SPECIES.filter((s) => only.includes(s.id)) : SPECIES;
  return (
    <main className="g g--matrix">
      <table className="g-matrix">
        <thead>
          <tr>
            <th />
            {shots.map((s) => (
              <th key={s.label}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((sp) => (
            <tr key={sp.id}>
              <th>{sp.name.en}</th>
              {shots.map((s) => (
                <td key={s.label}>
                  <PetView id={sp.id} pose={defaultPose({ t: T0, ...s.pose })} size={CARD} framed />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(appIconSvg())}`;

function useClock(running: boolean): number {
  const [t, setT] = useState(T0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const start = performance.now() - T0 * 1000;
    const tick = (now: number): void => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return running ? t : T0;
}

function App() {
  const initial = params.get("species");
  const [focus, setFocus] = useState<SpeciesId>(
    initial && (SPECIES_IDS as readonly string[]).includes(initial) ? (initial as SpeciesId) : "mochi",
  );
  const [animateGrid, setAnimateGrid] = useState(false);
  const t = useClock(animateGrid && !STATIC);
  const groups = useMemo(shotsFor, []);
  const info = speciesInfo(focus);

  const choose = useCallback((id: SpeciesId) => {
    setFocus(id);
    const q = new URLSearchParams(location.search);
    q.set("species", id);
    history.replaceState(null, "", `?${q.toString()}`);
    document.getElementById("focus")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <main className="g">
      <header className="g-head">
        <div>
          <h1>TodoPet pet gallery</h1>
          <p>
            24 species drawn by one renderer. Every mood, gait, life state, accessory and celebration.
            {STATIC ? " Time is frozen at t = 1.3." : ""}
          </p>
        </div>
        {!STATIC && (
          <label className="g-toggle">
            <input type="checkbox" checked={animateGrid} onChange={(e) => setAnimateGrid(e.target.checked)} />
            Animate everything
          </label>
        )}
      </header>

      <section className="g-section">
        <h2>Species</h2>
        <div className="g-species">
          {SPECIES.map((s) => (
            <button key={s.id} type="button" className={`g-card g-card--pick${s.id === focus ? " is-on" : ""}`} onClick={() => choose(s.id)}>
              <PetView id={s.id} pose={defaultPose({ t: t + SPECIES_IDS.indexOf(s.id) * (animateGrid ? 0.37 : 0) })} size={112} />
              <span className="g-name">{s.name.en}</span>
              <span className="g-sub">
                {s.name.vi} · {s.gait}
              </span>
              {s.unlock && <span className="g-lock">🔒 {s.unlock.label.en}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="g-section" id="focus">
        <h2>
          <span className="g-emoji">{info.emoji}</span> {info.name.en} <small>“{info.sound.en}” · {info.gait}</small>
        </h2>
        {groups.map((g) => (
          <div key={g.title} className="g-group">
            <h3>
              {g.title}
              {g.note && <small> — {g.note}</small>}
            </h3>
            <div className="g-row">
              {g.shots.map((s) => (
                <figure key={s.label} className="g-card">
                  <PetView id={focus} pose={defaultPose({ t, ...s.pose })} size={CARD} framed />
                  <figcaption>{s.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="g-section">
        <h2>Live preview</h2>
        <LivePreview species={focus} onSpecies={choose} frozen={STATIC} />
      </section>

      <section className="g-section" id="icon">
        <h2>App icon</h2>
        <div className="g-icons">
          {[256, 64, 48, 32, 24, 16].map((s) => (
            <figure key={s}>
              <img src={ICON_URL} width={s} height={s} alt={`App icon at ${s}px`} />
              <figcaption>{s}px</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

const matrix = params.get("matrix");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{matrix ? <Matrix name={matrix} /> : <App />}</StrictMode>,
);
