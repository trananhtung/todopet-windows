# Evaluation — v0.4 "Indispensable", iteration 001 (TodoPet for Windows)

## Evaluation Mode

**Achieved:** `playwright` (scripted). The Playwright MCP tools were not used; I drove the live Vite server at
http://localhost:1420 (not started or stopped by me) with `playwright-core` and system Chrome (headless), a fresh browser
context (empty localStorage) per run. Real clicks, double-clicks, keyboard (Tab, Enter, Escape, arrows, Home/End), viewport
resizing, `colorScheme` light/dark, `locale` en-US / vi-VN, console + network capture, and Playwright's fake clock
(`page.clock`) for 10:00, 16:30 and 17:35 on Wed 2026-10-28 and the next morning 08:20 (the real clock was 19:xx on
2026-10-29, which makes the demo behave badly, see issue 11).
Viewports: 1366x768 and 1024x700 (overlay), 900x900 (Settings). Languages: EN and VI. Themes: light and dark.
Console: **zero errors or warnings in every run** (about 40 page loads, overlay and settings).
Not testable in a browser: real foreground-app/URL capture, private-window handling, Zoom/Teams "never a call" rule, Windows
idle detection, Credential Manager, a real Monday after a Friday (the demo treats every day as a workday), real Todoist
durations. I did not run `vitest`/`tsc`; this evaluation covers the live demo only.
No source file was touched. Scratch scripts and screenshots live in the scratchpad (see "Screenshots").

## Scores (weights from gan-harness/eval-rubric.md)

| Criterion | Score | Weight | Weighted |
|-----------|------:|-------:|---------:|
| Functionality | **6.5** / 10 | 0.35 | 2.28 |
| Pet craft | **7.0** / 10 | 0.25 | 1.75 |
| Design quality | **7.0** / 10 | 0.25 | 1.75 |
| Copy & i18n | **7.5** / 10 | 0.15 | 1.13 |
| **TOTAL** | | | **6.9 / 10** |

(Iteration 2 baseline from feedback-002: 7 / 7 / 7.5 / 7.5 = 7.2.)

## Verdict: FAIL (threshold 7.0), by 0.1

Every v0.4 contract item can be driven end to end in the demo and works on the happy path, in EN and VI, light and dark, at 1366
and 1024, with a clean console. That is a real piece of work: the resume card, meeting bookends, if-then plans, Wrap up sheet
(with persisted frog and note and a correct next-morning greeting), the overbooked bubble and the day strip all do what the spec
says. It still fails because the failures are all in the "state goes stale / actions misfire" class, and two of them touch the
most time-critical bubble in the product:

- the urgent "meeting soon" bubble (the one that now carries the related tasks) is silently swallowed whenever the board is
  open, then shows up late with a countdown that is no longer true;
- the "Start when I open ⟨another app⟩" dialog accepts names that can never match (`fig`, `Figma.exe`) and shows a confident chip
  for a plan that will never fire;
