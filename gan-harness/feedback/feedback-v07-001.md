# Evaluation — v0.7 "Always fresh", iteration 001 (TodoPet for Windows)

## Evaluation Mode

**Achieved:** `playwright` (scripted). The Playwright MCP tools were not used. I drove the live Vite server at
http://localhost:1420 (`overlay.html?demo`, `settings.html?demo`; not started or stopped by me) with `playwright-core` and system
Chrome (headless), a fresh browser context (empty localStorage) per run unless a test needed persistence. Real mouse clicks and
hovers, keyboard (Tab, Shift+Tab, Enter, Escape), double-clicks and spam clicks, `colorScheme` light/dark, `locale` en-US / vi-VN,
console + page-error + request-failure capture, and Playwright's fake clock (`page.clock`) to reach the natural "calm moment"
announcement, the 2-minute first check, the morning greeting and the post-update celebration.
Viewports: 1366x768 and 1024x700. Languages: EN and VI. Themes: light and dark. The announce -> Later -> board chip -> chip install ->
celebration flow ran on **all 8 combinations**; the Settings -> Updates flow ran on all 8 as well.
Console: **zero errors or warnings in every run** (about 100 page loads: overlay and settings, EN/VI, light/dark, plus the patched runs below).

**Two limits of a browser run, and what I did about them**

- The demo backend lives in memory in each page, so the overlay and Settings do not share a backend. The two pages do share the demo bus
  (BroadcastChannel) when they are in one browser context. What I could observe: Settings -> "Update & restart" starts the install in
  the overlay (progress bubble, then "installing", then gone) **when the overlay already knows the update** (it had checked itself).
  What I could not observe: when only Settings had found the update, the overlay's backend answers "nothing to install", the overlay
  tells Settings to stop waiting, and the button simply seems to do nothing. In the real app both windows share the Rust state, so I
  treat that as a demo limitation, not a bug. Also not testable: tray menu, real GitHub API, rate limits (30 min / 20 s), the NSIS
  installer, signature checks, a real restart (the demo "restarts" in place), what an install does to a running focus session.
- The demo only ever produces the happy path. To reach the download-page fallbacks, a failed install, a failed check, hostile or very
  long release notes, an empty note and "already up to date", I **rewrote the served `src/backend/demo.ts` module in flight with
  Playwright `route`** (string replacements in the response; the file on disk was never touched). Those runs are marked "(patched)" below.
  Cold-start celebration (the real post-restart path) was tested by seeding `localStorage["todopet:life"]` with `lastVersion` and
  `pendingNotes` before the app loaded.

I read `src/core/updates.ts`, `UpdateChip.tsx`, `settings/sections/Updates.tsx` and the update parts of `brain.ts` only to learn
selectors, the gating rules and what the Rust contract says a failed check returns; no source file was touched.
Scratch scripts and screenshots: `/tmp/claude-1000/-home-tony-tran-repos/0beb72a4-177e-46e8-aee3-b3d9c4d4ab3f/scratchpad/eval-v07/`.

## Scores (weights from gan-harness/eval-rubric.md)

| Criterion | Score | Weight | Weighted |
|-----------|------:|-------:|---------:|
| Functionality | **7.5** / 10 | 0.35 | 2.63 |
| Pet craft | **7.5** / 10 | 0.25 | 1.88 |
| Design quality | **7.5** / 10 | 0.25 | 1.88 |
| Copy & i18n | **7.0** / 10 | 0.15 | 1.05 |
| **TOTAL** | | | **7.4 / 10** |

(Baseline, v0.6 iteration 1: 7.5 / 7.5 / 7.0 / 7.5 = 7.4.)

## Verdict: PASS (threshold 7.0), by 0.4

