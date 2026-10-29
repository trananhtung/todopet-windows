import { useEffect, useRef, useState } from "react";
import {
  ACCESSORIES,
  CELEBRATIONS,
  MOODS,
  SPECIES_IDS,
  type Accessory,
  type CelebrationKind,
  type Mood,
  type SpeciesId,
  type StageIndex,
} from "../core/types";
import { ACT_DURATION, PET_ACTS, SPECIES, defaultPose, renderPet, type PetActKind } from "../pets";

interface Props {
  species: SpeciesId;
  onSpecies(id: SpeciesId): void;
  frozen: boolean;
}

const FOODS = ["🍙", "🍡", "🐟", "🧁", "🍓", "🍪", "🥟", "🍩"];

/** A big pet driven by requestAnimationFrame, with every pose knob exposed. */
export function LivePreview({ species, onSpecies, frozen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [mood, setMood] = useState<Mood>("normal");
  const [walking, setWalking] = useState(false);
  const [calm, setCalm] = useState(false);
  const [held, setHeld] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [stage, setStage] = useState<StageIndex>(3);
  const [dirt, setDirt] = useState(0);
  const [hungry, setHungry] = useState(false);
  const [golden, setGolden] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationKind>("jump");
  const [wearing, setWearing] = useState<Accessory[]>([]);
  const [lang, setLang] = useState<"en" | "vi">("en");
  const [headTilt, setHeadTilt] = useState(0);
  const [knit, setKnit] = useState(-1);
  const [drowsy, setDrowsy] = useState(0);
  const [petting, setPetting] = useState(false);

  // Values the animation loop reads without restarting.
  const live = useRef({
    mood,
    prevMood: mood as Mood,
    moodAt: -10,
    foodAt: -10,
    food: null as string | null,
    act: null as PetActKind | null,
    actAt: -10,
    petAt: -10,
  });
  const state = { species, walking, calm, held, hovered, facing, stage, dirt, hungry, golden, celebration, wearing, lang, headTilt, knit, drowsy, petting };
  const latest = useRef(state);
  latest.current = state;
  // When time is frozen there is no animation loop, so redraw whenever a knob changes.
  const frozenKey = frozen ? JSON.stringify(state) + mood : "";

  const changeMood = (m: Mood): void => {
    const now = performance.now() / 1000;
    live.current = { ...live.current, prevMood: live.current.mood, mood: m, moodAt: now };
    setMood(m);
  };
  const play = (kind: PetActKind): void => {
    live.current.act = kind;
    live.current.actAt = performance.now() / 1000;
  };
  const togglePetting = (on: boolean): void => {
    live.current.petAt = performance.now() / 1000;
    setPetting(on);
  };
  const feed = (): void => {
    live.current.foodAt = performance.now() / 1000;
    live.current.food = FOODS[Math.floor(Math.random() * FOODS.length)];
    if (live.current.mood !== "celebrating") changeMood("celebrating");
  };

  useEffect(() => {
    let raf = 0;
    let walkPhase = 0;
    let last = performance.now();
    const start = 0;
    const draw = (now: number): void => {
      const s = latest.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = frozen ? 1.3 : (now - start) / 1000;
      if (s.walking && !frozen) walkPhase += dt * 7;
      const L = live.current;
      const sec = now / 1000;
      const el = box.current;
      if (el) {
        el.innerHTML = renderPet(
          s.species,
          defaultPose({
            t,
            mood: L.mood,
            prevMood: L.prevMood,
            blend: frozen ? 1 : Math.min(1, (sec - L.moodAt) / 0.6),
            walking: s.walking,
            walkPhase,
            calm: s.calm,
            held: s.held,
            hovered: s.hovered,
            facing: s.facing,
            stage: s.stage,
            dirt: s.dirt,
            hungry: s.hungry,
            golden: s.golden,
            celebration: s.celebration,
            wearing: s.wearing,
            headTilt: s.headTilt,
            act: L.act && sec - L.actAt < ACT_DURATION[L.act] ? { kind: L.act, t: frozen ? 0.5 : sec - L.actAt } : null,
            craft: s.knit >= 0 ? s.knit / 100 : null,
            drowsy: s.drowsy / 100,
            petting: s.petting ? (frozen ? 3 : sec - L.petAt) : 0,
            food: sec - L.foodAt < 2 ? L.food : null,
            foodT: sec - L.foodAt,
            lookX: s.walking ? 0 : s.petting ? 0.8 : Math.sin(t * 0.7) * 0.8,
            lookY: s.walking ? 0 : Math.sin(t * 0.43) * 0.5,
          }),
          { idPrefix: "live", size: 280, lang: s.lang },
        );
      }
      if (!frozen) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frozen, frozenKey]);

  const toggleWear = (a: Accessory): void =>
    setWearing((w) => (w.includes(a) ? w.filter((x) => x !== a) : [...w, a]));

  return (
    <div className="g-live">
      <div className="g-live-stage">
        <div ref={box} className="g-live-pet" />
        <div className="g-live-ground" />
      </div>
      <div className="g-controls">
        <label>
          Species
          <select value={species} onChange={(e) => onSpecies(e.target.value as SpeciesId)}>
            {SPECIES_IDS.map((id) => (
              <option key={id} value={id}>
                {SPECIES.find((s) => s.id === id)?.name.en}
              </option>
            ))}
          </select>
        </label>
        <div className="g-chips" role="group" aria-label="Mood">
          {MOODS.map((m) => (
            <button key={m} type="button" className={m === mood ? "is-on" : ""} onClick={() => changeMood(m)}>
              {m === "annoyed" ? "worried" : m}
            </button>
          ))}
        </div>
        <div className="g-chips" role="group" aria-label="Celebration">
          {CELEBRATIONS.map((k) => (
            <button key={k} type="button" className={k === celebration ? "is-on" : ""} onClick={() => setCelebration(k)}>
              {k}
            </button>
          ))}
          <button type="button" className="g-feed" onClick={feed}>
            Feed a treat
          </button>
        </div>
        <div className="g-checks">
          {(
            [
              ["Walking", walking, setWalking],
              ["Calm", calm, setCalm],
              ["Held", held, setHeld],
              ["Hovered", hovered, setHovered],
              ["Hungry", hungry, setHungry],
              ["Golden", golden, setGolden],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label}>
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} /> {label}
            </label>
          ))}
          <label>
            <input type="checkbox" checked={facing === -1} onChange={(e) => setFacing(e.target.checked ? -1 : 1)} /> Facing left
          </label>
          <label>
            <input type="checkbox" checked={lang === "vi"} onChange={(e) => setLang(e.target.checked ? "vi" : "en")} /> Tiếng Việt
          </label>
          <label>
            <input type="checkbox" checked={petting} onChange={(e) => togglePetting(e.target.checked)} /> Petting
          </label>
        </div>
        <div className="g-chips" role="group" aria-label="Acts">
          {PET_ACTS.map((k) => (
            <button key={k} type="button" onClick={() => play(k)}>
              ▶ {k}
            </button>
          ))}
        </div>
        <label className="g-range">
          Knitting <input type="range" min={-1} max={100} value={knit} onChange={(e) => setKnit(Number(e.target.value))} />
          <output>{knit < 0 ? "off" : `${knit}%`}</output>
        </label>
        <label className="g-range">
          Drowsy <input type="range" min={0} max={100} value={drowsy} onChange={(e) => setDrowsy(Number(e.target.value))} />
          <output>{drowsy}%</output>
        </label>
        <label className="g-range">
          Stage <input type="range" min={0} max={4} value={stage} onChange={(e) => setStage(Number(e.target.value) as StageIndex)} />
          <output>{["Baby", "Kid", "Teen", "Grown-up", "Master"][stage]}</output>
        </label>
        <label className="g-range">
          Head tilt <input type="range" min={-20} max={20} value={headTilt} onChange={(e) => setHeadTilt(Number(e.target.value))} />
          <output>{headTilt}°</output>
        </label>
        <label className="g-range">
          Dirt <input type="range" min={0} max={3} value={dirt} onChange={(e) => setDirt(Number(e.target.value))} />
          <output>{dirt}</output>
        </label>
        <div className="g-chips" role="group" aria-label="Accessories">
          {ACCESSORIES.map((a) => (
            <button key={a} type="button" className={wearing.includes(a) ? "is-on" : ""} onClick={() => toggleWear(a)}>
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