- the overbooked warning asks "Move some?" but nothing on the board shows which task is big;
- a double-click on **Back to work** opens the Wrap up sheet (same class as iteration 2's double-click-completes-two-tasks).

Functionality 6.5 is the only reason this misses; fixing issues 1 to 4 below is worth about +0.5 on that criterion and a pass.

---

## Per-criterion justification

**Functionality 6.5.** All five v0.4 flows work. Verified: resume card after "Step away → Wake up" and after leaving YouTube
(the place is the work app before the distraction, never the distraction), "Reopen ↗ docs.google.com" really opens the URL,
"Something else" and Focus work, a second card inside 30 minutes is correctly suppressed, `resumeDetails` off removes title and
Reopen, Pin/Unpin/note (120-char cap, `<b>` stays text, Escape returns focus to the button), related tasks in the meeting bubble,
"＋ Next step" opens the board with "⟨meeting⟩: " prefilled and the caret at the end, breather cut to the time there is (3 and 5
min), the after-meeting question stops after two closes, all three kinds of Start when… plus Another app… fire (meeting via the
real ended-meeting path, lunch at 13:01, app when Figma comes to front), "Later" re-arms (not at +10 min, fires by +40), Try 2
minutes → 2:00 focus → "✓ Done / ▶ Focus 25' / That's enough" (the last gives "Nice, starting is the hardest part"), Wrap up
(Tomorrow / No date / Keep, frog radio disabled on a task moved off the plan, summary line, note, Done for today → asleep pet with
Zzz and "All wrapped up", YouTube + Run rules stay silent, Back to work wakes it, draft kept across Esc/Back/Not yet), next morning
at 08:20 (greeting names the frog and quotes the note, board shows "You left yourself: …" and the frog first). It loses points for
the stale/swallowed urgent bubble, the dead-plan trap, the information-free overbooked flow, the Back-to-work double-click and the
silent focus replacement (issues 1 to 5).

**Pet craft 7.0.** Little new art in v0.4, so little to judge and nothing regressed. The sleeping pose for "Done for today" is the
best new image: eyes shut, Zzz, a cool lavender tint, reads at 96 px in light and dark. The worried face (sweat drop, raised brows)
reads at once and is clearly different from grumpy. I only looked at Mochi in the v0.4 flows, so the iteration-2 note about shared
bean silhouettes is neither confirmed nor retired. Kept at 7.

**Design quality 7.0.** The new surfaces share the board's language: pill chips, the segmented Tomorrow / No date / Keep control,
the pinned-place popover, a day-strip card with a green/amber/red meter, calm copy, and a good dark mode (no white panels; the
iteration-2 white demo panel in dark mode is fixed). Held back by: the strip's 8 px unlabeled bars (only hover tooltips, orange
timed bars at 2.80:1 on the light track, below 3:1 for graphics), the strip's key message ("3h45 over") living only in a tooltip
and screen-reader text, the Wrap up sheet's repeated "🐸 First tomorrow" on every row and sticky action bar clipping the summary
at 1024x700, and chip text that disagrees with the menu it came from (issue 6).

**Copy & i18n 7.5.** The pet keeps its voice and the VI is natural, not translated: "Mai mình bắt đầu từ đâu?", "Hôm nay có vẻ quá
tải… Dời bớt vài việc nhé?", "Không sao", "Nghỉ hôm nay", "Mình nhớ bạn đang làm gì…", "No-judgement" lines like "A few taps, no
right answers: just a tidy desk for tomorrow" and "Nice, starting is the hardest part 🌱". Nothing untranslated in any v0.4 view;
Settings (Behavior → Calm, Work day → Default task length) read well in both languages and dark mode. Held back by the resume card
sentence (issue 12), lowercase chip vs sentence-case menu inconsistency, and the stale countdown copy.

---

## Critical issues (must fix)

None crash the app or lose data. Issues 1 and 2 are the closest.

## Numbered issues, most severe first

### 1. Overlay: the urgent "Meeting soon" bubble is swallowed while the board is open, then shown stale
- **Page:** `/overlay.html?demo`, 1366x768, EN. Same code path as every bubble (all of them are hidden while the board is open).
- **Steps:** (a) fake clock 10:00, click the pet to open the board; (b) click **Meeting soon** in DEMO CONTROLS; (c) wait; (d) at 10:20
  press Escape to close the board.
- **Expected:** a meeting reminder (urgent, chime "important") that carries the related tasks must be visible whenever it is due,
  or at least be dropped or rewritten once the meeting has started. The board's own calendar line shows no countdown, so the board
  cannot cover for it.
- **Actual:** while the board is open the DOM has **0** `.bubble` elements (nothing visible at 10:00, 4 minutes before the meeting).
  After closing the board at 10:20 the bubble appears with the text **"📅 Meeting in 4 min: “Client ABC renewal” (10:04) / Related:
  “Call client ABC”"**, 16 minutes after that meeting started. The bubble text is baked in at `say()` time and its 90 s timer
  never runs while unmounted. Same effect for the resume card and the after-meeting question (they wait, then appear late).
- **Fix:** let urgent bubbles show beside the board (placement already exists for the board), or regenerate/expire the text at
  render time (`startsIn = start - now`; drop it once `now > start`).
- **Screenshots:** `i1-meeting-soon-board-open.png` (board open, no bubble, strip shows the meeting but no countdown),
  `i2-stale-meeting-bubble.png` (stale text after closing).

### 2. Board → ⋯ → Start when… → Another app…: accepts names that can never match, shows a confident chip, never fires
- **Page:** `/overlay.html?demo`, board, any task row.
- **Steps:** row "Plan the next sprint" → ⋯ → Start when… → Another app… → type `Figma.exe` (or `fig`) → Enter. Then click **Figma**
  in DEMO CONTROLS and wait 25 s.
