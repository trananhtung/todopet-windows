# Evaluation — Iteration 001 (TodoPet for Windows)

## Evaluation Mode

**Achieved:** `playwright` (scripted). The Playwright MCP tools were not callable in this session, so I drove the live
dev server at http://localhost:1420 with `playwright-core` 1.62.1 plus system Chrome 156 (headless) through Bash
scripts. This is real browser interaction, not a static review: clicks, drags, keyboard, resizing, `prefers-color-scheme`
emulation and console capture. I also used Playwright's fake clock (`page.clock`) to set 10:00 and 11:00 on a Wednesday,
because the demo is time-dependent (see issue 4). Viewports: 1366x768, 1920x1080, 1024x700 (overlay) and 600x760 (Settings/Diary).
Not tested (outside the browser): Windows click-through, tray, sound and speech output, UI Automation.
`vitest run`: 92/92 tests pass.

## Scores (weights from gan-harness/eval-rubric.md)

| Criterion | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Functionality | 5 / 10 | 0.35 | 1.75 |
| Pet craft | 7 / 10 | 0.25 | 1.75 |
| Design quality | 6.5 / 10 | 0.25 | 1.63 |
| Copy & i18n | 7 / 10 | 0.15 | 1.05 |
| **TOTAL** | | | **6.2 / 10** |

## Verdict: FAIL (threshold 7.0)

Why not a pass: the headline "mischief" feature (sign parade) is visibly broken after the first second. The board, which
is the main surface, hides the task list below the fold on the target screen sizes. One of the three per-task menus is
unusable on the last row. Two sprint-contract items (mood drop on YouTube, mischief stunts) cannot be demonstrated with
the demo controls. Every page logs a console error, which fails contract item 8 outright.

What is genuinely good, so the next iteration does not regress it: the 14-species renderer (gallery, accessories sit on
the heads correctly, held/sleep/focus/celebrate poses), Settings and Diary (cohesive, tidy, a real dark mode, natural
Vietnamese, persistence across reload), the calendar time-block flow, bubble placement and timer, split sheet, undo.

---

## Critical issues (must fix)

1. **Overlay, parade stunt: the sign grows into a giant slab and its text leaves the screen.**
   Steps: `/overlay.html?demo`, click "Parade" (or load with `?antic=parade`), watch 4 s.
   Expected: a small placard with "DO THIS NOW / <next task>" trailing the pet. Actual: `.sign` height measured
   73 px at 0.7 s, 241 px at 1.4 s, 577 px at 2.8 s, 921 px at 4.2 s (same at 1920x1080). The text scrolls off the top of
   the viewport and a blank cream rectangle covers about half the screen.
   Cause: `.sign` (overlay.css line 141) sets `bottom: 18px` while App.tsx sets `style.top = y - offsetHeight - 26`
   every frame. With both `top` and `bottom` set the box stretches, `offsetHeight` grows, and the next frame's `top`
   moves up another 8 px. Fix: drop `bottom: 18px` from `.sign` (use `bottom: auto`), and add a Vitest/Playwright check that
   the sign height stays constant over 3 s.
   Screenshots: `gan-harness/screenshots/16-parade-1.png`, `16-parade-2.png`, `16-parade-3.png`, `16b-parade-1366.png`, `16b-parade-1920.png`.

2. **Overlay, board: the task list is buried below the fold at the sizes this app targets.**
   Steps: open the board at 1366x768 (the typical laptop), then at 1024x700, then at 10:00 with meetings.
   Expected: the tasks (the reason the board exists) are visible first. Actual: the board is 581 px tall at 1366x768. The
   stats strip (about 70 px), the add form (about 85 px) and the always-present calendar card (about 100 px, about 200 px
   with time-block suggestions) consume the top 330-450 px. At 1366x768 you see one overdue row and half of one Today row.
   At 1024x700 you see one overdue row and only the "TODAY" header. At 10:00 with suggestions at 1366x768 the visible
   list is a single half-cut row. Fix: put the task lists directly under the add field. Make the stats strip a single
   compact line (or move it into the header). Collapse the calendar card to a one-line summary that expands on click.
   Add a sticky "Today" header so scrolling keeps context.
   Screenshots: `02-board-1366.png`, `02-board-1024.png`, `37-calendar-10am-768.png`.

