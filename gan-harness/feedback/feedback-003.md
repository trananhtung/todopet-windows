# Evaluation — Iteration 003 (TodoPet for Windows, v0.5 "Game", branch feat/v0.5-game)

## Evaluation Mode

**Achieved:** `playwright` (scripted). The Playwright MCP tools were not available, so I drove the live Vite server at
http://localhost:1421 with `playwright-core` and headless system Chrome from Node scripts (one fresh browser context, so empty
localStorage, per scenario). Real mouse and keyboard input, viewport sizes 1300x900, 1024x700, 900x1000 and 760x800-900,
`prefers-color-scheme` light and dark, English (`en-US`) and Vietnamese (`vi-VN` plus `lang: "vi"` in prefs), console, page-error
and HTTP-error capture on every run, and Playwright's fake clock (`page.clock`) for time-dependent rules: 10:00 workday, a 45-minute
trip, 22 minutes of active work, stitch drops, the trip offer, Monday 2026-11-02, and the Christmas, Tết and Trung Thu windows.
Pet animation was checked by recording the live SVG every 100-150 ms and laying the frames out as contact sheets.
Also run: `vitest run` 322/322 pass (19 files), `tsc --noEmit` clean. Not run: `vite build`.
**Console:** zero console errors, warnings, page errors or 4xx across roughly 45 runs on overlay, settings, diary and gallery.
**Not testable in a browser (and not tested):** Windows click-through, tray, sound, real 3-5 minute drowsiness ramp (I only saw the
sleeping state via "Step away"), sneeze and trip acts outside the gallery matrix, UI Automation.
No tracked file was modified.

Screenshot directory (everything below lives here): `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/`

## Scores (weights from gan-harness/eval-rubric.md)

| Criterion | Iter 2 | Iter 3 | Weight | Weighted |
|-----------|-------:|-------:|-------:|---------:|
| Functionality | 7.0 | **7.0** | 0.35 | 2.45 |
| Pet craft | 7.0 | **8.0** | 0.25 | 2.00 |
| Design quality | 7.5 | **7.5** | 0.25 | 1.88 |
| Copy & i18n | 7.5 | **8.0** | 0.15 | 1.20 |
| **TOTAL** | 7.2 | | | **7.5 / 10** |

## Verdict: PASS (threshold 7.0)

Every item of the v0.5 contract works, in both languages and at 1024x700, with no console errors and no crash under rapid input.
The pet interactions are the best thing in the project so far. The pass is held at 7.5 and not higher by four things a real user hits
quickly: a double-click on the pet opens and closes the board, earned chests give no visible cue anywhere, a pet dropped at the left
edge stands on top of the Home decorations, and the knitting reward is not tied to session length.

## Critical issues (must fix)

None. No contract item is broken.

## Major issues (should fix)

1. **Overlay, double-click on the pet: the board opens and immediately closes.**
   Steps: load `/overlay.html?demo`, click the pet 2 times, 130 ms apart. Board count after clicks 1, 2, 3 was `[1, 0, 0]`; after 6
   clicks `[1, 0, 0, 0, 0, 0]`. Click 3 giggles, click 6 gives the dizzy then pout sequence, and the board ends closed.
   Expected: a double-click (the reflex for "poke the pet") either leaves the board open or does nothing visible. Actual: the board
   flashes up and is gone, so the pet seems unresponsive until the third click. Cause: in `App.tsx` `endPress`, clicks 1 and 2 are not
   "pokes" so each toggles the board; the combo only starts at click 3.
   Fix: treat a click that follows another within ~400 ms as part of a burst and do not toggle on it (open on the first click, ignore the
   rest), or defer the toggle by the burst window and apply it only if the burst ended at one click.
   Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/e2-triple.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/e3-six.png` (frame strips; board counts are in the run log above).

2. **Board and overlay: a chest you earn is invisible until you open the Wardrobe.**
   Steps: fake clock 10:00 on a workday, keep the mouse moving, advance 22 minutes (`/overlay.html?demo`). The Wardrobe strip changes to
   "chests x2, 2 of 3 today", and the diary gets a line, but there was no bubble, no cue on the pet, and the board's main screen (header,
   stats tiles, lists, footer) shows no chest anywhere. The only way to learn a chest is waiting, or that "finishing a task opens one",
   is to dig into Board, Wardrobe, chest strip.
   Expected (design doc: "reasons to come back on a timer"): a small cue when a chest is earned and a persistent one while it is
   held. Actual: the central v0.5 reward loop has no visible trigger. Fix: a chest chip next to the stats tiles (or a small gift on the pet's
   badge) while `chests.held > 0`, and one short bubble line when one is earned ("A chest is ready. Finish a task to open it").
   Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/r-1-after-work.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/r-2-board.png`.

