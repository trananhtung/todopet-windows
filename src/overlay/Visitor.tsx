// A friend's pet dropping by (SPEC v0.6 §4): drawn with the same renderer as yours, from the card's species,
// accessories and stage. It walks in beside your pet, waves, carries a small label and leaves after about 25 s.
// Ambient, not a bubble. Light on the CPU: its own small frame loop, which exists only while a visit does; nothing at
// all when it is over. The whole body of the loop runs about 12 times a second while it moves and 4 while it stands
// (the display may call it 60 times), and a style that has not changed is not written again.
import { useEffect, useRef, type MutableRefObject } from "react";
import type { Brain } from "../core/brain";
import { VISIT_WALK_MS, visitLabel, visitTail, type Visit } from "../core/friends";
import { L } from "../core/l10n";
import { defaultPose, renderPet, speciesInfo, ACT_DURATION } from "../pets";
import { FriendName, shownName } from "./FriendName";
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
/** A frame may come this much early and still count (display frames are 16.7 ms apart, so a 83.3 ms wait would otherwise often take 100). */
const SLACK_MS = 4;

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
  petName,
  tag: nameTag = null,
  onOpen,
}: {
  brain: Brain;
  visit: Visit;
  /** Where your pet stands (the overlay's frame loop keeps it up to date). */
  anchor: MutableRefObject<PetAnchor>;
  /** A bubble is showing over your pet: the label would sit in its way. */
  hideLabel: boolean;
  /** My pet's name: a friend's name that could pass for it is shown with the friend's species beside it. */
  petName: string;
  /** The tag that tells this friend from another with the same name ("#a3f"), or null. */
  tag?: string | null;
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
    if (!el || !picture) return;
    const still = reducedMotion();
    let raf = 0;
    // The earliest display frame at which the body runs next: this is the loop's throttle.
    let nextAt = -Infinity;
    let lastSvg = "";
    let lastX: number | null = null;
    let phase = 0;
    let side: 1 | -1 = 1;
    // The last style each element was given, so that a value that has not changed is not written (a write can force a layout).
    const written = new WeakMap<HTMLElement, Record<string, string>>();
    const put = (target: HTMLElement, prop: "opacity" | "width" | "height" | "transform" | "left", value: string) => {
      const known = written.get(target) ?? {};
      written.set(target, known);
      if (known[prop] === value) return;
      known[prop] = value;
      target.style[prop] = value;
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now < nextAt) return;
      const v = latest.current;
      const nowMs = brain.clockNow();
      const t = nowMs - v.start;
      const left = v.end - nowMs;
      const a = anchor.current;
      const stage = el.parentElement;
      if (!stage || left <= 0) {
        put(el, "opacity", "0");
        nextAt = now + STILL_MS - SLACK_MS;
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
      put(el, "opacity", String(Math.min(1, t / 500, left / 500)));
      put(el, "width", `${size}px`);
      put(el, "height", `${size}px`);
      put(el, "transform", `translate(${x - size / 2}px, ${a.feetY - size * FEET}px)`);
      // The label may have come and gone since the last frame (a bubble hides it): read the one that is there now.
      const tag = label.current;
      if (tag) {
        // The label sits above its head and stays on screen.
        const lw = tag.offsetWidth;
        const lx = Math.min(Math.max(x - lw / 2, 8), W - lw - 8);
        put(tag, "left", `${lx - (x - size / 2)}px`);
      }
      nextAt = now + (walking || act !== null ? MOVING_MS : STILL_MS) - SLACK_MS;
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

  const f = visit.friend;
  const text = visitLabel(shownName(f.name, f.species, petName, nameTag), visit.streak);
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
          {/* The name is on a line of its own and is the only thing that gives way when it is long; the streak is never cut. */}
          <span className="vl-who">
            <FriendName name={f.name} species={f.species} myPetName={petName} tag={nameTag} />
          </span>
          <span className="vl-tail">{visitTail(visit.streak)}</span>
        </button>
      )}
    </div>
  );
}