Every item of the v0.7 contract that a browser can reach works end to end in EN and VI, light and dark, at 1366 and 1024, with a clean
console: the notice comes once per version at a calm moment (after the greeting, never over a typing burst, an open board, a focus
session, quiet mode or a meeting, outside the nudge budget, not repeated after a reload or after a manual check), "Later" asks for nothing
more, the chip and Settings stay findable, the install shows a live progress bubble and chip, the failure and the four "one click is off"
reasons all end at the download page, release notes cannot inject anything, and the pet celebrates exactly once after a newer version starts
(and stays silent for a first run, a downgrade or an unreadable version). It passes with room because nothing is broken. It does not go higher
because the keyboard path loses focus on exactly the three buttons this feature adds, a failed manual check is silent whenever an update is
already known, the board body jumps 32 px when the chip appears, Vietnamese users read English release notes inside the pet's bubble,
and the pet itself has nothing new to show.

## Per-criterion justification

**Functionality 7.5.** Walked and working (all in demo unless marked patched):
(1) Discovery: the demo button answers with an urgent "There's a new version of me: 0.7.1" bubble (Update now / Later, three highlights); the
automatic path (first check at 2 min) announces at the first calm moment: 2100 s in a 15:00 fake day (after the 900 s greeting, the 1200 s chest
bubble and the 15 min bubble gap) and 9045 s in a 09:00 fake day (it waited out the 10:00 and 11:00 meetings). The notice is free: the footer stays
"8 of 8 reminders left" before and after.
(2) Once per version: announce, let it fade or press Later, reload in the same context (the persisted `life.updateAnnounced = 0.7.1`), run 3 hours: no
second bubble; the chip is back after the next check. Manual check first, then the automatic path: no second bubble either.
(3) Gating (fake clock): board open for 40 min: none, then it came 15 min after Escape; typing every 4 s through its normal window: none, announced 2 min
after the last key; focus session: held; "Quiet 1h": held. Auto-check off in Settings (persists across reload): zero announcements in 2 h and no chip; the
demo's manual check still works.
(4) Install from the bubble: "Downloading…" (indeterminate) -> 10% ... 90% -> "Installing, see you in a moment!" -> gone; a real `role=progressbar` with
`aria-valuenow`; the bubble stays put while the pointer is over it (the pet stops, the fade timer pauses: I measured x frozen at 708 and `animation-play-state: paused`),
and a double-click, a six-click spam of the demo button, and a chip double-click each start exactly one install.
(5) Chip: "✨ 0.7.1 is ready" under the stats; click = same flow; shows the same progress text, disabled and `aria-busy` while busy; closing the board mid-download
brings the progress bubble up (it was held, not lost); closing the progress bubble with X keeps it closed; title says "Update and restart" or "Open the download page".
(6) After the (simulated) restart: "Now I'm on 0.7.1! ✨" with the saved highlights and a confetti dance, once; the real cold-start path (seeded `lastVersion 0.6.0`,
`pendingNotes`) shows it at +980 s (it waits for the greeting), without notes shows just the title, records the version and does not repeat on the next start.
(7) Settings -> Updates: "Not checked yet" -> "Checking…" (button disabled) -> "Version 0.7.1 is ready ✨ · Checked just now", release date, notes group, privacy line; Check now,
Update & restart, auto-check switch, "You're on the newest version 👍 · Checked just now" (patched), "Couldn't check for updates just now · Last tried just now" (patched),
an empty note hides the notes group (patched).
(8) Fallbacks (patched): `msi`, `unsigned`, `dev`, `check_failed` each show a kind sentence plus "Open download page" in Settings; in the overlay the bubble's primary button
becomes "Download page" and the chip's click opens the page (verified by a counter on `openPage`); a failed `openPage` gives "I couldn't open the download page just now…";
a failed install gives "I couldn't update myself. Grab it from the download page?" with Download page / Later, and the chip is back as a retry.
(9) Notes (patched): a 70-line, 5 000-character note with `<script>`, `<img onerror>`, markdown links, `**bold**`, "by @user in <url>", numbered items, a 100-character word and
a "Full Changelog" line renders as text only (0 injected elements, 0 dialogs), wraps without horizontal scroll, scrolls inside a 240 px focusable, labelled region; the bubble keeps the
first three bullets and skips headings and the changelog link.
Held at 7.5 and not 8 by issues 1, 2, 4 and 5 below (focus lost on the new buttons, a silent failed manual check, an unannounced 32 px layout jump, no sign that a check is running).
None loses data or blocks the update.

