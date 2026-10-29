# Generator State — v0.6 "Friends", after feedback-v06-001

## What Was Built / Changed
- Friends sheet first screen: the friends and the blob come first; My card is one row (Copy my card + a small Show for the text and "Make a new card identity"); Add a friend is one row that opens the paste box; what a card holds is a folded "What's on a card?" list. First friend row is at 184-250 px of the body at 1366 and 1024x700 in every placement (the "above" body is 365 px).
- Visitor label: two short lines (name; then "dropped by! 🔥 buddy streak N"). Only the name can be cut; the streak never is (checked for names of 12-20 characters, EN and VI).
- Same-name friends get a stable tag from their key ("Mai · #a3f") in the list, helpers, Remove (label and question), statuses, visitor label and aria labels. A default-named pet shows "Mochi (🍡)", not "Mochi (🍡 Mochi)".
- Blob: each person counts up to 15 (you included), so it takes everyone; real counts are shown and the help says "(each person counts up to 15)". The blob is now a small SVG, not an emoji.
- Old card identities: the last 10 public keys are kept in the friends document (`oldKeys`); an old card of mine is refused as "That's one of your own older cards".
- "Copied" clears when the card changes and Copy waits for the new signature; VI privacy text is a list without the stray dash; the buddy-streak rule is said once under the Friends heading (`aria-describedby`); the identity/Remove questions stay inside the board (above their button when low) and a confirmation no longer closes when the board is scrolled; demo "👋 Visit" fits on one line; each demo load has its own card identity (seed in localStorage, reloads keep it).
- Docs: SPEC §1, §3, §5, §6, README (EN/VI) and SECURITY.md updated.

## Known Issues
- The host pet still just stands while a visitor is there (by spec); every visitor wears the same happy face.
- A 12-character card name with wide letters at the narrowest board (372 px) can make a friend row 4 lines tall.

## Dev Server
- URL: http://localhost:1420 (Vite, left running as found)
- Checks: `npx tsc --noEmit` clean, `npx vitest run` all passing (1189 tests)