3. **Overlay, board: the per-task "Move" menu is clipped and unusable on the last row.**
   Steps: open the board, scroll to the bottom, hover the last task, click `→`.
   Expected: a menu with Today / Tomorrow / "Off the plan". Actual: the menu (160x102 px, bottom at y=617) is clipped by the
   scroll container (bottom at y=547) and the footer. On the last row only a sliver of "Today" shows and scrolling does
   not reveal more. On the middle row the third option, "Off the plan (no date)", is cut off. Fix: render the menu in a
   portal, or flip it upward when there is no room, or use `position: fixed` computed from the button rect.
   Screenshots: `06-move-menu.png`, `06b-move-menu-last.png`, `06c-move-menu-last-scrolled.png`.

4. **Demo controls, YouTube then "Run rules": nothing happens (contract item 5 not demonstrable).**
   Steps: `/overlay.html?demo`, click "YouTube", click "Run rules", open the board, hover the mood line.
   Expected (per the brief and contract): the score drops and the reasons list shows "distracted by youtube.com", possibly with a
   bubble. Actual: score stays 55, reasons only show the overdue and postponed items, no bubble. I verified the logic
   itself works: with the clock faked to 11:00 and 125 s on YouTube it showed a score of 4 (grumpy) and the bubble
   "youtube.com AGAIN?! Close it ...". Two hidden conditions block the demo: `distractedMinutes >= 2` (real elapsed time) and
   the work-hours gate in `mood.ts` (08-18 on a workday, otherwise the score is floored at 55). At 18:44 on a Wednesday
   it can never fire. Fix: have the YouTube demo button back-date `distractionSince` by 3 minutes and force `inWork`
   (or show a one-line toast "pretending you have been here 3 min"), so one click plus "Run rules" visibly works at any
   hour and on weekends.
   Screenshots: `14-youtube-rules.png`, `14b-youtube-reasons.png`, `15b-youtube-clocked-reasons.png`.

5. **Demo controls, Grumble / Table flip / Parade: stunts do not show their real behavior (contract item 6).**
   Steps: click "Grumble", "Table flip", "Parade" on a fresh load.
   Actual: "Grumble" only stops the pet walking for 6 s. There is no bubble, no grumpy face, no motion, so it looks like a
   no-op (frame diffs only show idle blinking). "Table flip" shows "(╯°□°)╯︵ ┻━┻" for about 2 s, then `runTick` clears it
   (`antic = null` because no distraction is active) while the pet is still large. No bubble, so the "Spare me 15'" and
   "Focus 25'" buttons the contract mentions never appear. Parade has no bubble either. `demoAntic` only sets `antic`;
   it never calls `say()` with `lines.grumble/block/parade` and `spareAction()`. Fix: make `demoAntic` do what the real rule
   does: set the mood, call `say` with the actions, and keep the block alive until "Spare me", a click, or "Work app".
   Screenshots: `33-grumble-1.png`, `32-antic-grumble.png`, `32-antic-block.png`, `17-flip-1.png`.

6. **All pages: console error on every load (contract item 8 fails).**
   Steps: open any of the five pages in a fresh browser profile and read the console.
   Actual: `[error] Failed to load resource: the server responded with a status of 404` on overlay, settings, diary,
   gallery and index. It is `/favicon.ico`; there is no `public/` folder and no `<link rel="icon">`. Fix: add a
   favicon (the app icon already exists in the gallery) and `<link rel="icon">` to all five HTML files.

---

## Major issues (should fix)

7. **Board, add task: Tomorrow and No-date adds give no feedback, and priority sticks.**
   Steps: choose "Tomorrow", type "Tomorrow task", press Enter. Expected: some confirmation (toast, a "Tomorrow (1)" line,
   or a bubble). Actual: the input clears and nothing on screen changes, so it looks like the task vanished. Also,
   after adding with P1, every later add silently keeps P1 (long title, Vietnamese title and "Rapid add" all got P1).
   Reset priority and due after a successful add, or show the chosen priority next to the Add button.
   Screenshot: `03-after-adds.png`, `03b-after-adds-scrolled.png`.

8. **Board header and stats wrap awkwardly.**
   "🥳 celebrating" (EN) and "🎯 guarding your focus" wrap, putting the emoji alone on line 1 and growing the header;
   Vietnamese "🙂 bình thường" wraps to 2 lines; the VI stat label "⭐ Thiếu niên" wraps so "320 XP" no longer lines up with
   the other three cards. Fix: `white-space: nowrap; text-overflow: ellipsis` on `.mood-line > span:first-child`, give the
   score bar `flex: 1; min-width: 0`, and give `.stat` labels a fixed one-line height with ellipsis.
   Screenshots: `30b-all-done.png`, `12b-focus-board.png`, `24b-overlay-vi-board.png`.

