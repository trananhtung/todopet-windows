# Evaluation — v0.4 "Indispensable", iteration 002 (TodoPet for Windows)

## Evaluation Mode

**Achieved:** `playwright` (scripted). The Playwright MCP tools were not used. I drove the live Vite server at
http://localhost:1420 (not started or stopped by me) with `playwright-core` and system Chrome (headless), a fresh browser
context (empty localStorage) per run. Real clicks, double-clicks, keyboard (Tab, Enter, Escape, arrows, Home/End), viewport
resizing, `colorScheme` light/dark, `locale` en-US / vi-VN, console + network capture, and Playwright's fake clock
(`page.clock`: install at 10:00, 12:50, 16:30; `fastForward` in 4-minute steps with mouse movement so the pet does not
read the PC as idle; `setSystemTime` to 12:01 and 13:01). Part of the demo flows also ran on the real clock (about 21:10
on 2026-10-29), which is what a person opening the demo today sees.
Viewports: 1366x768 and 1024x700 (overlay), 1024x700 (Settings). Languages: EN and VI. Themes: light and dark.
Console: **zero errors or warnings in every run** (about 70 page loads, overlay and settings).
Not testable in a browser: real foreground-app/URL capture, private windows, the "never a call" rule, Windows idle
detection, Credential Manager, real Todoist durations. I did not run `vitest` or `tsc`: this covers the live demo only.
Not re-verified this round: the timed-task "It's time" bubble (the demo calendar always puts a meeting on the next whole hour,
so the pet is "in a meeting" when the task falls due). The after-meeting and after-lunch plans were re-run with
`setSystemTime` (12:01 and 13:01) in EN and in VI dark: all four fire "As planned" / "Như đã định", and **Later** closes
the bubble. No source file was touched.

## Scores (weights from gan-harness/eval-rubric.md)

| Criterion | Score | Weight | Weighted |
|-----------|------:|-------:|---------:|
| Functionality | **7.0** / 10 | 0.35 | 2.45 |
| Pet craft | **7.5** / 10 | 0.25 | 1.88 |
| Design quality | **7.5** / 10 | 0.25 | 1.88 |
| Copy & i18n | **7.5** / 10 | 0.15 | 1.13 |
| **TOTAL** | | | **7.3 / 10** |

(Iteration 1 was 6.5 / 7.0 / 7.0 / 7.5 = 6.9.)

## Verdict: PASS (threshold 7.0), by 0.3

The generator fixed what I asked for, and fixed it properly: the urgent bubble now shows as a banner and a stale one is
dropped unseen, the dead plan fires, "Pick tasks to move" is a real working view, the Back to work double-click and the
focus replacement are guarded, the timeline is labelled, ticked, keyboard-reachable and passes contrast, and the Wrap up
sheet is a compact radio-group list. Every iteration-1 numbered issue is fixed or mostly fixed (table below). It passes with
little room, because Functionality sits at the bottom of the 7 to 8 band:

- the **next-morning greeting that is supposed to name tomorrow's frog and note never appears after a day on which nothing
  got done** (the "ate a snack" message takes its place), which is exactly the day the ritual helps most (issue 1);
- the overbooked "Move some?" bubble is still not an urgent bubble, so spec §6 (banner in the open board) does not hold for it;
- Friday copy still says "tomorrow" in three places while the rest of the sheet says "Monday";
- at 1024x700 about half the placements still leave the Wrap up list under the sticky button bar.

## Iteration-1 issues: status