- **Expected:** the hint says "At least 3 letters: the app's name, or its program's name." `Figma.exe` is the program's name as
  Task Manager shows it, so the plan should fire (or the dialog should say what it matches).
- **Actual:** **Set** is enabled for `fig` and `Figma.exe`; the row gets "⏱ when I open fig" / "⏱ when I open Figma.exe" and the note
  confirms it; with Figma in front for 25 s: no bubble. Whole-word matching and the exe stem rule (`figma` only) are not
  explained anywhere. `figma`, `FIGMA`, `figma ` (trailing space) do fire. Result: a dead plan the user trusts, and the whole
  point of an if-then plan (a reliable cue) is lost.
- **Fix:** strip a trailing `.exe` before matching, and either accept prefixes of 3+ letters or change the hint to
  "Type the whole name, e.g. Figma or Visual Studio Code." Preview the match against recent apps ("Matches: Figma").
- **Screenshots:** `issue-dead-plan-chip-1.png`, `issue-dead-plan-chip-2-figma-in-front-no-bubble.png`.

### 3. Overbooked flow cannot be acted on: no per-task estimate anywhere, "Pick tasks to move" just opens the board
- **Page:** `/overlay.html?demo`, 1366x768, EN and VI.
- **Steps:** click **Overbooked**; bubble "Today looks overbooked: ~10h of tasks + 1h45 of meetings in 8h left. Move some?" →
  **Pick tasks to move**.
- **Expected:** the board opens ready to choose: durations on the rows (or the biggest tasks marked), perhaps a "Move to tomorrow"
  shortcut for the heavy ones.
- **Actual:** the board opens on the same list as ever. None of the 5 rows shows its duration (240, 180 and 240 min in this demo
  state) or the default estimate; the user must guess which tasks make up "~10h". After moving two tasks one by one through the Move
  menu the strip does update live (`level-over` → `level-tight` → `level-ok`, "~11h45 / 8h left" → "~3h45 / 8h left"), which is
  good, but there is no "you're back under" feedback. In the strip the visible text is only "~11h45 / 8h left"; the words
  "3h45 over" exist only in the tooltip and the sr-only span.
- **Fix:** show a duration chip ("4h", "30′ default" in a lighter tone) on every Today row whenever the day is tight or over, and
  render "3h45 over" visibly in the strip header.
- **Screenshots:** `en-o2-after-pick.png`, `ob-after-moves.png`.

### 4. Board day strip: double-clicking "Back to work" opens the Wrap up sheet
- **Page:** `/overlay.html?demo`, fake clock 16:30, 1366x768.
- **Steps:** board → Wrap up → **Done for today**; reopen the board; double-click **Back to work** in the strip card.
- **Expected:** the pet wakes and the board stays on the task list (the same trap iteration 2 fixed for the check circle with
  `e.detail < 2`).
- **Actual:** the first click wakes the pet and the same spot in the card is now the **Wrap up** button; the second click lands on
  it and the full Wrap up sheet opens ("Back / Wrap up the day / Today's wins…") in a board the user just wanted to resume.
- **Fix:** ignore the second click (`e.detail < 2`) or keep the button in place for ~400 ms. (`Done for today` itself is safe: a
  double-click wrapped the day once, diary shows one entry.)
- **Screenshot:** `rapid-2-after-dbl-back.png`.

### 5. Try 2 minutes silently replaces a running 25-minute focus session
- **Page:** `/overlay.html?demo`, board.
- **Steps:** hover "Write the weekly report" → ▶ Focus (🍅 25:00 card). Then "Plan the next sprint" → ⋯ → **Try 2 minutes**.
- **Expected:** a confirm, or the 2-minute starter disabled/hidden while a session runs, or at least Undo.
- **Actual:** the focus card instantly becomes "🍅 02:00 · Plan the next sprint" and the 25-minute session on the other task is
  gone with no message. Same when starting a 2-minute starter on top of another.
- **Fix:** hide **Try 2 minutes** while `s.focus` is set, or ask "Switch from ‘Write the weekly report’?".
- **Screenshots:** `issue-try2-replaces-focus-1-before.png`, `issue-try2-replaces-focus-2-after.png`.

