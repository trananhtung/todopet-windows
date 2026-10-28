// Pet pictures for the Settings and Diary windows, drawn by the species renderer in src/pets.
import { type RefObject, useEffect, useMemo, useRef } from "react";
import type { SpeciesId } from "../core/types";
import { defaultPose, renderPet } from "../pets";
import type { PetPose } from "../pets/types";

let warned = false;

/** The renderer's SVG string; an empty string (and one console error) if a species fails to draw. */
function draw(species: SpeciesId, pose: PetPose, idPrefix: string, size: number): string {
  try {
    return renderPet(species, pose, { idPrefix, size });
  } catch (e) {
    if (!warned) {
      warned = true;
      console.error(`TodoPet: could not draw "${species}"`, e);
    }
    return "";
  }
}

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One still frame. The markup comes from our own renderer, never from user input. */
export function PetStill({
  species,
  pose,
  size = 64,
  idPrefix,
  className,
}: {
  species: SpeciesId;
  pose?: Partial<PetPose>;
  size?: number;
  idPrefix: string;
  className?: string;
}) {
  const poseKey = JSON.stringify(pose ?? {});
  const html = useMemo(
    () => draw(species, defaultPose(JSON.parse(poseKey) as Partial<PetPose>), idPrefix, size),
    [species, poseKey, idPrefix, size],
  );
  return <span className={className ? `pet-art ${className}` : "pet-art"} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * An idle, breathing pet (requestAnimationFrame, ~30 fps). It looks toward the pointer and blushes while
 * the pointer is over `trackRef`. Frames are written straight into the DOM so React does not re-render.
 */
export function PetLive({
  species,
  size = 120,
  idPrefix,
  trackRef,
  className,
}: {
  species: SpeciesId;
  size?: number;
  idPrefix: string;
  trackRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const look = useRef({ x: 0, y: 0, hovered: false });

  useEffect(() => {
    const zone = trackRef?.current;
    if (!zone) return;
    const move = (e: PointerEvent) => {
      const box = host.current?.getBoundingClientRect();
      if (!box) return;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height * 0.45;
      look.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - cx) / (box.width * 0.9))),
        y: Math.max(-1, Math.min(1, (e.clientY - cy) / (box.height * 0.9))),
        hovered: true,
      };
    };
    const leave = () => {
      look.current = { x: 0, y: 0, hovered: false };
    };
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerleave", leave);
    return () => {
      zone.removeEventListener("pointermove", move);
      zone.removeEventListener("pointerleave", leave);
    };
  }, [trackRef]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const frame = (t: number) => {
      const { x, y, hovered } = look.current;
      el.innerHTML = draw(species, defaultPose({ mood: "happy", t, lookX: x, lookY: y, hovered }), idPrefix, size);
    };
    if (reducedMotion()) {
      frame(0);
      return;
    }
    const start = performance.now();
    let last = -Infinity;
    let raf = requestAnimationFrame(function tick(now) {
      if (now - last >= 33) {
        last = now;
        frame((now - start) / 1000);
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [species, idPrefix, size]);

  return <span ref={host} className={className ? `pet-art ${className}` : "pet-art"} aria-hidden="true" />;
}