| # | Iteration-1 issue | Status | What I did and saw |
|---|---|---|---|
| 1 | Urgent "Meeting soon" bubble swallowed while the board is open, then shown stale | **Fixed** | Board open at 10:00, Meeting soon: banner under the header with text, "Open “Call client ABC”" and OK (`en-a2-meeting-banner.png`). Moving the clock 6 min: banner gone, and Esc afterwards shows nothing (no late "in 4 min"). Timed-task "In 10 min" bubble shows as a banner too (`en-u1-soon-banner.png`) and stays valid after the board closes. Caveat: the overbooked bubble does not banner (new issue 2). |
| 2 | "Start when I open ⟨app⟩" accepts names that never match | **Fixed** | `fig`, `Figma.exe` and `FIGMA ` all fire "As planned" within 25 s of Figma coming forward. The dialog shows "Matches Figma, which you used lately ✓", "I haven't seen an app called that yet; I'll watch for it 👀" for `zzzzz`, and keeps Set disabled under 3 letters. Both EN and VI. |
| 3 | Overbooked flow cannot be acted on | **Fixed** | "Pick tasks to move" opens the board with estimate chips on every Today row (`4h`, `3h`, `4h`), a "→ Tomorrow" on each, a red banner "~3h45 over, Move a few to tomorrow to make room" and the same words as a chip in the strip header. Moving a task updates the strip live; moving the 4h one gives "Nice, today fits now ✓" and removes the banner. The queued warning bubble is dropped when the day fits before anyone reads it. Double-clicking "→ Tomorrow" moves one task only. (`en-o2-lighten.png`, `vi-dark-1024-o2-lighten.png`.) |
| 4 | Double-click on Back to work opens Wrap up | **Fixed** | 16:30 → Wrap up → Done for today → board → double-click "Back to work": pet wakes, board stays on the list, no sheet. |
| 5 | Try 2 minutes silently replaces a running focus session | **Fixed** | A confirm popover: "You just started a focus session. Switch to 2 minutes?" and after 12 minutes "You're 12 minutes into a focus session. Switch to 2 minutes?" with Keep going / Switch. Esc closes only the popover. Keep going leaves the 25:00 session alone. (`en-s2-confirm.png`.) |
| 6 | Plan chip contradicts its menu entry | **Fixed** | Chip "⏱ after “Team sync” (12:00)" matches the menu and tooltip. "⏱ after lunch" drops the "(13:00)" that the menu shows (tooltip has it): nitpick. |
| 7 | Day strip bars: 8 px, unlabeled, mouse-only, orange 2.80:1 | **Fixed** | Bars are 14 px, hour ticks every 2 h, a caption line that follows hover and focus, one tab stop with arrow keys / Home / End, each bar has an aria-label. Measured on the light track `rgb(251,239,226)`: meeting blue 4.98:1, timed orange 4.51:1, label text 5.1 to 5.6:1. Caveat: a 1-hour meeting is only 36 px wide so it is never labelled; only the "next" meeting is named in the caption. |
| 8 | A bubble queued behind the board pops out stale | **Fixed** | Try 2 minutes → Stop → Esc: no bubble. Come back with the board open, then finish the next task: the resume card is dropped and the celebration shows instead. Meeting ends, board open 13 min, close: nothing. Still-valid ones survive: Meeting ends + close within 12 min shows the question and breather; Focus 1' started with the board open shows its confirmation when closed within 30 s. |
| 9 | Wrap up sheet at 1024x700: note below the fold, bar clips text, 34 Tab presses | **Partly fixed** | Frog and note moved above the list; one line per task; a radiogroup per task (arrow keys, Home/End); 10 tasks need 14 Tab presses (was 34); summary no longer clipped; no horizontal overflow. But when the board takes the "above" placement (y=8, 513 px high, about 4 of 8 loads at 1024x700 in the demo) **zero task rows are visible on open**: the sticky bar starts at y=427 and the first row at y=436 (new issue 4). |
| 10 | Wrap up visual noise ("🐸 First tomorrow" on every row, chip glued to title) | **Fixed** | One select for the frog, a 🐸 mark and green row only on the chosen task, the overdue chip is its own element with a gap. 38 px rows. |
| 11 | Demo cannot show end-of-day bubble, Monday, next morning | **Fixed, and it exposed a bug** | "Day's end", "Next morning", "Friday" and "Real time" all work: tasks moved to tomorrow come back as today's, "First on Monday" / "All to Monday" / "quiet until Mon 08:00" show, and a first load on the real clock at 21:10 now shows only "Demo mode with sample tasks 🎭". Using them found new issue 1. |
| 12 | Resume card sentence is a run-on | **Fixed** | "Welcome back! 👋 / Next up: “Write the weekly report”" then a muted "Last in: Google Chrome — Q4 plan - Google Docs"; pinned note is its own "📌 Next step" line; VI "Bạn vừa ở: …". (`vi-dark-r6-resume-pinned.png`.) |
| 13 | Meeting-soon related tasks are plain text with only OK | **Fixed** | "Open “Call client ABC”" scrolls the board to the task, focuses it and flashes it (from the floating bubble and from the banner, also from inside the Wrap up sheet, where the sheet goes back to the list and the draft is kept). Two related tasks give two buttons. Labels cut at 16 characters (issue 11). |
| 14 | Minors | **Mostly** | Pin popover in VI at 1024 is now inside the board (x 268 to 556 vs board 260 to 651). Board top gap is 16 px in the tall placements and still 8 px in the "above" one. Settings "Reminders a day" help now leads with a bold "Never counted:" (still 3 lines). Esc inside the Wrap up sheet goes back to the list and the draft survives. Not fixed: Esc in the split sheet (issue 5). |