### 6. If-then chip text contradicts the menu entry it came from
- **Page:** board, Today rows.
- **Steps:** at 10:00: row "Call client ABC" → ⋯ → Start when… → "After “Team sync” (12:00)". Look at the chip and its tooltip.
- **Expected:** one naming scheme.
- **Actual:** menu: "After “Team sync” (12:00)" (end time, with title). Chip: "⏱ after 11:00 meeting" (the **start** time, no title). Tooltip:
  "After “Team sync” (12:00)". With two meetings starting at the same time the chip is ambiguous, and 11:00 vs 12:00 reads like
  two different plans. The same mismatch shows in the confirmation note at 16:30: "After “Team sync” (18:00)" vs the chip
  "after 17:00 meeting".
- **Fix:** chip = "⏱ after Team sync (12:00)" (truncate the title, keep the end time).
- **Screenshots:** `en-s6-three-chips.png`, `en-s7-when-with-plan.png`, `long-2-chip-note.png`.

### 7. Day strip: bars are unlabeled, 8 px tall, mouse-only, and the timed-task colour fails 3:1 in light mode
- **Page:** board, day strip card, 1366x768 and 1024x700, light.
- **Steps:** click Meeting soon, Meeting ends, Overbooked (5 blocks, 2 lanes); open the board.
- **Expected:** readable at a glance, keyboard reachable.
- **Actual:** each bar is `<i class="ds-seg">` 8 px high, `tabIndex = -1`, no role, identified only by a `title` tooltip; the axis shows only
  "08:00" and "18:00" (no ticks, no label on the now marker); lane gap is 3 px so two lanes read as one thick block. Measured
  contrast on the light track `rgb(251,239,226)`: meeting blue `rgb(58,120,184)` 4.07:1, **timed task orange `rgb(226,112,58)`
  2.80:1** (WCAG 1.4.11 wants 3:1). The 52x6 px load meter is 4.12:1. Dark mode is fine (7.07 / 6.64 / 5.95).
  The track's `role="img"` aria-label does list every block with times, so screen readers are served; sighted keyboard users get
  nothing.
- **Fix:** darken the orange to about `#c9531f`, add hour ticks (08 / 12 / 16 / 18), make the bars 10 to 12 px, label the next
  block under the track ("11:00 Team sync"), and make bars focusable with the same text.
- **Screenshots:** `en-st2-lanes-overbooked.png`, `en-st3-board.png`.

### 8. A bubble queued while the board is open pops out stale after it closes (starter, resume card)
- **Page:** board open, 1366x768.
- **Steps:** with the board open: ▶ Focus on a task, Stop, then ⋯ → Try 2 minutes on another, Stop, press Escape.
- **Expected:** nothing about a session that is over.
- **Actual:** after Escape the bubble "Just 2 minutes on “Plan the next sprint”. Open it and see, that's all 🌱" appears although the
  session was stopped (focus badge gone). With a running 2:00 session the bubble also only appears once the board is closed
  (badge `01:59`). Same root cause as issue 1.
- **Fix:** tie bubbles to a validity predicate (`focus still running`, `meeting still ahead`) and drop them at render if false.
- **Screenshot:** `en-t1-started.png` (board open, bubble absent), `en-t3-end.png`.

