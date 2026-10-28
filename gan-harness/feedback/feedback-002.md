# Evaluation — Iteration 002 (TodoPet for Windows)

## Evaluation Mode

**Achieved:** `playwright` (scripted). The Playwright MCP tools were not callable, so I drove the live dev server at
http://localhost:1420 with `playwright-core` 1.62.1 and system Chrome 156 (headless) from Bash scripts, a fresh browser context
(empty localStorage) per run. Real clicks, drags, keyboard, viewport resizing, `prefers-color-scheme` emulation, console and
network capture, and Playwright's fake clock (`page.clock`) for a 10:00 / 09:00 / 15:00 Wednesday and a Saturday.
Viewports: 1366x768, 1920x1080, 1024x700, 900x600 (overlay) and 760x780-900 (Settings/Diary). Light and dark, English and Vietnamese
(the language was switched through Settings, with a US-English browser locale, which is the case iteration 1 failed).
Contrast was measured on rendered pixels: I made all text transparent, screenshotted, decoded the PNG, took the dominant colour
under every text run as the background and computed WCAG ratios (about 300 runs per view).
Not testable in a browser (as before): Windows click-through, tray, sound/speech, UI Automation.
`vitest run`: 115/115 pass (was 92). `tsc --noEmit`: clean. `vite build`: succeeds.
Side effect to disclose: running `vite build` rewrote the git-ignored `dist/` folder. No tracked file was touched.

## Scores (weights from gan-harness/eval-rubric.md)

| Criterion | Iter 1 | Iter 2 | Weight | Weighted (iter 2) |
|-----------|-------:|-------:|-------:|------------------:|
| Functionality | 5 | **7** | 0.35 | 2.45 |
| Pet craft | 7 | **7** | 0.25 | 1.75 |
| Design quality | 6.5 | **7.5** | 0.25 | 1.88 |
| Copy & i18n | 7 | **7.5** | 0.15 | 1.13 |
| **TOTAL** | 6.2 | | | **7.2 / 10** |

## Verdict: PASS (threshold 7.0), narrowly