**Pet craft 7.5.** v0.7 adds no art, so this holds at the v0.6 level. The celebration reuses the dance + confetti and sits right on the four species I stepped through
(cat, penguin, dragon, frog; four frames each, `pc1-sheet.png`): no clipping against the bubble, the scarf stays on, and the pet's face reads clearly happy (I looked at them at the 150 px stage size, not at 96 px). The bubble is
anchored to the pet and follows it; the pointer-hover freeze means the buttons can be hit. What is missing is any pet reaction to the feature itself: while it downloads or installs it just keeps walking with a
neutral face (`ins-en-dark-1024.png`), and the "I'm on 0.7.1 now" moment is the same generic dance as finishing a task. A tiny "carrying a box" or "stretch and reboot" beat would be the
charm here.

**Design quality 7.5.** The new surfaces sit inside the existing language: the bubble keeps the white card, tail and fade timer and gains a slim progress bar that fits
(`dl-vi-light-1366.png`, `ins-en-dark-1024.png`); the chip is a small accent pill that reads as a sibling of the stats; the Updates page uses the same group cards, row rhythm, switch and
notice styles as the other eight sections and is good in dark mode. Measured contrast: bubble title 15.75:1 light / 13.28:1 dark, bubble detail 6.36 / 6.27, primary button 5.10 / 7.10, chip
5.29 / 6.42, Settings status detail 6.36 / 5.45, notes 13.91 / 14.13, the "Updating…" notice 4.61 light / 6.64 dark (the lowest). Focus is a visible 2 px ring in both themes on every new control.
Held back by: a chip on its own row that adds 32 px to the header (issue 4), bullets with no hanging indent, a first note line that repeats the group title, a sparkle icon plus a ✨ emoji in one status
line, and a 2-line EN intro with a one-word second line (issue 7).

**Copy & i18n 7.0.** The pet has a voice and it is not nagging: "There's a new version of me: 0.7.1 ✨", "Installing, see you in a moment!", "I couldn't update myself. Grab it from the
download page?", "Now I'm on 0.7.1! ✨", the one-time notice, and "Later" that asks for nothing more. VI is natural where it was written for the pet ("Mình vừa lên bản 0.7.1! ✨", "Đang cài,
chút nữa gặp lại nhé!", "Mình không tự cập nhật được. Bạn tải bản mới ở trang tải về nhé?", "Hỏi GitHub khoảng 6 giờ một lần; không gửi gì về bạn.") and I found no untranslated UI string in
either language (I dumped the bubble, chip, Settings, notices and status lines in both). Held at 7.0 by: release notes that are always English, shown under "Có gì mới:" in the VI bubble, Settings and
celebration (issue 3); a flatter VI announcement than the EN one (issue 6); "per-machine" jargon in the EN MSI sentence and "ready" on a chip that only opens a web page (issue 6).

---

## Critical issues (must fix)

None. Nothing crashes, loses data or leaves anyone without a way to update.

## Numbered issues, most severe first

### 1. Every new button the keyboard presses drops focus to the page body (Settings: Check now, Update & restart; overlay: the chip)
- **Page:** `settings.html?demo` (Updates), `overlay.html?demo` board. Measured in EN light and dark (`k1.mjs`, `k2.mjs`); the VI strings use the same components.
- **Steps (Settings):** Tab to **Check now**, press Enter. Then, with an update found, Tab to **Update & restart**, press Enter. (Overlay: open the board, Tab to the chip `✨ 0.7.1 is ready`, press Enter.)
- **Expected:** focus stays where the user pressed, or moves to the status line that reports the result.
- **Actual:** `document.activeElement` is `BODY` immediately after Enter on Check now (the button is `disabled` while "Checking…") and **stays `BODY` after the check finishes** (measured in light and dark).
  After Enter on Update & restart the button is *removed* (`!asked` guard) and focus is on `BODY`; the layout under it also moves 19 px (Check now 226 -> 245) as the "Updating…" notice is inserted above. On the chip,
  focus goes to the overlay root while it is `disabled` (`k2.mjs`: "focus after Enter on chip: overlay"). A keyboard or screen-reader user has to Tab from the top of the window after every press.