## Per-criterion justification

**Functionality 7.0.** Every v0.4 contract item can be driven end to end, in EN and VI, light and dark, at 1366 and 1024, with a
clean console. New this round and working: the banner (including Open, stale-drop, hover/timer reuse), lighten view, plan
firing for after-meeting, after-lunch and app, Try 2 minutes with confirm, double-click guards, Day's end → Wrap up, Friday
→ Monday naming, Next morning tasks returning. It is held at 7.0 and not higher by: no morning greeting after a 0-done day
(issue 1), "Move some?" not a banner (2), Friday copy (3), the 1024x700 sheet (4), the split sheet's Esc and the keyboard
focus loss after "→ Tomorrow" (5, 6). None crashes or loses data; issue 1 loses a message the ritual promises.

**Pet craft 7.5.** No art changed. Iteration 1 only looked at Mochi, so this time I put all 24 species into the two v0.4 states
(`sp-contact-asleep.png`: "Done for today"; `sw-contact.png`: worried). Every species keeps its own silhouette, the sleeping
pose (closed eyes, Zzz, snot bubble, lavender cast) reads at 96 px on all of them, the scarf sits right on all of them, and the
worried face (sweat drop, raised brows) is legible and clearly not the grumpy one on all of them. The raise from 7.0 comes from
that wider check, not from new work. Held back: feet are cut at the demo taskbar edge on several species (a demo-desktop
artifact; unchanged since iteration 1), and "done for the day" still has only the sleep pose.

**Design quality 7.5.** The new surfaces extend the board's language instead of bolting on: the banner is a soft accent
strip with a progress hairline, the lighten state is a pink band plus quiet "→ Tomorrow" pills and estimate chips (lighter for
the default), the strip is now a real timeline with ticks, a caption, and dark-mode colours that hold up (contrast 4.5 to 5.6 in
light, 5.6 to 7 in dark). The Wrap up sheet went from 67 px task cards to 38 px rows and reads like a checklist. Held back:
at 1024x700 a meeting banner + strip + lighten band leave one task row visible (issue 8); on hover the five row icons paint over
chips and titles (issue 7); the "over" message appears three times (strip chip, lighten band, tooltip); meeting bars are almost
never labelled at the strip's 360 px; the sticky bar has no fade so rows are sliced under it.

