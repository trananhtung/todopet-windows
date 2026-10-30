import { useEffect, useRef, useState } from "react";
import type { Brain, BrainState } from "../core/brain";
import { L } from "../core/l10n";
import { chipLabel, progressText, spokenProgress } from "../core/updates";

/**
 * "✨ 0.7.1 is ready": a small chip in the board's header while a newer version is on offer. A click does what the notice's
 * button does (update in one click, or open the download page when one click is off). While the install runs it shows the
 * progress instead and does nothing when pressed. Everything in it is text: the version comes from outside.
 *
 * It is `aria-disabled` while busy, not `disabled`: a disabled button drops the keyboard's focus to the page, and whoever pressed
 * Enter on it would have to Tab in from the top again. A small hidden live region tells a screen reader about the download at the
 * start, halfway and the last step (not every percent).
 *
 * Its row slides open when the chip first appears (the board's body would otherwise jump by the row's height while you read or
 * type); a reduced-motion preference gets the plain change, see `.update-chip-row` in overlay.css.
 */
export function UpdateChip({ s, brain }: { s: Pick<BrainState, "update" | "installing">; brain: Brain }) {
  const u = s.update;
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const there = u !== null;
  useEffect(() => {
    if (!there) {
      setOpen(false);
      return;
    }
    // Read the layout once while it is still closed, so the change to open is a transition and not the first style.
    void row.current?.offsetHeight;
    setOpen(true);
  }, [there]);
  if (!u) return null;
  const busy = s.installing !== null;
  const how = u.canInstall ? L("Cập nhật và khởi động lại", "Update and restart") : L("Mở trang tải về", "Open the download page");
  return (
    <div className={`update-chip-row${open ? " open" : ""}`} ref={row}>
      <div className="update-chip-clip">
        <button type="button" className="update-chip" title={busy ? undefined : how} aria-disabled={busy} aria-busy={busy} onClick={() => !busy && void brain.startUpdate()}>
          {s.installing ? progressText(s.installing) : chipLabel(u.version, u.canInstall)}
        </button>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {s.installing ? spokenProgress(s.installing) : ""}
        </span>
      </div>
    </div>
  );
}