- **Fix:** keep the control in the DOM and in the tab order: use `aria-disabled="true"` plus an early return instead of `disabled`, and for Update & restart keep the button (disabled by `aria-disabled`) or move focus to the
  `role=status` line. After a check, if focus was on Check now, restore it there. Reserve space for the "Updating…" notice so nothing shifts.
- **Screenshots:** `k1-light-focus-update.png`, `k1-dark-focus-update.png`, `set-en-light-1366-3-focus-update.png`, `set-en-light-1366-4-asked.png`.

### 2. A failed manual "Check now" is silent whenever an update is already known
- **Page:** Settings -> Updates (and any overlay status that reads the same `UpdateStatus`).
- **Steps (patched):** first check finds 0.7.1; press Check now again while the "network" fails (the backend returns `available` kept plus `error`, as the spec says: "failures keep the last good result and report `{kind, message}`").
- **Expected:** the person pressed a button and gets an answer, e.g. "Couldn't check just now. Still showing what I found 3 hours ago."
- **Actual:** `statusLine()` returns the `available` branch first and never looks at `error`, so the status reads "Version 0.7.1 is ready ✨ · Checked just now" and the only visible change is that the button re-enables. The `catch` branch of `checkNow`
  that builds an `error` status is hidden the same way. Offline users with a pending update cannot tell "no news" from "could not ask".
- **Fix:** when `st.error` is set, render the error `Notice` (kind wording, with the age of the last good check) *under* the "ready" line instead of replacing it; keep the Update button.
- **Screenshots:** `s2-en-failSecond.png`, `s2-vi-failSecond.png` (both show the plain "ready" line after a failed check); contrast `s2-en-checkFail.png` (error tone appears only when nothing is known).