3. **Overlay, Home corner: dropping the pet at the left edge lands it on top of the decorations.**
   Steps: with 3 decorations shown, drag the pet to x=10 on the taskbar and release. Pet box x=-15..135, home corner x=14..146, so the pet
   stands over the rug and the plant and only the mug peeks out. It stays there (checked 2.5 s after landing). The walk range respects
   `homeCornerWidth`; the drop clamp does not, and the Home sheet promises the items are "set out beside it".
   Fix: clamp the drop x (and re-clamp after landing) to at least `homeCornerWidth(n) + size/2`.
   Screenshot: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/q-1-far-left.png`.

4. **Knitting: a finished session of any length gives a whole decoration, and dropped stitches have no consequence.**
   Steps: demo "Focus 1'" and wait for the end: the bubble says "All done! A fish bowl for our little corner" after 60 s, from a 40% start.
   `finishFocus` calls `craftDone(true)`, which does `topUp` to 1 regardless of `focusMinutes`, so the v0.4 "Try 2 minutes" starter gives
   a decoration every 2 minutes (12 items in about 25 minutes). The stitch penalty is real while the session runs (40% to 31% after
   30 s on YouTube, with the "Oops, I dropped a few stitches" bubble) but by the code is erased by the same `topUp` if the session
   completes. It only matters if you abandon the session.
   Fix: top up proportionally (for example only when the session was at least the configured focus length, or scale `topUp` by
   `minutes / focusMinutes`), and apply the dropped-stitch cost after the top-up so it can cost a finished item time.
   Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/d2-en-1300-end-bubble-0.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/o-en-2-board-after-drop.png`.

## Minor issues (nice to fix)

5. **Demo controls: dead and slow buttons, and stunts while the pet is away.**
   (a) After a trip has ended, "Go on a trip" is shown again but does nothing (`goOnTrip` returns false for the day), with no message.
   Run: trip, 45 min fake time, call back, click again: no sign, same bubble. Label it "Trip done today" and disable it.
   (b) "Step away" takes about 12.4 s to flip to "Wake up" (the mood is recomputed on the 15 s tick); the pet looks drowsy right away
   so it reads as laggy, not broken.
   (c) While the pet is on a trip, "Table flip", "Parade" and "Focus 1'" still run: the flip shout and the parade sign render with no
   pet, and the focus bubble says "I'll sit quietly and guard" from an absent pet. Make `demoAntic` and the focus line trip-aware.
   Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/p-1-trip-then-focus.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/p-2-trip-then-flip.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/p-3-trip-then-parade.png`.

6. **Wardrobe shows system emoji, not the new art, and there is no try-on.**
   The 14 accessories are well drawn on all 24 species (gallery matrix), but the picker uses generic emoji: a wizard figure for the Witch
   hat, Santa's face for the Santa hat, an orange heart for the Bandana, a grey yarn ball for the Beanie. Players choose blind.
   Fix: render each accessory on the current pet at about 48 px with `renderPet`, or at least draw the accessory alone.
   Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/b-en-1300-wardrobe-1.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/i-gallery-matrix-wearnew.png`.

7. **Finishing a task while the pet is away opens a chest for a pet that is not there.**
   Steps: trip, then "Finish a task": the celebration bubble anchors above the sign, a gift pops out of the sign, and the text says
   "Rare chest! A new Heart glasses for me!". Either hold the chest until the pet is back, or word it ("I'll open it when I'm home").
   Screenshot: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/f-en-1300-5-finish-while-away.png`.

8. **Hovering alone already looks like being petted.**
   With the cursor resting on the pet and no movement, frames from 1.6 s to 3.2 s show the same ^^ squint, blush and hearts as the petting
   strokes. Real petting only adds the lean and, after 2 s, the slow cat blink, so the new interaction reads as an upgrade only to
   someone looking closely. Make plain hover a blush and a look, and keep the squint for petting.
   Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/e1-petting.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/e2-triple.png`.

9. **Board at 1024x700 (EN): stat labels and footer truncate.**
   At 1024x700 the board was 374 px wide: "55% full" shrank to "55%", the footer showed "Synced ..." and the priority chips wrapped to a
   second row. The calendar summary also clips its tail ("8h15 ..." at 1300). The Vietnamese board at the same size fit.
   Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/a-1024-board.png`,
   `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/r-2-board.png`.

10. **Keyboard: switching sheets drops focus, and Escape skips a level.**
    Pet, Tab, Enter, wardrobe, Home all work and the tab order is sensible, but activating "Home" or "Back" leaves
    `document.activeElement` on the page behind the board, and Escape in the Home sheet closes the whole board instead of going back to
    the Wardrobe. Move focus to the new sheet's heading or first control, and let Escape pop one level.

11. **The knitted item does not visibly grow at taskbar size.**
    The pose draws yarn, needles and a small pink patch, which reads well, but the frames at 26 s and 51 s are identical because progress
    moves about 1% per 15 s. Show at least 3 visible stages, or make the patch grow with `craft`.
    Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/d2-en-1300-knit-26s.png`,
    `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/d2-en-1300-knit-51s.png`.