### 9. Wrap up sheet at 1024x700: note and summary below the fold, sticky bar clips text, 3 tab stops per task
- **Page:** board → Wrap up, 1024x700, EN and VI.
- **Steps:** add 6 tasks (10 open) → Wrap up; Tab through.
- **Expected:** a "few taps" sheet where the note and the primary button are reachable at once.
- **Actual:** the first screen shows 4 of 10 rows; the note field sits at y=1020, about 480 px below the visible part of the sheet (the action bar's top edge is at y=543); the sticky
  action bar overlaps the grey summary paragraph ("Your pet will sleep and stay quiet until the next workday starts (08:00).
  Meetings…" cut mid-line in `many-2-note-focused.png`) and is 10 px wider than the sheet (`scrollWidth 392 > clientWidth 382`).
  Each row has three separate segmented buttons (no arrow-key group), so 10 tasks need about 34 Tab presses to reach **Done for today**.
  At 4 tasks (the normal demo) the sheet is fine.
- **Fix:** make the segmented control a radiogroup with roving tabindex, put "Where do I start tomorrow?" above the list or pin
  it above the action bar, and add bottom padding equal to the bar height.
- **Screenshots:** `many-1-sheet-top.png`, `many-2-note-focused.png`, `B-en-1024-12-sheet.png`.

### 10. Wrap up sheet visual noise and spacing
- **Page:** Wrap up sheet, 1366x768.
- **Actual:** "🐸 First tomorrow" is repeated on every row (4 to 10 times) as a radio with an emoji; the lime-green selected state
  duplicates the segmented control's emphasis; the red **overdue** chip touches the task title with about 1 px of space
  ("Reply to the boss's email[overdue]"). The title-then-controls stack makes each task 67 px tall.
- **Fix:** one "Tomorrow's first task" select/popover, or a frog icon-only toggle with a tooltip; add `margin-left: 6px` to the chip.
- **Screenshots:** `en-w1-sheet.png`, `B-en-dark-13b-sheet-top.png`.

### 11. The demo cannot show several v0.4 behaviours (so they were not verified)
- **Page:** `/overlay.html?demo`.
- (a) **End-of-day review bubble opening the sheet:** I never saw it. After the 17:35 greeting the diary says "Held a reminder: last
  one at 17:35, at least 15 min apart", and there is no demo button for it (the Wrap up button calls the same effect, which works).
- (b) **"Monday" naming and weekend frog:** the demo treats every day as a workday, so "Tomorrow" never becomes a weekday name.
- (c) **The next morning:** with the fake clock the greeting is correct, but a task moved to "Tomorrow" vanishes
  (`elsewhere` list never returns), so the board says "Today 0 · 3 to plan" and the greeting "Only 0/3 planned so far" sits
  awkwardly beside "Before you left you picked ⟨frog⟩". The real clock (19:xx) also makes a first load show "Good evening / 0 of 3
  planned" noise before any v0.4 button.
- **Fix:** add **Next morning** and **Friday** demo buttons and make `reschedule("tomorrow")` bring the task back after a day jump.
- **Screenshots:** `en-w8-morning.png`, `en-w9-board-morning.png`.

### 12. Resume card sentence is a run-on and doubles the greeting
- **Page:** `/overlay.html?demo`, Come back; also after YouTube.
- **Actual (EN):** "Welcome back! 👋 / Next up: “Write the weekly report” · you were in Google Chrome — Q4 plan - Google Docs".
  Two ideas (what is next, where you were) are glued with a middle dot, and "Next up: X · you were in Y" reads as if Y belongs
  to X. The spec form "You were on: ⟨task⟩ · in ⟨app⟩" only shows once you have acted on a task. VI: "Việc tiếp theo: “…” · bạn vừa ở
  Google Chrome — Q4 plan - Google Docs" has the same shape. After YouTube the opener is "No rush, whenever you're ready 🌱"
  (good) but the rest is identical.
- **Fix:** two lines: "Next up: ⟨task⟩" then a muted "Last in: Google Docs — Q4 plan". Keep the 60-char title cut.
- **Screenshots:** `en-r1-comeback.png`, `en-r4-leave-youtube.png`, `en-p5-resume-pinned.png`, `B-vi-dark-1024-1-resume.png`.

### 13. Meeting-soon bubble lists related tasks as plain text with only "OK"
- **Page:** Meeting soon, 1366x768.
- **Actual:** "Related: “Call client ABC”" is text; the only button is **OK**. There is no way to open or focus the task from the
  bubble, so the feature that was added to prepare you does not let you start preparing. Related matching itself is right
  (shares "client"; "Team sync" gets none).
- **Fix:** add "▶ Prep" (starts a focus on the first related task) beside OK.
- **Screenshot:** `en-m1-meeting-soon.png`.

### 14. Minor
- Board at 1024x700 sits flush to the top edge (header avatar at y=10, rounded corners cut): `B-en-1024-4-board.png`.
- Pin popover in VI at 1024 extends 28 px left of the board and overlaps the pet's head: `B-vi-dark-1024-5-pin.png`.
- Settings → Behavior → "Reminders a day" help text is 4 lines and about 300 characters; the list of free reminders is the
  most important sentence and is buried: `en-set-Behavior.png`.
- Wrap sheet "Esc" closes the whole board (same as the split sheet; consistent, but Back would be kinder from a sheet).
  Draft is kept, verified.
- Pet craft: no new emote for "done for the day" other than sleep; tomorrow's frog 🐸 is only text.

---

## What improved (v0.4 vs iteration 2)

- Dark mode demo panel is now dark; no white panels anywhere in dark v0.4 flows.
- Console clean in every run (iteration 1's failure mode).
- Popovers (Start when…, Another app…, pin place) are portal-based, flip-aware and keyboard-correct: Enter opens with focus on the first
  item, ArrowDown/Up/Home/End move, Escape closes only the popover and returns focus to the ⋯ button; the Another-app dialog
  validates 3+ letters and clamps to 60 characters (`<script>` stays text).
- Wrap up is a model of good flow design: draft persisted in the brain across Esc/Back/Not yet, "Done for today" applied
  together (diary: "Wrapped up the day: 2 moved to tomorrow, 0 off the plan; tomorrow's frog … quiet until 08:00"), asleep pet,
  silent YouTube, frog first next morning.
- Settings Default task length clamps correctly (5 → 15, 500 → 120, blank → last valid) and Nudge budget 0..30.
- Nudge budget copy now names every free reminder, both languages.

## What regressed

- Nothing in earlier flows that I touched. The "bubble hidden while the board is open" rule from iteration 2 is now much more
  costly because three new v0.4 bubbles (meeting soon with tasks, after-meeting question, resume card) arrive while people
  plan with the board open.

## Specific suggestions for the next iteration (in order)

1. Make urgent bubbles visible with the board open, and give every queued bubble a render-time validity check (issues 1 and 8).
2. Fix Another-app matching (`.exe`, prefixes) and show what it will match (issue 2).
3. Show durations on rows when the day is tight, show "N over" in plain text, and make "Pick tasks to move" do something (issue 3).
4. Guard the Back-to-work double-click and the Try-2-minutes focus replacement (issues 4 and 5).
5. Unify chip and menu wording and the strip's colours/labels (issues 6, 7).
6. Add Next morning / Friday / review-bubble demo controls so the rest can be verified (issue 11).
7. Tighten the Wrap up sheet at 1024x700 (issues 9, 10) and rewrite the resume card as two lines (issue 12).

## Screenshots

All under `/tmp/claude-1000/-home-tony-tran-repos/0beb72a4-177e-46e8-aee3-b3d9c4d4ab3f/scratchpad/eval-v04/` (EN unless prefixed `vi-`; `-dark`
and `-1024` suffixes in the `B-*` set: `B-{en|vi}[-dark][-1024]-N-name.png`):

- Resume: `en-r1-comeback.png`, `vi-r1-comeback.png`, `en-r4-leave-youtube.png`, `en-p1-pin-popover.png`, `en-p2-pin-typed.png`, `en-p3-pinned.png`,
  `en-p5-resume-pinned.png`, `en-p7-pinned-reopen.png`, `res-acted-en.png`, `set-resume-off-card.png`, `B-*-1-resume.png`.
- Meeting bookends: `en-m1-meeting-soon.png`, `en-m2-meeting-ends.png`, `en-m3-next-step.png`, `m8-breather.png`, `i1-…`, `i2-…`.
- If-then and starter: `en-s1-more-menu.png`, `en-s2-when-menu.png`, `en-s3-when-menu-figma.png`, `en-s4-chip.png`, `en-s5-plan-fired.png`,
  `en-s6-three-chips.png`, `en-s7-when-with-plan.png`, `en-a1-another-app.png`, `en-a2-another-typed.png`, `issue-dead-plan-chip-*.png`,
  `en-t1-started.png`, `en-t3-end.png`, `en-t4-after-pick.png`, `issue-try2-replaces-focus-*.png`.
- Wrap up: `en-w0-board-1630.png`, `en-w1-sheet.png`, `en-w3-sheet-filled.png`, `en-w4-after-done.png`, `en-w5-board-done.png`, `en-w7-back-to-work.png`,
  `en-w8-morning.png`, `en-w9-board-morning.png`, `rapid-2-after-dbl-back.png`, `many-1…3`, `long-2-chip-note.png`, `long-4-sheet-row.png`,
  `B-*-12-sheet.png`, `B-*-13-sheet-filled.png`, `B-*-14-done-bubble.png`, `B-*-15-board-done.png`.
- Overbooked and strip: `en-o1-overbooked-bubble.png`, `en-o2-after-pick.png`, `en-st1-normal.png`, `en-st2-lanes-overbooked.png`, `en-st3-board.png`,
  `ob-after-moves.png`, `B-*-9-overbooked-bubble.png`, `B-*-10-overbooked-board.png`.
- Settings: `en-set-Behavior.png`, `en-set-Workday.png`, `vi-dark-set-Tínhcách.png`, `vi-dark-set-Ngàylàmviệc.png`, `set-resume-off.png`.