### 3. Release notes are English in a Vietnamese app (bubble, Settings, celebration, every release)
- **Page:** overlay (bubble and celebration) and Settings -> Updates, `vi-VN`.
- **Steps:** VI locale, run the announcement (or press the demo's "Kiểm tra bản mới"); open Settings -> Cập nhật.
- **Expected:** a Vietnamese user reads the highlights in Vietnamese, or at least is told they are English.
- **Actual:** `Có bản mới 0.7.1 ✨ / Có gì mới: / • Faster board when your task list is long / • Fixed the focus timer drifting after the PC wakes from sleep / …` (the same in `Mình vừa lên bản 0.7.1!`
  and in the Settings notes box under "Có gì mới trong 0.7.1"). Release notes come from GitHub, so this will happen on every real release unless the project adds a convention.
- **Fix:** agree on a bilingual release-note format (a `## Tiếng Việt` section, or a `<!-- vi -->` marker) and have `highlights()` / `tidyNotes()` pick the section matching `lang`, falling back to the English text with a small
  "(English)" tag; put the convention in the release checklist.
- **Screenshots:** `m-vi-light-1366-1-announce.png`, `m-vi-dark-1024-1-announce.png`, `m-vi-light-1366-5-celebrate.png`, `set-vi-dark-1024-3-focus-update.png`.

### 4. The board's whole body jumps 32 px when the chip appears (and again when it goes)
- **Page:** `overlay.html?demo`, 1366 and 1024.
- **Steps:** (fake clock) open the board right after load; wait for the 2-minute automatic check to finish.
- **Expected:** a quiet background event should not move what you are reading or typing into.
- **Actual:** the chip is a new grid row (`grid-area: fresh`); the "Add a task" field moves from y=167 to **199** (1366) and 131 -> **163** (1024) in a single frame, no reserved space, no transition. The same jump happens when the chip
  disappears after an install. Anyone who opens the board in the first two minutes after logon, or has it open when a 6-hour check lands, is typing in an input that just moved.
- **Fix:** put the chip in the existing header row (right-aligned beside the mood line, where there is room at 404 px), or reserve its row only when `update` is likely, or fade and slide the row in with a `grid-template-rows` transition
  (and respect reduced motion).
- **Screenshots:** `m-en-light-1366-2-board.png` (chip row), `c1-3-board.png` vs `c1-5-after.png` (header shrinks again).

### 5. Nothing shows that a check is running when the pet is asked (tray / demo button)
- **Page:** overlay, demo button "✨ Check for updates" (stands in for the tray item).
- **Steps:** press it. With the demo's 500 ms you see nothing, then the bubble; with a patched 4 s network wait there is no bubble, no thinking face, no chip change for 4 s (the earlier bubble just stays).
  A real check can take up to the 20 s timeout. Settings has "Checking…", the tray path has nothing.
- **Expected:** a short acknowledgement ("Let me look… 🔍", or a thinking mood) so a tray click never looks dead, and a second click is not needed.
- **Actual:** silence until the answer (the spec lists none; this is a spec gap, not a code gap).
- **Fix:** `updateCommand()` says a 20 s bubble "Checking for a new version…" (urgent, replaced by the answer) when the check is still running after about 700 ms.
- **Screenshot:** `a1-0-checking.png` (no cue at +150 ms).

### 6. Smaller copy faults
- **VI announcement lost the pet's voice.** EN: "There's a new version of me: 0.7.1 ✨". VI: "Có bản mới 0.7.1 ✨" reads like a system notice. Suggest "Mình có bản mới 0.7.1 nè ✨" (or "Có bản mới của mình: 0.7.1 ✨").
- **"✨ 0.7.1 is ready" / "Version 0.7.1 is ready ✨" when one-click is off.** For MSI / unsigned / dev / check_failed the thing is not ready: it is a web page. The chip's hover `title` ("Open the download page") is the only hint.
  Say "✨ 0.7.1 is out" (VI "Có bản 0.7.1") and, when `canInstall` is false, add a tiny "download" to the chip.
- **"per-machine" in the EN MSI sentence** ("…which is per-machine and needs an administrator to update…") is jargon. VI says it in plain words ("loại cài cho cả máy"). Use "which installs for everyone on this PC and needs an administrator to update".
- **EN `check_failed` sentence** joins two clauses with a comma ("…from the download page instead, it is safer"). Use a full stop or "because it is safer".
- **Budget tooltip omits the new notice.** The footer help "Timed tasks, meetings, the morning hello, … don't count" does not list the update notice (it is free: 8 of 8 before and after), so a reader may think it spends a reminder.
- **Screenshots:** `p1-set-en-msi.png`, `p1-set-vi-msi.png`, `bud.mjs` output in the notes above.

### 7. Craft nits in the new surfaces
- **No hanging indent on bullets.** In the bubble "• Fixed the focus timer drifting after the PC" wraps to "wakes from sleep" under the bullet (`m-en-light-1024-1-announce.png`). Use `padding-left: 1em; text-indent: -1em` or a real list.
- **Settings notes repeat their own heading.** Group title "What's new in 0.7.1", then the box starts with "What's new" (the `##` line kept as plain text); GitHub's default is "What's Changed", so every release will do this. Headings are indistinguishable from body (`set-en-light-1366-2-found.png`, `p3-set-vi-1024-notes-focus.png`).
  Drop a leading generic heading or style headings bold.
- **A sparkle icon and a ✨ emoji in the same status line** ("✧ Version 0.7.1 is ready ✨"). Keep the icon, drop the emoji (or the reverse).
- **"Not checked yet" uses the refresh icon**, which looks like a button; use a neutral dot or clock.
- **EN intro wraps with a one-word second line** ("…and updates in / one click.") at 1366 (the VI line fits on one).
- **"Updating… TodoPet will restart in a moment." is bold blue** (4.61:1 light, the lowest contrast of the section); a regular-weight info notice is calmer. The VI/EN text is also third person while the page intro is the pet's ("Mình báo bạn…"): "I'll restart in a moment" would match.

### 8. "Update & restart" has no answer if the pet does not take the request
- **Page:** Settings, with the overlay not responding or without the update in its own backend.
- **Actual:** the button disappears, "Updating…" shows for exactly 30 s (`ASKED_FOR_MS`), then the buttons come back with no message. In the demo, when only Settings knew the update, the "Updating…" notice flashed for under a second and nothing else happened.
  (In the real app the shared backend should make this rare; it is the one failure path with no words.)
- **Fix:** after the timeout, say "I didn't hear back from the pet. Try again, or open the download page" and offer the download button.

### 9. Screen readers
- The progress bubble is `role=status aria-live=polite`, so each 10 % step is a new announcement (10 announcements per download); the chip (`aria-busy`, text changes) has no live region and is silent about progress when the board is open.
  Announce at 25 / 50 / 75 % and on "Installing", or put the progress only in the `aria-valuetext` of the bar.

### 10. Demo only
- "✨ Check for updates" wraps to two lines in the demo panel (34 px vs 26 px for every other button) in EN and VI, at 1366 and 1024 (same kind of nit as "Friend drops by" in v0.6; "✨ Update" fits).
- At 1024x700 the demo panel covers the left part of the bubble when the pet is on the left (`m-vi-dark-1024-1-announce.png` before I collapsed the panel); a screenshot of the update bubble at 1024 needs the panel collapsed.
- The overlay and Settings do not share a demo backend (see the limits above): Settings -> Update & restart only does something visible if the overlay already found the update.
- The demo's "restart" re-runs `noteVersion()` in place, so the cold-start celebration needs seeding `localStorage` to be seen.

### 11. Minor
- With the board open, the demo button's reply appears as an in-board banner *and* the chip is in the header above it ("✨ Có bản 0.7.1" over "Có bản mới 0.7.1 ✨"): the same news twice within 40 px; the banner then rides on top of the Friends sheet until dismissed (`reg-board-open-after-manual-check.png`, `reg-friends-with-chip.png`).
- Escape does not dismiss a bubble that has focus (pre-existing; the update bubble inherits it).
- The first frame of the celebration shows the pet with a neutral/pensive face and three small marks before the dance starts; it is a one-frame beat, but it opens the "good news" moment on the wrong expression.

## Scenarios tried (for the record)

Natural announcement: 15:00 and 09:00 fake days; gating by board, typing, focus session, quiet mode, meetings; manual then automatic path; reload in the same context; auto-check off.
Install: from the bubble, from the chip with the board open, from the chip with the board closed mid-download, progress bubble closed with X, double-click, spam, patched indeterminate and failing installs.
After the install: in-place celebration; cold-start celebration with notes, without notes, VI, a downgrade (`lastVersion 0.9.0`), an unreadable `lastVersion`, a 5 000-character saved note; no repeat on the next start.
Settings: initial, checking (also 3 s slow, patched), found, asked, up to date (patched), check failed (patched), failed after found (patched), empty note (patched), four manual reasons in EN and VI (patched), long hostile note (patched), toggle persistence, Tab order and focus rings, contrast in both themes, no horizontal scroll at 1366 or 1024.

## What improved since the last evaluated iteration

- A whole new feature surface landed without console noise, layout damage to the board header (the five header buttons keep their places with the chip in place, in all 8 combinations) or regressions in the Friends or wardrobe sheets.
- The v0.4 lesson "a stale thing must not pop up late" holds: the notice has `stillValid` (dropped if the release is pulled or the install starts), the progress bubble is held while the board is open and returns when it closes, and the celebration waits for the greeting.
- The once-per-version rule is easy to trust: it survives a reload, a manual check and a "Later", and it is free of the nudge budget (8 of 8 before and after).
- Hostile release text is handled with a strict plain-text pipeline (no markup path), and every "one click is off" reason ends at the download page.
- The demo "Visit" button from v0.6 now fits on one line.

## What regressed

- Nothing in the board, wardrobe, friends, diary or gallery that I touched. New roughness is limited to the new surfaces (issues 1 to 9).

## Specific suggestions for the next iteration (in order of impact)

1. Keep focus where the user pressed (issue 1): `aria-disabled` instead of `disabled` on Check now, Update & restart and the chip; do not remove the Update button; reserve the notice's space.
2. Show the error under a known update (issue 2): a failed manual check must say so, kindly, and keep the Update button.
3. Settle the bilingual release-note convention and make `highlights()` / `tidyNotes()` pick by language (issue 3), then update the release checklist.
4. Stop the 32 px board jump (issue 4): chip beside the mood line, or an animated, reduced-motion-aware row.
5. Acknowledge a pet-side check that takes more than about 0.7 s (issue 5).
6. Copy pass (issue 6): VI announcement voice, "is out" rather than "ready" when one-click is off, drop "per-machine", add the update notice to the "doesn't count" list.
7. Craft pass (issue 7): hanging indent, no duplicate heading, one sparkle, an info-toned "Updating…" in the pet's voice, no widow in the intro.
8. Give "Update & restart" a spoken timeout (issue 8) and calm the screen-reader progress (issue 9).
9. If there is time for charm: a small pet beat while it downloads (look at the bar, carry a box) and a dedicated "new version" celebration frame.

## Screenshots

All under `/tmp/claude-1000/-home-tony-tran-repos/0beb72a4-177e-46e8-aee3-b3d9c4d4ab3f/scratchpad/eval-v07/`:

- Matrix (8 combinations, `m-<lang>-<theme>-<width>-N-*.png`; 1 announce, 2 board with chip, 3 download chip / installing chip, 4 board after install, 5 celebration):
  `m-en-light-1366-*`, `m-en-light-1024-*`, `m-en-dark-1366-*`, `m-en-dark-1024-*`, `m-vi-light-1366-*`, `m-vi-light-1024-*`, `m-vi-dark-1366-*`, `m-vi-dark-1024-*`.
- Settings flow (8 combinations, `set-<lang>-<theme>-<width>-N-*.png`; 0 initial, 1 checking, 2 found, 3 focus on Update, 4 asked, 5 toggle).
- Demo-button route and first look: `x1-load.png`, `a1-0-checking.png`, `a1-1-found.png`, `c1-1-announce.png` to `c1-5-after.png`.
- Fallbacks and failures (patched): `p1-set-{en,vi}-{msi,unsigned,dev,check_failed}.png`, `p2-{en,vi}-{installfail,msi-bubble,msi-board,pagefail,checkfail,uptodate}.png`, `s2-{en,vi}-{checkFail,failSecond,emptyNotes,slowCheck,checking}.png`, `s3-{en,vi}-uptodate.png`.
- Hostile and long notes (patched): `p3-set-en-1366-longnotes.png`, `p3-set-vi-1024-longnotes.png`, `p3-bub-en-1366-longnotes.png`, `p3-bub-vi-1024-longnotes.png`, `p3-set-vi-1024-notes-focus.png`.
- Keyboard and focus: `k1-{light,dark}-focus-{update,notes}.png`, `k2-{light,dark}-focus-updatenow.png`, `k2-chip-focus.png`.
- Pet: `pc1-sheet.png` (cat, penguin, dragon, frog; 4 frames of the celebration), `ins-en-dark-1024.png`, `ins-vi-light-1366.png`, `dl-en-dark-1024.png`, `dl-vi-light-1366.png`.
- Regression: `reg-board-open-after-manual-check.png`, `reg-friends-with-chip.png`, `reg-wardrobe-with-chip.png`.