9. **Task rows waste width and have no title clamp.**
   The hidden action buttons reserve 107 px (opacity 0, width 107) even when not hovered, so titles wrap at about 190 px
   inside a 340 px row. A 575-character title makes a row about 330 px tall and pushes everything else off the board.
   Fix: overlay the actions on hover/focus (absolutely positioned over the right edge with a gradient), and clamp titles to 2
   lines with `-webkit-line-clamp` plus a `title` tooltip.
   Screenshot: `03b-after-adds-scrolled.png`.

10. **"Hide 1h" leaves the board open and the pet gone, with no way back in the demo.**
    Steps: open board, click "Hide 1h". Actual: pet becomes invisible (`.pet.hidden`), the board stays open anchored to nothing, and
    nothing in the overlay or demo panel brings the pet back (the tray is Windows-only). Fix: close the board on Hide, show
    a bubble "Hiding for 1 h" with an Undo button, and add "Show pet" to the demo panel.
    Screenshot: `31-hidden.png`.

11. **Focus badge collides with other UI.**
    The 🍅 countdown sits above the head, exactly where the bubble tail lands: the "1 minutes on ... I'll sit quietly" bubble
    overlaps and half-hides it, and the open board covers it. At the end of a focus session the badge shows 00:00 for several seconds
    before the "time's up" bubble arrives. Offset the bubble above the badge height, and fire the end-of-focus bubble at 0 s.
    Screenshots: `12-focus.png`, `12b-focus-board.png`, `12d-focus-end.png`.

12. **Copy: plural and placeholder grammar.**
    "1 minutes on ..." / "1 minutes up!" (focus), "1 reminders · 0 tapped ..." (Diary summary), "1 overdue task(s)",
    "1 task(s) keep getting postponed" (mood reasons), "2 meeting(s)" (calendar card), and "+1' more" on the focus-end
    button. Add a tiny `plural(n, one, other)` helper in `l10n.ts` and use it in `lines.ts`, `diary.ts`, `Board.tsx`, `mood.ts`.
    Screenshots: `04-mood-reasons-hover.png`, `27-diary-populated.png`, `12-focus.png`.

13. **Vietnamese mode still shows English demo content.**
    With language = Tiếng Việt, the board lists "Reply to the boss's email", "Write the weekly report", "Call client ABC",
    "Team sync", "Client meeting" in English (the sample data only localizes when `navigator.language` is `vi`). The demo
    panel's species `<select>` also shows English names. Pick sample data from the app language (`getLang()`), not from
    the browser locale.
    Screenshot: `24b-overlay-vi-board.png`.

14. **Contrast below WCAG AA on small text in the board.**
    Measured on the light theme: muted text `rgb(138,119,102)` on cream is 4.28:1 at 11.5-12.5 px (stat labels, calendar header,
    footer, section headings 4.06:1); chips such as "3 days ago" 3.67:1 at 11 px; the unselected P4 button 2.76:1.
    Darken `--muted` to about `#6f5e4f`, and darken the chip and P4 colors until each reaches 4.5:1.

15. **Board does not re-anchor when the screen size changes.**
    With the board open at 1366x768, resize to 1024x700: the board stays at y=8..589 while the pet drops to y=511, so
    the board covers the pet's head. Resize up to 1920x1080: the pet moves to y=891 but the board stays at the top, 300 px
    away. Recompute board position from `stageRef` on `resize` (and on display-scale change).
    Screenshots: `36-resize-with-board.png`, `36b-resize-up.png`.

16. **Inconsistent icon language in the board.**
    Task row actions mix a black text glyph `▶`, a text arrow `→`, color emoji `✂️` and a red `🗑`; header tools are
    color emoji (🎀 📜 ⚙️), while Settings and Diary use a proper outline SVG icon set (`src/ui/icons.tsx` already exists).
    On Windows 11 the emoji render in Segoe UI Emoji and look different again. Use the SVG set across the board header,
    task actions and footer.
    Screenshot: `05-task-hover.png`.

---

## Minor issues (nice to fix)

17. Settings (demo) shows Dragon "0/7" and Unicorn "0/50", while the overlay wardrobe shows "(4/7)" and "(31/50)" for
    the same user. The two windows read different life data in the demo. `22-settings-light-00-Pet.png` vs `11-wardrobe.png`.