This is a real jump and every iteration-1 critical issue is genuinely fixed; I could not reproduce any of the six. It is a narrow
pass, not a comfortable one. Three functional problems I found are the kind a user hits in the first week: typing the next task while
the previous add is in flight silently erases it, a double-click on a check circle completes two different tasks, and the Table
flip played with the board open is buried under the board with its "Spare me" button hidden. Pet craft did not move at all
(issue 25 of iteration 1 was not on the generator's list and is unchanged).

---

## Verification of the generator's claims (every one re-tested, none trusted)

| # | Claim | Result |
|---|-------|--------|
| 1 | Parade sign stays constant size | FIXED. `.sign` measured 213x57 at every sample over 12 s at 1366x768; the pet walks to the left edge, the sign leaves with it, the stunt ends, the bubble with "Spare me 15'" stays. `?antic=parade` shows it by 2.5 s. |
| 2 | Tasks first, stats in header, calendar collapsed | FIXED. At 1366x768 the board opens beside the pet (467 px tall with the demo data) with overdue + both Today rows + the calendar line all visible; with 11 tasks it scrolls with sticky section headings. At 10:00 with meetings and suggestions the three rows stay visible and the calendar is one line until clicked. Same at 1024x700. |
| 3 | Move menu / delete confirm not clipped | FIXED. Tested 5 rows x 2 popovers x 3 viewports x EN/VI (30 cases): every popover was fully inside the stage, did not cover its own button, and flipped up when low on room. 33/33 menu opens succeeded once the scroll had settled (a click made mid-scroll closes the popover by design). |
| 4 | YouTube + Run rules | FIXED, with a caveat (issue 5 below). Reasons list shows "-21 distracted by youtube.com"; the bubble "youtube.com AGAIN?! Close it ..." with Focus and "Just a quick break" buttons appears. Works at 09:00, 10:00, 15:00, Saturday and real 19:30. |
| 5 | Table flip / Parade / Grumble | FIXED. Flip: pet 330 px in the middle, kaomoji, bubble with Focus 25' and Spare me 15'; it stays 37 s+; ends on Spare me, on clicking the pet and on Work app (within 2 s). Grumble: distinct grey annoyed face, arms crossed, bubble. Parade: bubble plus Spare me. |
| 6 | Favicon, no console errors | FIXED. 9 URLs (overlay x4, settings, diary, gallery, index, root): zero console messages, zero 4xx. |
| 7 | Add feedback, priority reset | FIXED. Note line "Added “Tomorrow task” for tomorrow"; due and priority reset to Today/P4 after every add. |
| 8 | Header/stat wrapping | FIXED. Header height 99 px and stats 26 px in idle, focus ("guarding your focus") and celebrating, in EN and VI. |
| 9 | Title clamp, hover actions | FIXED. 620-char title clamps to 2 lines with ellipsis; actions overlay the row on hover instead of reserving width. (Rough edge: the overlaid icons hard-clip the first title line, see minor 13.) |
| 10 | Hide 1h | FIXED. Board closes, urgent bubble "Hiding until 20:39 / Show me now", "Show pet" in the demo panel; both bring the pet back. |
| 11 | Focus badge collisions | FIXED. Bubble now sits 16 px above the 🍅 badge; the end-of-focus bubble arrives with the badge at 00:00. |
| 12 | Plurals | FIXED. "1 minute on ...", "+1' more", "1 reminder", "1 overdue task", "1 task keeps getting postponed", "1 time block", "1 calendar". |
| 13 | Vietnamese sample data | FIXED. With US browser locale and Settings language = Tiếng Việt: tasks, meetings, bubble, species `<select>` (Mèo, Thỏ, Cáo, Gấu trúc ...) and `<html lang>` are Vietnamese. (The fake desktop window prop is still English, see minor 12.) |
| 14 | Contrast >= 4.5:1 in board and Settings | BOARD: FIXED. 0 failures in light and dark, EN and VI (board, expanded calendar, reasons tooltip, wardrobe, bubbles, sign). SETTINGS: NOT FIXED, see major 4. |
| 15 | Board re-anchors on resize | FIXED. 1366 -> 1024x700 -> 1920x1080 -> 900x600 with the board open: the board follows the pet each time. Drag to the far left with the board open: board follows after landing. |
| 16 | Icon language | FIXED. Header tools, row actions and footer use the SVG set; only the chips and the fake desktop use emoji. |
| 17 | Settings vs wardrobe life data | PARTLY. Same numbers when the overlay ran first (Dragon 4/7, Unicorn 31/50). In a fresh profile Settings still shows "12 of 14 unlocked" next to Dragon 0/7 and Unicorn 0/50. |
| 18 | Wardrobe wording, duplicate name | FIXED. "Finish 3 tasks, each within 30 minutes of the last", "Hit your daily goal 7 days in a row"; header shows "Mochi / 🍡 · Teen". |
| 19 | Keyboard path to the board | FIXED. First Tab lands on the pet; Enter opens the board with focus inside; Tab walks mood line, tools, add form, rows, actions; Escape closes and returns focus to the pet (focus ring visible). |
| 24 | Demo panel vs board | FIXED. `placeBoard` avoids the panel; no overlap in any run. |
| 26 | `<html lang>` follows app language | FIXED (`vi` in Vietnamese). |
| extra | Undo cancels the celebration | FIXED. After Undo the mood label is no longer "celebrating", stats are reverted, the task is back. |
| extra | Settings -> Calendar write-only | FIXED and good. Pasted 3 links (1 invalid ftp://): invalid one is called out, Save, textarea clears, only "calendar.google.com · p01-caldav.icloud.com" is shown, no token fragment anywhere in the DOM or localStorage. |
| extra | Ask Claude steps | FIXED (steps now mention the task title), template, split save and subtasks appear in the list. |

---

## Critical issues (must fix)

None. I could not find a broken contract item.

## Major issues (should fix)

1. **Board, add task: text typed while the previous add is in flight is erased.**
   Steps: open board, type "A", Enter, immediately type "B (next task)". The demo add takes about 400 ms; real Todoist is usually slower.
   Expected: "B" stays in the field. Actual: when the first add resolves `setText("")` runs and wipes whatever was typed meanwhile
   (reproduced: field value `""`, task B never added; my "Rapid add" batch lost 3 of 5 titles this way before I slowed the script down).
   A fast typist entering a list of tasks loses characters or whole titles with no message. Fix: clear the field synchronously on
   submit (restore it plus an error note if the add fails), or keep the field enabled but only clear it if `text` still equals the
   submitted value.

2. **Board, rapid clicking: double-clicking a check circle completes two different tasks.**
   Steps: three Today tasks (Alpha, Beta, Gamma), double-click Alpha's check. Actual: Alpha and Gamma both moved to Done
   (stats 2/3, XP +25 twice) because the list reflows under the cursor after the first click and the second click lands on the next row.
   Fix: ignore a second activation within about 400 ms, or keep the completed row in place (fading, with strike-through) until the
   celebration finishes, and rely on the Undo bubble for mistakes.

3. **Table flip / Parade with the board open: the stunt is buried under the board and "Spare me" is unreachable.**
   Steps: click the pet (board opens), click "Table flip" in the demo panel (the panel stays clickable while the board is open).
   Actual: the 330 px pet jumps to the middle exactly where the board is, the board stays where it was (it only re-anchors for resize,
   badge and scale changes), most of the pet and kaomoji are covered, and the bubble is suppressed because `showBubble` requires
   no board. Same for any real antic that starts while the board is open. Fix: close the board when an antic starts (or re-run
   `computePlacement` and let the bubble show beside the board). Screenshot: `iter2-29-flip-with-board-open.png`.

4. **Settings contrast is below AA, contrary to the claim.**
   Measured on rendered pixels, light theme: status pills "Connected", "1 calendar", "Saved" and the Focus rest block ("☕ 5 ′") are
   green `rgb(79,143,69)` on `rgb(225,240,217)` = 3.30:1 at 12.5-14 px; the Focus work block and "Important only" are `rgb(184,77,27)`
   on `rgb(253,227,210)` = 4.15:1. Dark theme is clean apart from disabled buttons. Fix: darken the success ink to about `#2f6b2a`
   and the accent ink on the tint to about `#a24216`. (Disabled primary buttons are 1.5:1 in both themes; exempt by WCAG, but they look
   washed out, give them a visible outline.)

5. **Demo opens in a bad mood and the YouTube demo shows no face change for most of the day.**
   The demo is now "always a work day", so planning-deadline and overdue penalties apply at every hour. Real clock 19:27: first screen
   is a red steaming "grumpy 12" pet. 09:00 starts "chill 50", 10:00 "annoyed 32", from about 11:40 on "grumpy 12". After YouTube + Run rules
   at 15:00 the label stays "grumpy" (12 -> 0), so the visible effect is only the number, the reason line and the bubble. For a pet whose
   brand is warm, the first impression of the demo is a furious one. Fix: seed the demo so the day starts at about 60 (plan already
   complete or no overdue item), so one YouTube click visibly moves the pet from "chill" to "grumpy".

6. **Distraction reminders are swallowed by a leftover bubble.**
   Steps: load `/overlay.html?demo`, within the first ~15 s click YouTube then Run rules. Actual: score drops but no bubble, because
   the greeting bubble is still up and `tick` returns early when any bubble exists. After it fades the same clicks work. Also, 25 s
   into a Table flip the block bubble fades and is replaced by the ordinary "youtube.com AGAIN?!" bubble, which has no "Spare me", so
   the only way out of a flip that is still on screen is clicking the pet or Work app. Fix: let `demoDistract` dismiss non-urgent
   bubbles, and keep "Spare me" on the replacement bubble while `antic` is active.

## Minor issues (nice to fix)

7. **Pet craft is unchanged (iteration 1 issue 25).** Mochi, Cat, Shiba, Fox, Hamster, Capybara still share one bean body; grumpy
   still tints Panda's white fur pink (`iter2-30-species-montage.png`: Panda reads as a pink bear, Penguin and Dragon keep their identity).
   Give grumpy a red flush and brow instead of a whole-body recolour. Gait differences remain subtle at 150 px.
8. **Move to Tomorrow / Off the plan gives no confirmation.** The row just disappears from Today (the add flow got a note, this did not).
   Reuse the add-note line: "Moved to tomorrow  Undo".
9. **Dark mode demo panel is inconsistent.** `.demo-panel` keeps `rgba(255,255,255,.92)` while its text and buttons use dark-theme
   tokens: the "Demo controls" heading is 2.8:1 and the collapse "–" is 1.14:1 (effectively invisible). Demo chrome only, but it is the
   first thing an evaluator sees in dark mode.
10. **Settings in a fresh profile contradicts itself** ("12 of 14 unlocked" with Dragon 0/7, Unicorn 0/50) until the overlay has run once.
    Seed the demo life in the shared backend, not only when the overlay loads.
11. **Calendar save errors would be worded about Anthropic.** `CalendarLinks` calls `secretErrorText(err, "anthropic")`
    (code read, not reachable in the demo): an "unauthorized" error would say "Anthropic didn't accept this key" under Calendar.
12. **Fake desktop prop stays English in Vietnamese mode** ("Q4 planning notes ..."). Prop only, but it is on screen in every VI screenshot.
13. **Hovered rows hard-clip long titles.** The overlaid action icons cut the first line mid-word ("operating re|") with no fade.
    Add a left-edge gradient (`linear-gradient(90deg, transparent, var(--surface) 24px)`) behind `.t-actions`.
14. **Calendar summary line truncates its most useful tail** ("... · 2 time bl…"). Drop "8h15 free" first, or put the count in a badge.
15. **Settings calendar links are not persisted across reload in the demo** (secrets live in memory); acceptable for secrets, but the
    "values persist across reload" line of the spec reads differently, so state it in the field help in demo mode.
16. **Stat label "55% no" (Vietnamese for "full")** reads as English "no" to a bilingual user; "55% no bụng" or "no 55%" is clearer.

---

## What improved since last iteration

- **Parade**: from a 921 px runaway slab to a constant 213x57 placard with the next task, plus bubble and Spare me. The headline stunt now works.
- **Board layout**: the redesign is the best change in the project. A Windows 11 style flyout beside the pet, 150 px header with
  avatar, mood, score and one-line stats, add form, then overdue/today with sticky headings, one-line calendar. Four to five rows are
  visible at 1366x768 and 1024x700 with realistic data; 11 rows scroll cleanly.
- **Popovers**: portal-based, flip aware, keyboard-correct (Escape closes only the popover and returns focus; Tab in a menu closes it;
  the confirm traps focus), no clipping in any of 30 cases.
- **Demo controls** now each demonstrate their behaviour in one click at any hour, with the bubbles and Spare me the real rules produce.
- **Hide 1h** has an urgent bubble and a way back; **Undo** stops the dance; **resize** re-anchors the board.
- **Polish**: SVG icon set everywhere, title clamp, add feedback, no sticky priority, favicon and a clean console on all pages,
  localized sample data, plural-correct copy, keyboard access to the pet, board contrast at AA in both themes.
- **Settings Calendar** is now a proper write-only secret field with host list, invalid-link warnings and a how-to; Ask Claude steps are
  derived from the task.
- Tests grew from 92 to 115 and still pass.

## What regressed since last iteration

- **Demo first impression**: the "always a work day" change makes the demo start annoyed/grumpy for most of the day (major 5).
- **New collision**: antics versus an open board (major 3) did not exist when the board covered the whole screen edge.
- No regression in the species renderer, gallery, Settings, Diary, split sheet, wardrobe, calendar time-blocks, bubble placement, focus
  mode, drag/fall (held y=210, landed on the taskbar in 0.6 s) or undo; all behave as in iteration 1.

## Specific suggestions for next iteration (in order)

1. Fix the add-task race (clear on submit, restore on failure) and guard the check button against double activation (majors 1-2).
2. Close or re-anchor the board when an antic starts; keep "Spare me" on the replacement bubble (majors 3 and 6).
3. Re-seed the demo day so it opens "chill" and one YouTube click visibly changes the face (major 5).
4. Darken the Settings success and accent inks on tinted pills to 4.5:1; fix the dark demo panel (major 4, minor 9).
5. Spend the next real effort on pet craft: grumpy as a flush plus brows instead of a recolour, and one silhouette change per
   bean-body species (ears alone are not enough at 96 px). This is the only criterion that did not move and it is the product's reason to exist.
6. Add undo/feedback to Move, and the hover-fade for clipped titles (minors 8 and 13).

## Screenshots (all under gan-harness/screenshots/, prefix `iter2-`)

- `01-overlay-*`, `02-board-*`: first load and board at 1366, 1920, 1024. `03-mood-reasons`: reasons tooltip (12 grumpy at 19:27).
- `04-*`, `05-youtube-bubble`: YouTube + Run rules at real and 10:00 clocks. `06-flip-*`, `07-after-*`, `08-parade-end`,
  `09-parade-mid`, `09-grumble-*`, `16-antic-*`: stunts.
- `10-*`, `11-board-many-*`, `12-move-*`, `12-delete-*`: 11 tasks, long/VI/script titles, every popover (1366 EN light, 1024 VI dark).
- `13-cal-*`: collapsed/expanded calendar and Set time at 10:00. `14-hide-*`: hide bubble. `15-*`: finish task and Undo.
- `17-dark-*`: dark demo panel (white panel, invisible "–"). `18-focus-*`: focus badge, bubble, board. `19-diary-*`: populated diary.
- `20-settings-*`: all nine sections, light/dark/VI. `21-cal-*`: write-only calendar. `22-gallery`: 14 species (unchanged).
- `23-resize-*`, `23-drag-left`, `23-open-left`: board re-anchoring. `24-keyboard-board`. `25-board-*`: VI header states.
- `26-*`: split sheet, Ask Claude, wardrobe. `27-settings-species`. `28-*`: empty and all-done states.
- `29-flip-with-board-open`: the buried stunt (major 3). `30-species-*`: species in the grumpy mood. `31-*`: hovered long row, focus ring.
