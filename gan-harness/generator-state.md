# Generator State — v0.4, round 2 (after feedback-v04-002)

## What Was Built / Changed
- Morning greeting after a day with nothing done: the kind words (snack, frozen, broken, quest, level) ride in the greeting as lines after it (one bubble); alone only on a day off or once the greeting has come.
- "Move some?" shows as a banner in the open board (`Bubble.inBoard`), is dropped once read there when the board closes, and when the lighten view opens.
- Friday: every "tomorrow" of the ritual says the next workday's name (`Brain.wrapDayName()`): note label, sheet texts, bubble after Done for today, review bubble and its button, "Moved N tasks to Monday", diary.
- Wrap up sheet on a short board (< 600 px, e.g. "above" at 1024x700): compact layout, 3 rows visible; "above" placement keeps the 16 px top gap; bar fades rows instead of cutting them.
- Split sheet and wardrobe focus their heading (Escape goes back to the list; focus returns to the opener).
- Lighten view: first "→ Tomorrow" focused on open, arrow keys, next row's button after a move (add field when the day fits), no hover icons in lighten rows, timeline folds away, chip steps aside, note says what a move freed.
- Hover icons: the title and chips fade out before them (`--under-actions` mask) instead of being drawn over.
- Minor: Esc on a banner closes the banner only; related-task button shows up to 26 characters; review with nothing left offers only Wrap up; stale bubble gives its counted reminder back; strip caption no longer `aria-live`.

## Known Issues
- Hover fade is a fade, not an ellipsis (an ellipsis would re-wrap the row on hover).
- Strip bars keep `role="img"` with a tab stop.
- Demo: "Real time" button is still hidden while Friday is on.

## Dev Server
- URL: http://localhost:1420 (Vite, left running as found)
- Checks: `npx tsc --noEmit` clean, `npx vitest run` 681 tests passing