12. **The end-of-focus result is lost if the board is open.**
    With the board open when the session ends, no bubble shows (bubbles are hidden behind the board), the focus card just disappears, and
    the new decoration silently appears in the corner. Add a line in the board ("Finished: Poster") or show the reveal anyway.
    Screenshot: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/d-en-1300-focus-end.png`.

13. **Copy nits.**
    - Diary: "Closed 2026-10-26: 3/3 done" and VI "Chốt ngày 2026-10-26" print a raw ISO date.
    - VI diary: "→ no 80%, 280 XP" is ambiguous ("no" is "full" in Vietnamese; the board says "no bụng").
    - Diary quotes bubbles cut mid-word: "There's a postcard wait…".
    - Odds line off-season: "a seasonal accessory during a season, else a golden treat" is robotic.
    - The Monday greeting is a 7-line bubble (greeting, calendar, streak, fresh start, two buttons).
    Screenshots: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/g-vi-dark-900-postcard-day.png`,
    `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/g-en-dark-760-top.png`,
    `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/t-vi-monday.png`.

14. **About says "Version 0.2.0"** (and `package.json` is 0.2.0) in a build that adds v0.3 to v0.5.
    Screenshot: `/tmp/claude-1000/-home-tony-tran-repos/58928874-bf90-402b-96f0-19dad587d2d6/scratchpad/v05-eval/h2-en-dark-760-08-About-0.png`.

15. **Small art and layout nits.** The Bandana on the Frog reads as a small orange bikini bottom at 96 px
    (`i2-wear-frog.png` in the screenshot directory). The trip banner wraps "back at / 19:56" on two lines in EN at 1300, and the board
    covers most of the trip sign while open (`f-en-1300-1-board-open-trip.png`).

## What was verified working

- **Pet interactions** (frame strips in the screenshot directory): petting (squint, lean, hearts, slow blink after about 2 s) in `e1-petting.png`;
  giggle at click 3 with "hehe", dizzy at click 6 with swirl eyes and stars, then pout with puffed cheeks, in `e2-triple.png` and `e3-six.png`;
  30 clicks at 40 ms: no errors, no stuck state; stretch and dangle while held, then 3 shakes and a look at the user after the drop,
  in `e4-drag.png`; head tilt when the cursor rests nearby, in `e5-tilt.png`; idle fidgets over 60 s, in `e6-fidget.png`;
  sleeping then a wave hello on waking, in `l2-2-hello.png`.
- **Chests:** common, rare and legendary rewards all reveal with a bubble and the accessory is put on (Witch hat on the head with
  confetti); Undo does not close the chest again; the odds panel shows 70/25/5 with the active season in EN and VI.
- **Seasons** with the fake clock: Halloween 4 days left today, 13 on Oct 20, "last day!" on Nov 1; Christmas Dec 20 13 left; Tết Feb 4 2027
  10 left; Trung Thu Sep 16 2027 3 left; none shows "Next: Christmas from Dec 15". Only the active season's items read "in chests now".
- **Knitting and Home:** yarn ring in the focus card, dropped stitches (-10% plus a bubble), a finished item lands in the corner; Home sheet
  picks up to 3, the toggle hides the corner, and the Settings Pet page mirrors it.
- **Trips:** offer bubble at 10:30 after the plan is done ("Back at 12:31", Go!/Stay, VI "Đi đi!/Ở lại nha"), sign on the taskbar, banner
  in the board with a call-back button, an early return with no souvenir says so, a 45-minute trip brings the souvenir, the shelf fills,
  and the diary shows an airmail postcard.
- **Diary:** weekly chapter headers with recaps, postcard cards, light and dark, EN and VI. Settings dark and VI are clean.
- **Monday fresh start:** "New week, fresh start! Last week: 12 tasks · 2 stickers · 1 trip" and the Vietnamese equivalent.
- **Board:** a double-click on a check circle completes one task, not two (the iteration-2 bug is fixed); a 520-character title, script
  tags, emoji and a zero-width space render safely with no horizontal overflow; accessory slot swaps work (Bow, Top hat share a slot).
- **Gallery:** `?matrix=acts` (24 species by 20 acts), `?matrix=wearnew` (14 accessories on every species), `?matrix=moods` and the
  decoration strip render with no clipping.

## What improved since last iteration

- The iteration-2 majors I re-checked are gone: the add-task race, the double-click on a check (`e.detail < 2` guard), the demo's mood and the clean console.
- Pet craft finally moved: the acts set (giggle, dizzy, pout, shake, wave, yawn, drowsy), the sleeping tint, and 14 accessories that sit
  right on all species.
- The diary page gained its best visuals (weekly chapters, postcards); the Vietnamese copy has real voice.

## What regressed since last iteration

- Nothing found in the old surfaces. New surfaces introduced majors 1, 3 and 4 above.

## Specific suggestions for next iteration (in order)

1. Fix the double-click (major 1) and clamp drops against the Home corner (major 3); both are small.
2. Give chests a visible life: a chip next to the stats and an "earned" line (major 2).
3. Make the knitting reward proportional to the session and let stitch drops matter (major 4), and show the patch growing (minor 11).
4. Draw accessory previews in the wardrobe (minor 6).
5. Make the demo panel trip- and mood-aware (minor 5) and tidy the copy nits (minor 13).