18. Wardrobe unlock strings read as fragments: "A ×3 combo", "A 7-day streak", "Grow up to Grown-up". Use "Unlock: finish 3 tasks within 30 min".
    The header shows the name twice for the default pet: "Mochi 🍡 Mochi".
19. The pet `div[role=button]` has no `tabindex`, so keyboard-only users cannot open the board from the overlay (the
    hotkey and tray cover Windows, but the browser demo has no path).
20. Undo does not cancel a running celebration: after Undo the pet keeps dancing with the "celebrating" mood for about 6 s while the
    stats are already reverted (`10-split-sheet.png`).
21. "Ask Claude" canned steps ("Open the email and reread the question") do not match the task being split ("Write the weekly report").
    Return generic steps, or steps derived from the title. `10d-split-claude.png`.
22. Stats strip "Streak 4 · 4" has no visible explanation; the two numbers (pet goal streak vs Todoist streak) are only in a tooltip.
23. Hitting 3/3 on the day leaves the streak at "4 · 4" with no change or hint ("goal reached, streak counts at day end").
24. Demo panel can sit on top of the board (the board opens under it when the pet is at the far left), blocking
    the mood-line hover in my fake-clock run. Move the panel out of the board's possible area (bottom-left under the taskbar
    clock, or draggable).
25. Pet craft: several species (Mochi, Cat, Shiba, Fox, Hamster, Panda, Capybara) share the same bean body and differ
    mainly by ears, tail and color. Capybara reads as a brown loaf. Grumpy recolors every species red-pink, which hides identity
    (Cat and Panda look the same pink-red). Gait differences are subtle in 150 px stills; the bunny hop and axolotl float
    are the only ones that clearly read. `gan-harness/screenshots/20b-gallery-moods.png`, `28-species-overlay-frames.png`.
26. `overlay.html` is `lang="en"` statically; it is not updated when the app language is Vietnamese (screen readers, hyphenation).
27. Settings/Diary at 600x760 give the sidebar 180 px of 600; the content column is 420 px, tight for the Todoist and Distractions rows.

---

## What improved since last iteration
First iteration; nothing to compare. Baseline is recorded above.

## What regressed since last iteration
n/a

## Specific suggestions for next iteration (in order)
1. Fix the `.sign` CSS (issue 1) and add a regression test that samples `.sign` height over time.
2. Redesign the board's vertical budget: tasks first, one-line stats, collapsed calendar card (issue 2). Re-check at
   1366x768 and 1024x700 with meetings and suggestions present, and target 4+ visible task rows.
3. Portal the Move menu (issue 3) and the delete confirmation so no popover can be clipped by the scroll area.
4. Make every demo control self-explanatory in one click, at any hour: YouTube plus Run rules, Grumble, Table flip, Parade
   should each produce the bubble and actions the real rule would (issues 4 and 5). Add the favicon (issue 6).
5. Header and stats overflow rules, title clamping, add-task feedback (issues 7-9).
6. Pluralisation helper and localized sample data (issues 12-13), then the contrast pass (issue 14).

## Screenshots (all under gan-harness/screenshots/)
- `01-overlay-1366.png`: first impression; the pet, bubble and tail are good, the fake desktop is believable.
- `02-board-1366.png`, `02-board-1920.png`, `02-board-1024.png`: board at three sizes; task list cut off at 1366 and 1024.
- `03-after-adds.png`, `03b-after-adds-scrolled.png`: add flows, long and Vietnamese titles, sticky P1.
- `04-mood-reasons-hover.png`, `05-task-hover.png`, `06*-move-menu*.png`, `07`-style delete confirm: hover reasons, row actions, clipped menu.
- `08-complete-*.png`: celebration, food, confetti, Undo bubble.  `09*`: undo paths.  `10*`: split sheet and Ask Claude.
- `11*`: wardrobe and accessories.  `12*`: focus mode and its end.  `14*`, `15*`: YouTube (after hours vs. faked 11:00).
- `16*`: parade (the runaway sign).  `17*`, `32*`, `33*`: table flip and grumble.  `19*`: drag, fall, off-screen drag.
- `20*`: gallery default, moods matrix, fox.  `21*`-`23*`: Settings (light, dark, Vietnamese).  `24*`: overlay in Vietnamese.
- `25*`, `27*`: Diary empty and populated, light and dark.  `26*`: sleeping.  `28`: species walking frames.
- `30*`: all done / combo.  `31`: hidden.  `34*`: bubble at screen edges (placement correct).  `35`: focus ring.
- `36*`: resize with the board open.  `37*`: calendar suggestions at 10:00.