**Copy & i18n 7.5.** VI is natural throughout the new strings ("Dời bớt vài việc sang ngày mai cho thoáng nhé.", "Mình chưa thấy
ứng dụng nào tên vậy, mình sẽ để ý nhé 👀", "Chuyển sang 2 phút", "Xong hôm nay · yên tĩnh tới Thứ 2 08:00") and nothing is
untranslated in any v0.4 view I dumped (overbooked, lighten, menus, dialog, wrap sheet, done board). The resume card is now two
clean ideas. Held back by the Friday "tomorrow" leftovers (issue 3), truncated "Open “Draft the Clien…”" labels, and
"Nice, today fits now ✓" at 7h45 of 8h.

---

## Critical issues (must fix)

None. Nothing crashes or loses data.

## Numbered new issues, most severe first

### 1. After a day with nothing done, the next morning's greeting (frog and note) never shows; only the "ate a snack" message does
- **Page:** `/overlay.html?demo`, 1366x768, EN (same in VI), real clock.
- **Steps (no Friday needed):** (a) click **Next morning**, close the greeting; (b) click **Wrap up**, type a note
  ("Start with the numbers tab"), leave the frog as is, press **Done for today**; (c) click **Next morning** again; watch for
  60 s. The Friday variant (Friday → Wrap up with note → Next morning) does the same.
- **Expected (spec §3):** "the next morning's greeting names them": "Good morning! … the frog you picked before you left: …
  Your note: …".
- **Actual:** at +0.75 s the bubble is "🍪 Nothing got done yesterday, so I ate a snack to keep your 🔥5 streak…". It fades at
  +10 s and **no greeting ever follows** (polled 14 s here, 60 s in a longer run, plus **Run rules**). The frog and the note are
  only reachable by opening the board ("You left yourself: …" card, 🐸 do first). If one task is finished first
  (**Finish a task** before wrapping up) the greeting with frog and note does appear, so it is the kind-words bubble on a
  missed day that takes the greeting's place. That is the day the ritual matters most.
- **Fix:** deliver the greeting after the day-note (queue it, or append the frog and note to the same bubble), and add a test
  for "missed day + wrap-up plan → next morning".
- **Screenshots:** `nz-morning2-snack.png`, `nz-morning2-after-snack-no-greeting.png`, `nz-morning2-board.png`
  (Friday variant: `en-f8-monday-0.png`, `en-f8-monday-1.png`).

### 2. The overbooked "Move some?" bubble does not appear as a banner in the open board (spec §6 says it must)
- **Page:** `/overlay.html?demo`, 1366x768.
- **Steps:** open the board (click the pet), click **Overbooked**.
- **Expected:** §6 lists "Move some?" among the urgent bubbles that "show as a banner at the top of the open board".
- **Actual:** no banner. The bubble is not urgent (`sayOverbooked` has no `urgent: true`), so it waits; the strip header shows the
  new "~3h45 over" chip, which helps, but after pressing Esc, the full "Today looks overbooked… Move some?" bubble pops over the
  pet even though the user has just seen the chip (or already lightened the day). When the day has been fixed meanwhile it is
  correctly dropped (verified).
- **Fix:** make it urgent (and drop it when the lighten view is open or the chip was tapped), or change the spec text.
- **Screenshots:** `en-o4-board-open-then-overbooked.png`, `en-o6-after-esc.png`.

### 3. On a Friday, three strings still say "tomorrow" while the rest says "Monday"
- **Page:** `/overlay.html?demo`, click **Friday**, board → **Wrap up** (or **Day's end**).
- **Expected:** one naming scheme (spec: "named when it isn't tomorrow: 'Monday'").
- **Actual:** the frog label reads "🐸 First on Monday" and the buttons "Monday" / "All to Monday", but the note label is "Where do I
  start tomorrow?" (VI "Mai mình bắt đầu từ đâu?"), and after **Done for today** the bubble says "Tomorrow starts with “Write the
  weekly report” 🐸" (VI "Mai mình bắt đầu với …"). The review bubble also says "move the remaining N to tomorrow".
- **Fix:** pass the day name into `lines.wrapDone`, `lines.review` and the note label.
- **Screenshots:** `en-f3-sheet.png`, `en-f4-done.png`, `vi-v4-wrap-friday.png`.

### 4. Wrap up at 1024x700 with the "above" board placement: no task row visible on open, and the list sits under the sticky bar
- **Page:** `/overlay.html?demo`, 1024x700, fake clock 16:30, board → Wrap up. In 4 of 8 loads the board is at y=8, 513 px high
  (pet near the middle; the demo panel excludes both side placements), in the other 4 at y=16, 628 px.
- **Expected:** the "few taps" sheet shows at least a couple of tasks and the primary button.
- **Actual:** at 513 px the sticky bar starts at y=427 and the first row at y=436: the screen shows "STILL OPEN 4 [All to tomorrow]"
  and then **Done for today** directly under it; every task is below the bar until you scroll (0 of 4 rows fully visible). At 628 px
  you get 2 to 3 rows. VI dark at 513 px is the same and a sliver of the list card pokes out to the right of the bar
  (`vi-dark-1024-v4-wrap-friday.png`). The top margin fix (16 px) also does not apply to this placement (still 8 px).
- **Fix:** give the "above" candidate the same `topMargin` and let it use the full height (628), and make the action bar not sticky
  (or shorter, with a fade) when the body is under about 400 px.
- **Screenshots:** `en-1024-w5-sheet-above.png`, `en-1024-m1-sheet-top.png` (628 px case), `en-1024-m2-tabbed-to-done.png`.

### 5. Escape from the split sheet closes the whole board (focus falls to the page); from the Wrap up sheet it goes back
- **Page:** `/overlay.html?demo`, 1366x768, board.
- **Steps:** hover "Plan the next sprint", click the ✂ icon; press Escape.
- **Expected:** back to the list, as in the Wrap up sheet ("Escape goes back to the list, like Back").
- **Actual:** after opening the split sheet with the mouse `document.activeElement` is `BODY`, the Board's `onKeyDown` never sees
  the key and the App-level handler closes the board. With focus inside the sheet's input, Esc does go back to the list, and
  typed steps are dropped silently in both cases.
- **Fix:** focus the sheet's heading or first field when any sheet opens (the Wrap up sheet already does).
- **Screenshot:** `e2-split.png`.

### 6. Keyboard: the lighten view is 18 Tab presses from its chip, and focus is lost after "→ Tomorrow"
- **Page:** `/overlay.html?demo`, Overbooked, open the board with Enter on the pet.
- **Actual:** 15 Tab presses reach the "~3h45 over" chip; Enter opens the view but focus stays there; 18 more Tab presses reach the
  first "→ Tomorrow" (the hover icons of every row are tab stops). Pressing Enter on it moves the task and leaves focus on
  `BODY`, so the next Esc closes the board and the user restarts from the top.
- **Fix:** focus the first "→ Tomorrow" when the view opens and, after a move, the next row's button (or the banner).

### 7. Hover icons paint over chips and titles (plan chip, lighten rows)
- **Page:** board, hover a row that has P2 + time + plan chips, or any row in the lighten view.
- **Actual:** "Call client ABC [P2] [⏰ 11:00] [⏱ after lunch]" with the mouse on it: ▷ ✂ 📅 ⋯ 🗑 are drawn over the plan chip so the chip reads
  as "⏱after lunch" with icons through it; in the lighten view the same icons cut the title to "Plan the next s" and touch the
  "→ Tomorrow" pill. Iteration 1 had the plan chip but not as many chips per row.
- **Fix:** reserve the icons' width (move chips to a second line on hover) or fade the chips under the icon group.
- **Screenshots:** `en-p6-chips.png`, `en-l2-lighten-long-scrolled.png`.

### 8. Stacked bands crowd the board at 1024x700
- **Page:** 1024x700, Overbooked, then Meeting soon, board open, tap "~4h15 over".
- **Actual:** banner (96 px) + add field + strip (120 px) + lighten band leave **one** task row visible in the body (384 px high of
  634 px of content); "~4h15 over" is said three times (strip chip, lighten band, tooltip).
- **Fix:** show the lighten band only when the chip was tapped and the chip is not repeated in it, or collapse the strip's caption
  while a banner is up.
- **Screenshot:** `en-1024-b2-banner-lighten.png`.

### 9. Lighten arithmetic is correct but unexplained
- **Page:** Overbooked, lighten view, move "Call client ABC" (3h).
- **Actual:** "~3h45 over" becomes "~1h45 over", not "~45 min over": the 3h timed task overlaps the 11:00 meeting by 1 h, which
  was counted once. Spec-correct ("a timed task inside a meeting isn't counted twice") but the user sees a 3h task buy back 2h.
- **Fix:** put the saving in the confirmation: "Moved … (frees 2h)".

### 10. Minor
- Esc on a focused banner button closes the board, not just the banner (consistent, but loses the board for a one-key dismiss).
- Related-task buttons are cut at 16 characters: `Open “Draft the Clien…”`, VI `Mở “Gọi cho khách h…”` (`vi-dark-1024-m5-two-related.png`).
- Demo only: "Day's end" with an empty Today (after the Friday jump) says "Almost end of day: 0/0 done … move the remaining 0 to
  tomorrow?" and **Move to tomorrow** moves nothing.
- The strip's `role="img"` bars are focusable (an ARIA smell) and `aria-live` on the caption announces on every hover.
- The first-load greeting on a real-clock evening is fine now, but the "Real time" button disappears while Friday is on, so the
  only way back is the Friday toggle (labelled "Back to today": fine, just a different control).
- I could not confirm that a dropped stale bubble refunds the day's reminder count (spec: "costs nothing"); the budget is spent at
  `say` time. Not observed because no counted reminder went stale in my runs.

---

## What improved since iteration 1

- Urgent bubbles, with their buttons, reach the user while the board is open; the stale ones never surface late.
- Dead-plan trap closed, with a preview of what a typed name matches.
- The overbooked flow went from "warns, then nothing to act on" to estimate chips, one-tap Tomorrow, live strip, "fits now".
- Timeline is a real timeline: 14 px bars, ticks, caption, keyboard, contrast, dark mode.
- Wrap up sheet: 38 px rows, one frog select, note above the list, radio groups, 14 tabs for 10 tasks, Esc goes back, draft kept.
- Resume card copy; related-task buttons; popovers stay inside the board; first-load demo noise gone; four new demo controls
  that work and make Monday, next morning and the review bubble verifiable.

## What regressed

- Nothing in earlier flows that I touched. New behaviour with rough edges: the split sheet's Esc (5), hover icons over the new
  chips (7), crowding at 1024x700 (8).

## Specific suggestions for the next iteration (in order)

1. Fix the missed-day morning: greeting after the snack message, with the frog and the note (issue 1).
2. Make "Move some?" a banner bubble, drop it when lighten is open (issue 2).
3. Name Monday everywhere on a Friday (issue 3).
4. Give the "above" placement the same top margin and full height; unstick the Wrap up bar on short bodies (issue 4).
5. Focus management: every sheet focuses its heading, the lighten view focuses its first action, and a move hands focus on (issues 5, 6).
6. Chips versus hover icons, and the stacked bands at 1024x700 (issues 7, 8).

## Screenshots

All under `/tmp/claude-1000/-home-tony-tran-repos/0beb72a4-177e-46e8-aee3-b3d9c4d4ab3f/scratchpad/eval-v04-2/`
(`en-`/`vi-` prefix, `-dark`, `-1024` suffixes as before):

- Banner and stale drop: `en-a2-meeting-banner.png`, `en-a3-after-start.png`, `en-b3-open-from-banner.png`, `en-u1-soon-banner.png`,
  `en-1024-b1-banner-over-board.png`, `vi-dark-1024-m5-two-related.png`.
- Overbooked and lighten: `en-o1-bubble.png`, `en-o2-lighten.png`, `en-o3-after-dbl.png`, `o4-fits.png`, `en-dark-o2-lighten.png`,
  `vi-dark-1024-o2-lighten.png`, `en-1024-o2-lighten.png`, `en-1024-b2-banner-lighten.png`, `en-o4-board-open-then-overbooked.png`,
  `en-o6-after-esc.png`, `en-l1-lighten-long.png`, `en-l2-lighten-long-scrolled.png`.
- Strip: `en-d1-strip.png`, `en-d2-strip-focus.png` (contrast numbers are in the text above).
- Wrap up: `en-w1-sheet.png`, `en-w3-board-done.png`, `en-dark-w1-sheet.png`, `en-1024-m1-sheet-top.png`, `en-1024-m2-tabbed-to-done.png`,
  `en-1024-w5-sheet-above.png`, `vi-dark-1024-v4-wrap-friday.png`, `en-f3-sheet.png`, `en-f4-done.png`, `en-l3-wrap-long.png`.
- Next morning and Friday: `en-n4-morning.png`, `en-n5-board-morning.png`, `en-f6-monday.png`, `en-f7-monday-board.png`,
  `en-f8-monday-0.png`, `en-f8-monday-1.png`, `nz-morning2-snack.png`, `nz-morning2-after-snack-no-greeting.png`, `nz-morning2-board.png`.
- Resume, plans, starter: `en-r1-resume.png`, `en-r3-pin-typed.png`, `vi-dark-r6-resume-pinned.png`, `en-p3-typed-fig.png`, `en-p6-chips.png`,
  `en-s2-confirm.png`, `en-y4-starter-end.png`, `vi-dark-1024-v3-another-app.png`, `en-t4-meeting-fired.png`, `en-t4-lunch-fired.png`, `vi-dark-t4-meeting-fired.png`, `vi-dark-t4-lunch-fired.png`.
- Pets: `sp-contact-asleep.png` (24 species asleep), `sw-contact.png` (24 species worried).
- Placement and Escape: `placement-1024-3.png`, `e2-split.png`, `pp-vi-dark-1024.png`, `st-1024.png`.
