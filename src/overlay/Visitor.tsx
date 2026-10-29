// A friend's pet dropping by (SPEC v0.6 §4): drawn with the same renderer as yours, from the card's species,
// accessories and stage. It walks in beside your pet, waves, carries a small label and leaves after about 25 s.
// Ambient, not a bubble. Light on the CPU: its own small frame loop (about 12 frames a second while it moves, 4 while
// it stands), which exists only while a visit does; nothing at all when it is over.
import { useEffect, useRef, type MutableRefObject } from "react";
import type { Brain } from "../core/brain";
import { VISIT_WALK_MS, visitLabel, type Visit } from "../core/friends";
import { L } from "../core/l10n";
import { defaultPose, renderPet, speciesInfo, ACT_DURATION } from "../pets";
import { STEP } from "./motion";

/** The SVG design space: feet at y = 150 of 160, the head about 12% down. */
const FEET = 150 / 160;
/** The visitor is a little smaller than your pet, so the host stays the star. */
const SCALE = 0.86;
/** How far outside its place it starts (and ends) its walk, px. */
const ENTRY = 240;
/** Frames: while it moves or waves, and while it just stands there breathing. */
const MOVING_MS = 1000 / 12;
const STILL_MS = 250;

const ease = (p: number) => 1 - (1 - p) ** 3;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface PetAnchor {
  x: number;
  top: number;
  feetY: number;
  size: number;
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Visitor({
  brain,
  visit,
  anchor,
  hideLabel,
  onOpen,
}: {
  brain: Brain;
  visit: Visit;
  /** Where your pet stands (the overlay's frame loop keeps it up to date). */
  anchor: MutableRefObject<PetAnchor>;
  /** A bubble is showing over your pet: the label would sit in its way. */
  hideLabel: boolean;
  /** Opens the Friends sheet. */
  onOpen: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLButtonElement>(null);
  // The brain may shorten the visit (the moment stopped being calm): the loop reads the latest.
  const latest = useRef(visit);
  latest.current = visit;

  useEffect(() => {
    const el = wrap.current;
    const picture = art.current;
    const tag = label.current;
    if (!el || !picture) return;
    const still = reducedMotion();
    let raf = 0;
    let lastDraw = -1e9;
    let lastSvg = "";
    let lastX: number | null = null;
    let phase = 0;
    let side: 1 | -1 = 1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const v = latest.current;
      const nowMs = brain.clockNow();
      const t = nowMs - v.start;
      const left = v.end - nowMs;
      const a = anchor.current;
      const stage = el.parentElement;
      if (!stage || left <= 0) {
        el.style.opacity = "0";
        return;
      }
      const W = stage.clientWidth;
      const size = a.size * SCALE;
      const info = speciesInfo(v.friend.species);
      // Where it stands: beside your pet, on the side with more room.
      const room = a.x < W / 2 ? 1 : -1;
      if (t < 200) side = room;
      const place = Math.min(Math.max(a.x + side * a.size * 0.78, size * 0.4), W - size * 0.4);
      // Walking in (eased) and, at the end, walking out the way it came; with reduced motion it just fades.
      const pIn = still ? 1 : clamp01(t / VISIT_WALK_MS);
      const pOut = still ? 0 : clamp01(1 - left / VISIT_WALK_MS);
      const x = place + side * ENTRY * (1 - ease(pIn)) + side * ENTRY * pOut * pOut;
      const walking = pIn < 1 || pOut > 0;
      if (lastX !== null && walking) phase += (Math.abs(x - lastX) / STEP[info.gait]) * Math.PI;
      lastX = x;
      // Facing your pet while it arrives and stands; away from it when it leaves.
      const facing: 1 | -1 = pOut > 0 ? (side > 0 ? 1 : -1) : side > 0 ? -1 : 1;
      // A wave hello when it arrives, and another before it goes.
      const sinceArrive = (t - VISIT_WALK_MS) / 1000;
      const untilLeave = (left - VISIT_WALK_MS) / 1000;
      const wave = ACT_DURATION.wave;
      const act = still
        ? null
        : sinceArrive >= 0.15 && sinceArrive < 0.15 + wave
          ? { kind: "wave" as const, t: sinceArrive - 0.15 }
          : untilLeave > 0 && untilLeave <= wave + 0.2 && untilLeave >= 0.2
            ? { kind: "wave" as const, t: wave + 0.2 - untilLeave }
            : null;
      // Fades in and out at the ends.
      el.style.opacity = String(Math.min(1, t / 500, left / 500));
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.transform = `translate(${x - size / 2}px, ${a.feetY - size * FEET}px)`;
      if (tag) {
        // The label sits above its head and stays on screen.
        const lw = tag.offsetWidth;
        const lx = Math.min(Math.max(x - lw / 2, 8), W - lw - 8);
        tag.style.left = `${lx - (x - size / 2)}px`;
      }
      const busy = walking || act !== null;
      if (now - lastDraw < (busy ? MOVING_MS : STILL_MS)) return;
      lastDraw = now;
      const pose = defaultPose({
        mood: "happy",
        t: now / 1000,
        facing,
        walking,
        walkPhase: phase,
        lookX: -side,
        stage: v.friend.stage,
        wearing: v.friend.accessories,
        act,
      });
      const svg = renderPet(v.friend.species, pose, { size, idPrefix: "visitor" });
      if (svg !== lastSvg) {
        picture.innerHTML = svg;
        lastSvg = svg;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [brain, anchor, visit.id]);

  const text = visitLabel(visit.friend.name, visit.streak);
  return (
    <div className="visitor" ref={wrap}>
      <div className="visitor-art" ref={art} data-hit="" onClick={onOpen} aria-hidden />
      {!hideLabel && (
        <button
          ref={label}
          type="button"
          className="visitor-label"
          data-hit=""
          onClick={onOpen}
          title={text}
          aria-label={`${text}. ${L("Mở danh sách bạn bè", "Open Friends")}`}
        >
          {text}
        </button>
      )}
    </div>
  );
}
