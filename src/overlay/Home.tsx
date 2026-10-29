import { forwardRef, memo, useEffect, useMemo, useState } from "react";
import type { Brain } from "../core/brain";
import { homeDecor } from "../core/craft";
import { timeString } from "../core/dates";
import { L } from "../core/l10n";
import { SOUVENIR_AFTER_MS, type Trip } from "../core/trips";
import type { DecorId } from "../core/types";
import { renderDecor } from "../pets";
import { tripSignText } from "./boardGame";

/** Home corner layout: decorations this big (px), this far apart, this far from the left edge. */
export const HOME_ITEM = 40;
const HOME_GAP = 6;
const HOME_LEFT = 14;

/** What the home corner shows for these prefs and this life (at most 3 decorations, maybe none). */
export function homeItems(showHome: boolean, chosen: readonly DecorId[], owned: readonly DecorId[]): DecorId[] {
  return showHome ? homeDecor(chosen, owned) : [];
}

/** Px the corner takes from the left edge (0 when empty), so the pet walks beside it. */
export function homeCornerWidth(n: number): number {
  return n > 0 ? HOME_LEFT + n * HOME_ITEM + (n - 1) * HOME_GAP + 6 : 0;
}

/**
 * Up to three knitted decorations on the ground at the left end of the pet's strip: small, still and a little
 * muted, so they read as the pet's home and not as something asking for attention. Clicks pass through.
 */
export const HomeCorner = memo(function HomeCorner({ items }: { items: readonly DecorId[] }) {
  const svgs = useMemo(() => items.map((id) => ({ id, svg: renderDecor(id, { size: HOME_ITEM, idPrefix: `home-${id}` }) })), [items]);
  if (svgs.length === 0) return null;
  return (
    <div className="home-corner" style={{ left: HOME_LEFT, gap: HOME_GAP }} aria-hidden>
      {svgs.map(({ id, svg }) => (
        <div key={id} className="home-item" style={{ width: HOME_ITEM, height: HOME_ITEM }} dangerouslySetInnerHTML={{ __html: svg }} />
      ))}
    </div>
  );
});

/**
 * The little sign the pet leaves where it stood while it is on a trip. A click calls it back early (the frame
 * loop puts it on the ground; it is a hit area for click-through). A call back in the first 30 minutes brings no
 * souvenir but doesn't use up the day's trip.
 */
export const TripSign = forwardRef<HTMLButtonElement, { trip: Trip; brain: Brain }>(function TripSign({ trip, brain }, ref) {
  const back = timeString(new Date(trip.back));
  const [now, setNow] = useState(() => Date.now());
  // Re-render once the souvenir is earned, so the warning goes away on time.
  useEffect(() => {
    const left = trip.start + SOUVENIR_AFTER_MS - Date.now();
    if (left <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), left + 50);
    return () => clearTimeout(id);
  }, [trip.start, now]);
  const text = tripSignText(trip, now);
  return (
    <button
      ref={ref}
      type="button"
      className="trip-sign"
      data-hit=""
      onClick={() => brain.callBack()}
      title={text.title}
      aria-label={text.label}
    >
      <span className="plank">
        <span className="pack" aria-hidden>
          🎒
        </span>
        {L(`Đi phiêu lưu, về lúc ${back}`, `On a trip, back at ${back}`)}
        <small>{L("bấm để gọi về", "click to call me back")}</small>
      </span>
    </button>
  );
});
