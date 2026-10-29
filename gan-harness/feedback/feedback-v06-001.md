# Evaluation — v0.6 "Friends", iteration 001 (TodoPet for Windows)

## Evaluation Mode

**Achieved:** `playwright` (scripted). The Playwright MCP tools were not used. I drove the live Vite server at
http://localhost:1420/overlay.html?demo (not started or stopped by me) with `playwright-core` and system Chrome (headless),
a fresh browser context (empty localStorage) per run. Real clicks, double-clicks, keyboard (Tab, Shift+Tab, Enter, Ctrl+Enter,
Escape), mouse drag of the pet, mouse wheel, viewport resizing, `colorScheme` light/dark, `locale` en-US / vi-VN,
`reducedMotion`, clipboard read/write with and without permission, console + page-error + request-failure capture, and
Playwright's fake clock (`page.clock`) for a 9 h natural day (visits), a Sunday-to-Monday midnight rollover (blob week change)
and a morning-greeting-aware win.
Viewports: 1366x768 and 1024x700. Languages: EN and VI. Themes: light and dark (the full sheet matrix was run on all 8 combinations).
Console: **zero errors or warnings in every run** (about 90 page loads: overlay, settings, gallery and diary pages in EN/VI, light/dark).
Not testable in a browser: the real Ed25519 key in Credential Manager (the demo uses the clearly marked stand-in
`src/backend/demoCards.ts`, so "doesn't check out" is a scramble check here, not cryptography), the Tauri webview's clipboard,
Windows idle/foreground/call detection, a real time zone ahead. I did not run `vitest` or `tsc`; this covers the live demo only.
I read `Friends.tsx`, `Visitor.tsx`, `friends.ts` and the demo stand-in only to learn selectors and the card format and to build
test cards (I signed them in the page with the same stand-in the demo uses); no source file was touched.
Scratch scripts and screenshots: `/tmp/claude-1000/-home-tony-tran-repos/0beb72a4-177e-46e8-aee3-b3d9c4d4ab3f/scratchpad/eval-v06/`.

**Demo caveat that changes how the "paste a card from another load" flow works:** two fresh demo loads share the same stand-in
key (`demoPublicKey("me")`), so the "My card" text of one is *your own card* in the other (I confirmed: identical text,
"That's your own card!"). A real exchange only works after one side has done **Make a new card identity**. I did that
(A resets, B adds A's card, A adds B's, A finishes a task, B pastes A's newer card and gets "Updated Mochi's card" with 1/12).

## Scores (weights from gan-harness/eval-rubric.md)

| Criterion | Score | Weight | Weighted |
|-----------|------:|-------:|---------:|
| Functionality | **7.5** / 10 | 0.35 | 2.63 |
| Pet craft | **7.5** / 10 | 0.25 | 1.88 |
| Design quality | **7.0** / 10 | 0.25 | 1.75 |
| Copy & i18n | **7.5** / 10 | 0.15 | 1.13 |
| **TOTAL** | | | **7.4 / 10** |

(Baseline, v0.4 iteration 2 from feedback-v04-002: 7.0 / 7.5 / 7.5 / 7.5 = 7.3. There is no v0.5 feedback file; nothing in v0.3 to v0.5 regressed, see below.)

## Verdict: PASS (threshold 7.0), by 0.4

Every item in the v0.6 contract can be driven end to end in the demo, in EN and VI, light and dark, at 1366 and 1024, with a clean
console, and the edge cases I threw at it mostly held: the strict parser refuses more than 20 different malformed or hostile payloads with
a kind, non-echoing message, the 12-friend cap still lets a known friend update, older and future-dated cards are refused, odd names
(bidi override, zero-width, Hangul filler, blank braille, no-break spaces, 20 emoji, ZWJ family, RTL scripts, HTML) are either
refused or shown as plain text inside `<bdi>`, the blob can be beaten and pays once, undo does not claw the win back, and a visit
walks in, waves, leaves on the board, a trip, a focus session or sleep. It passes with room because no critical bug turned up. It is
not higher because the sheet puts the least useful thing first, the one piece of UI a visitor owns truncates the number it exists to
show, and two reasonably common cases (friends who kept the default name; a friend card with a huge task count) are not handled.

## Per-criterion justification

**Functionality 7.5.** Walked and working:
(1) My card is 386 characters of `TODOPET1.<payload>.<86-char signature>`; Copy puts exactly that on the clipboard and says
"Copied ✔︎ Send it to a friend."; with no clipboard it selects the whole card and says "press Ctrl+C" (focus in the box, 386 chars selected).
(2) Valid card pasted with newlines and indentation every 60 characters is accepted ("Added Zed! 🎉", 1/12); the same card again says
"Updated Zed's card."; payload tampered gives "looks damaged", signature tampered gives "doesn't check out; ask your friend to copy it again.",
truncated, garbage, `TODOPET1.` alone, 2000 x's and a 3000-character body each get their own kind line; my own card gives
"That's your own card! Send it to a friend instead 💌" (also when someone signs a payload with my `pk` under another key).
(3) With 12 friends: the 13th is refused ("You already have 12 friends, the most the list holds. Remove one to add another."),
a known friend's newer card still updates in place, an older one is refused ("I already have a newer card…"), a card dated 2 days
ahead is refused with a clock hint, a card 1 day ahead is accepted. The blob at 13 members is `HP 107/195` with 13 helpers: the arithmetic holds.
(4) Remove: confirmation popover (focus on Cancel, Tab cycles Cancel/Remove, Escape closes only the popover and gives focus back to
that Remove), Cancel keeps the friend, Remove moves focus to the next Remove, announces "Removed Mai." in a status, and after the last
removal focus lands in the paste box.
(5) Make a new card identity: popover as above, Cancel/Escape leave the card byte-identical, confirm changes the card (6 resets in a row
give 6 distinct identities), focus returns to the button, "Done! Your cards are from a new card identity now."
(6) Blob: HP and helpers update live while the sheet is open (finishing a task: 29/45 to 28/45, You 3 to 4); alone it is 15 HP and
I beat it with 15 finished tasks: HP 0/15, "Beaten! 🏅 Everyone wins, and the sticker is in your sticker book.", +50 XP once (a 16th
task adds only its own 30), the 🏅 is on the Sticker page after the 🌟, **Undo** on the winning task takes the task's XP back (720 to 690)
but not the win, redoing it pays nothing more. A friend's card from last week or a time zone ahead is "waiting" with a neutral
sentence. Across Sunday midnight the sheet flips to 2026-W45 by itself, HP 15/15, "2 friends' cards aren't from this week, so they aren't counted yet".
(7) Visits: Friend drops by walks in from the side with more room (eased, gait, a wave on arrival and one before leaving), label
"Bin dropped by! 🔥 buddy streak 2", click on the label or the pet opens Friends (both verified), the visitor hides while a bubble is showing
and comes back, leaves when the board opens, on a trip, on Focus, on sleep (about 12 s after "Step away", once the demo's pet is actually asleep),
and is a no-op for a second press while one is here. Over a long fake-clock working day there were exactly 2 visits, more than 2 h apart, the first
after the morning greeting. Reduced motion: it fades in at its place with no walk.
(8) Names: see the table in issue 3 and the "names tried" list below.
(9) Regressions: board header with 5 buttons is the same 28 px grid at 1366 and 1024 in EN and VI (no wrap, chest badge unchanged),
wardrobe and sticker page show the 🏅, diary says "A friend's pet dropped by" (never whose), settings, gallery and diary pages load in
4 language/theme combinations each, and all 24 demo-panel buttons can be clicked in a row at 1024x700 without an error.
Held at 7.5 and not 8 by issues 2 to 5 below (a truncated label, indistinguishable same-name friends, a reward that a pasted number controls,
the old identity re-addable) and by the first-screen layout at 1024x700 (issue 1). None loses data or breaks a flow.

**Pet craft 7.5.** No species art changed. The visitor is the same renderer at 0.86 scale, so every species keeps its silhouette and
gait: I walked the penguin and the dragon through eight frames and the crown sits right on both, the dragon's wings and tail read at 111 px,
the arrival wave is clear, and the visitor ends on the host's feet line. 12 species (cat, shiba, bunny, fox, panda, penguin, frog, hamster,
axolotl, capybara, duckling, red panda) render as 52 px stills in the list, readable and distinct. Held back by: every visitor wears the same
closed-eyes "happy" face; the host just stands (spec says it stands still, so the pair never *interact*: no head turn, no wave back, which is the
one charming thing missing); the boss is an emoji (👾 / 💫) in a circle next to hand-drawn vector pets, a visible style jump.

**Design quality 7.0.** The sheet reuses the wardrobe's language (`w-group-head` + count pill, white cards, warm accent, trash ghost buttons)
and feels like the same product in light and dark. Measured contrast on the sheet: light 5.18:1 (error line) to 15.75:1, dark 6.27:1 to 15.10:1;
focus is a visible 2 px ring in both themes. Held at 7.0 by hierarchy: the sheet's first screen is dominated by 8 lines of base64 in a 3-row box
(which cuts the fourth line in half) and a paste box; the friends, their pets and the buddy streaks, which are the reason the sheet exists,
start 438 px down a 927 px scroll (see issue 1). Also: a 6-line 11.5 px privacy paragraph is the last thing in the scroll, the card hash is
monospace noise, the demo panel's "Friend drops by" wraps to an orphan "by" in EN.

**Copy & i18n 7.5.** The voice is intact. EN errors are kind and never repeat the pasted content ("That card looks damaged, or part of it is
missing. Could your friend copy it again?"); VI reads naturally ("Thẻ này không khớp chữ ký nên mình chưa tin được. Bạn nhờ bạn ấy chép lại thẻ
giúp nhé.", "Quái Vật Trì Hoãn", "Chuỗi bạn: 3 ngày", "Thẻ ngày 22 thg 10"). I dumped every visible string in the sheet, the dialogs, the statuses and
the label in both languages and found nothing untranslated. Held back by the VI privacy sentence (a stray "—," in "ngày lịch quá kín để tính —, hay chưa có gì"),
its density in both languages, and the redundant "Mochi (🍡 Mochi)" for the default pet.

---

## Critical issues (must fix)

None. Nothing crashes, loses data or leaves the board unusable.

## Numbered issues, most severe first

### 1. The Friends sheet opens on a wall of base64 and a paste box; the friends are below the fold (first friend invisible on 1 in 3 loads at 1024x700)
- **Page:** `/overlay.html?demo`, 1366x768 and 1024x700, EN and VI, light and dark. Add 2 friends, click the pet, click the Friends header button.
- **Steps:** open the sheet and look at the first screen without scrolling. Repeat 3 times at 1024x700: the board takes either an
  488 px body or the "above" placement with a 365 px body (about 1 in 3 loads here).
- **Expected:** the first screen shows the sheet's point: your friends, their pets and their buddy streaks (or at least the first row), and
  Copy as the one action on your own card.
- **Actual:** measured offsets inside `.board-body`: the first friend row starts at **438 px** and ends at 525 px; the body is 520 px (1366),
  488 px (1024 normal) or **365 px** (1024 "above"). So at 1366 and 1024 normal you see the top 80 px of the first friend; in the "above" placement you see
  none and have to scroll before you know there is a list. The first screen is: "Back", heading, a 2-line lead, the MY CARD box showing 8 lines of
  `TODOPET1.eyJ2…` through a 3-row box that **cuts the 4th line in half** (`rows=3`, `clientHeight 60`, `scrollHeight 141`; `ta-card.png`), Copy,
  Make a new card identity, ADD A FRIEND, the label and the top of the paste box. The privacy paragraph (6 lines at 11.5 px) is the last item of a
  927 px scroll (1966 px with 12 friends).
- **Fix:** put the friends list (or its empty state) directly under the lead, or collapse My card to one truncated line with Copy and an
  expand control; make the card box a whole number of lines (rows=4 or `height: calc(n * line-height + padding)`); give the privacy note its own
  collapsed "What's on a card?" row.
- **Screenshots:** `m-en-light-1024-2-top.png` (the 365 px case: no friend visible), `m-vi-dark-1024-2-top.png`, `m-en-light-1366-2-top.png`,
  `ta-card.png` (the half-cut fourth line), `m-vi-dark-1024-5-bottom.png` (the privacy block at the end).

### 2. The visitor's label truncates exactly the part that makes it worth reading; 5 of 6 realistic names are cut
- **Page:** overlay, 1366x768 and 1024x700, EN and VI.
- **Steps:** paste cards for pets named "Sir Fluffington" (15), "Princess Marshmallow" (20), "Captain Whiskers III" (20), "Cục Bông Nhỏ Xíu" (16),
  "Bánh Bao Nhỏ" (12); press Friend drops by for each (or let natural visits run).
- **Expected:** "⟨name⟩ dropped by! 🔥 buddy streak N", whole (spec §4), or a clear shortening that keeps the streak. Names are allowed up to 20 characters.
- **Actual:** `.visitor-label` is `white-space: nowrap` with a content width of 278 px, so the text is cut with an ellipsis. Measured `scrollWidth` vs
  `clientWidth`: Bánh Bao Nhỏ 289/278, Sir Fluffington 290/278, Cục Bông Nhỏ Xíu 311/278, Captain Whiskers III 326/278, Princess Marshmallow 338/278. The
  label reads "Sir Fluffington dropped by! 🔥 buddy stre…". In VI the "ghé chơi! 🔥 chuỗi bạn 3 ngày" tail is cut the same way. With a 20-character
  name the label is "WWWWWWWWWWWWWWWWWWWW d…" (the verb is gone). Only "Mai" and other names under about 11 characters fit. The full text is in `title`/`aria-label`,
  so the sighted mouse user must hover to see the streak.
- **Fix:** allow the label to wrap to two lines (name on line 1, "dropped by! 🔥 buddy streak 3" on line 2) or drop the width cap and clamp to the
  viewport, which the loop already does for position.
- **Screenshots:** `label-cut-en.png`, `label-cut-vi.png`, `label-en-1024-20.png`, `label-vi-1024-20.png`.

### 3. Two friends with the same name and species are indistinguishable everywhere (list, blob helpers, Remove, status)
- **Page:** Friends sheet, any size.
- **Steps:** with the sample friends, paste cards from two different keys that both say name "Mai", species shiba (the default pet name is "Mochi", so
  two friends who never renamed their mochi is the realistic case).
- **Expected:** the spec handles look-alikes of *me* with the species beside the name; entries that look alike each other should be told apart too.
- **Actual:** the list shows "Mai · Shiba · Teen" twice (differing only by the streak/date line), the helper chips show "Mai 11  Mai 9  Mai 2", three Remove
  buttons are all named "Remove Mai", and the confirm says "Remove Mai?". A removal cannot be confirmed to be the right one except by position.
- **Fix:** when two friends fold to the same name, add a disambiguator in every place a name appears (stage, or the first 4 characters of their key, or "(2)").
- **Screenshot:** `dup-boss.png` (helpers "Mai 11, Mai 9, Mai 2").

### 4. A pasted card that says "999 tasks" beats the blob on its own and pays the receiver +50 XP and a 🏅 (spec-accepted, but the reward goes to the wrong person)
- **Page:** Friends sheet.
- **Steps:** paste a validly signed card with `weekDone: 999` (a stand-in friend, or any real install: keys cost nothing).
- **Expected:** a friend's number should help the blob; the sticker and XP should come from tasks the user's group could plausibly have finished.
- **Actual:** HP goes 29/45 to **0/60**, "Beaten! 🏅 Everyone wins" appears, the XP counter goes 320 to 370 and the sticker is paid (confirmed in the wardrobe).
  The contract says there is "nothing worth cheating for", but there is: the receiver gets +50 XP and a sticker each ISO week, set by someone else's
  number. A tired friend with a typo has the same effect. Range-checking to 999 per week accepts it.
- **Fix:** cap what one card can add to the blob (for example at 15 or 7 per day of the card's week), or cap `weekDone` to a plausible bound (for example 200); keep it
  one line in the spec.
- **Screenshot:** `f5-win-by-card.png`.

### 5. After "Make a new card identity", my own old card can be added as a friend, and it counts in the blob
- **Page:** Friends sheet.
- **Steps:** Copy my card; Make a new card identity (confirm); paste the old card.
- **Expected:** a stale card of mine from before the reset should be refused, or at least not counted as a person.
- **Actual:** "Added Mochi (🍡 Mochi)! 🎉"; a second "Mochi" is in the list with a buddy streak of 3 days (against myself), and the blob grows from
  `HP 29/45` to `41/60` with a fourth helper "Mochi (🍡 Mochi) 3 tasks". The label "Mochi (🍡 Mochi)" is also redundant for the default pet (name = species).
  It is easy to do by accident from a chat history.
- **Fix:** keep the previous `pk` in the friends document (or just its short hash) and refuse it with the "That's your own card" line; show "(species)" only
  when the name and the species name differ.
- **Screenshots:** `f4-old-self-boss.png`, `f4-old-self-as-friend.png`.

### 6. The "Copied ✔︎" note stays after the card changes, and the clipboard holds the old card
- **Page:** Friends sheet, My card.
- **Steps:** Copy my card; with the sheet open press Finish a task (or finish any task); watch the note and compare the clipboard.
- **Expected:** the note should clear when the card text changes (the sheet already re-signs when "what is on it changes").
- **Actual:** the card text goes from `weekDone 3` to `4`, the note still says "Copied ✔︎ Send it to a friend.", and `navigator.clipboard.readText()` is no longer equal
  to the card on screen. The same note is still there 6 s later and until the sheet closes.
- **Fix:** clear `note` in the `useEffect` that re-signs, or time it out after about 4 s.
- **Screenshot:** `live-stale-copy.png`.

### 7. The VI privacy sentence has a typographic fault and the paragraph is a wall in both languages
- **Page:** Friends sheet, bottom, VI.
- **Actual:** "…28 ngày gần đây (đạt mục tiêu, nghỉ — ngày nghỉ cũng có thể là ngày lịch quá kín để tính —, hay chưa có gì); …" has a stray "—," and nests a
  dash aside inside a parenthesis. Six lines of 11.5 px muted text in one block; the EN equivalent is 7 lines of the same size.
- **Fix:** split into a short bullet list ("Tên, loài, phụ kiện, độ lớn", "Số việc tuần này", "28 ngày: đạt mục tiêu / nghỉ (có thể là ngày họp quá kín) / chưa có gì", "Ngày làm thẻ", "Khoá công khai") and a separate "Không bao giờ có…" line.
- **Screenshot:** `m-vi-dark-1024-5-bottom.png`.

### 8. At 1024x700 in the "above" placement the identity confirmation leaves the board and covers the footer
- **Page:** overlay 1024x700 EN light (board 505 px high, y=16).
- **Steps:** open Friends, click Make a new card identity.
- **Actual:** the popover is 264x181 at (455,387) to (719,568); the board ends at y=521, so it overhangs the footer ("Quiet 1h / Hide 1h" are hidden under it) and
  the pet's head. It is fully visible and usable, so this is cosmetic, but v0.4 iteration 2 had "popovers stay inside the board" as a fix.
  (Remove's popover stays inside in every combination I tried.)
- **Fix:** place it above the button when there is less than 200 px below inside the board.
- **Screenshot:** `m-en-light-1024-8-reset.png`.

### 9. Screen reader and keyboard: the buddy-streak help sentence is read on every row, and the tooltip is mouse-only
- **Page:** Friends sheet, ARIA snapshot (`aria.mjs`).
- **Actual:** each list item reads ". Days in a row you both reached your goal. A day off doesn't break it." (an `sr-only` copy of the `title`) after "Buddy streak: 3 days".
  With 12 friends that is 12 copies. Sighted keyboard and touch users never get that explanation (a `title` needs a mouse hover).
- **Fix:** put the sentence once under the Friends heading (a visible small line works for everybody) and drop the per-row copy.

### 10. Demo-only
- Two fresh demo loads share one identity, so "paste My card from another load" yields "That's your own card!" until one side makes a new identity (caveat above).
  A demo button "Add 2 friends from another profile" or a per-load key would let the exchange be shown in one step.
- "👋 Friend drops by" wraps to two lines with an orphan "by" in EN at 1366 and 1024 (`f6b-opened.png`); VI fits on one line.
- "Add 2 friends" is idempotent (3 clicks give 2/12) and, with 11 friends, adds only the one that fits: correct.

### 11. Minor
- Wheel-scrolling the board while a confirm popover is open closes it silently (a reader loses the sentence mid-way).
- The blob avatar is an emoji (👾, 💫 on the win) in a circle, in a screen of hand-drawn pets; a small SVG blob in the pet art style would match.
- The stale-card suffix "· a fresh card brings visits again" (VI "· thẻ mới thì pet mới ghé chơi") is cryptic the first time; "· no visits until a fresh card" is clearer.
- The host never reacts to its visitor (by spec it stands still); a head turn or a wave back would be the charm moment the feature is missing.

## Names and payloads tried (for the record)

Accepted and shown as plain text: `WWWWWWWWWWWWWWWWWWWW` (20, no horizontal overflow in the list or the label), `Ｍｏｃｈｉ`, `mochi`, `MOCHI`, `You`, `Bạn`, `Móchi` (the last
five get the species beside them), `&lt;b&gt;x`, `<b>x</b>`, `"'><i>a</i>`, `<img src=x onerror=a` (all text in `<bdi>`, 0 injected elements, 0 dialogs),
`שלום עולם`, `مرحبا بالعالم`, 20 cats, 20 Japanese characters, `👨‍👩‍👧‍👦 Family`, `A B` with a no-break space, `Ź̂` (2 marks). Refused with the one kind name message: 21 characters, leading or
trailing space, zero-width space, U+3164, U+2800 x2, `ǅ` plus 3 marks, a right-to-left override, a newline, a tab, a line separator, `  `, empty, null, a number.
Refused for other reasons: unknown species / accessory, 4 accessories, two in one slot, stage 5 / -1 / 1.5, `weekDone` 1000 / -1 / "5", wrong week, history of wrong length or alphabet
(including a `K`), bad dates, `v:2` ("different version"), short `pk`, an extra `streak` key, two cards pasted together, text before or `<…>` around the card.

## What improved since the last evaluated iteration

- A whole new social surface is in, signed, keyless on the JS side (in the demo a stand-in), and every error reads like the pet wrote it.
- The sheet is keyboard-correct without being asked: the heading takes focus on open so Escape goes back, the draft survives Escape and return,
  focus goes to the box after Add and to the next Remove after a removal, popovers return focus to their opener.
- The pasted-card parser is the most thorough input handling in the product so far (issue list above shows the breadth).
- The v0.4 lesson "a stale thing must not pop up late" was applied: a visitor hides its label under a bubble, walks out when the board opens, and a sleeping, trip or focus moment ends it.

## What regressed

- Nothing in the board, wardrobe, diary, settings or gallery that I touched. New roughness is limited to the Friends sheet and visitor label (issues 1 to 3, 6 to 9).

## Specific suggestions for the next iteration (in order)

1. Reorder the sheet: friends first, My card as one line with Copy, privacy as a collapsed row (issue 1).
2. Let the visitor label wrap or shorten so the streak always shows (issue 2).
3. Tell same-name friends apart, and drop the "(🍡 Mochi)" suffix when name = species (issues 3 and 5).
4. Cap what one card can add to the blob and pay the win only from plausible numbers (issue 4); remember the previous key so my old card is refused (issue 5).
5. Clear the Copied note when the card changes (issue 6), fix the VI privacy line, and say the buddy-streak rule once (issues 7 and 9).
6. Place the identity popover inside the board at 1024x700 "above" (issue 8).

## Screenshots

All under `/tmp/claude-1000/-home-tony-tran-repos/0beb72a4-177e-46e8-aee3-b3d9c4d4ab3f/scratchpad/eval-v06/`:

- Sheet matrix (8 combinations, `m-<lang>-<theme>-<width>-N-*.png`; 1 visit, 2 top, 3 own card, 4 corrupt, 5 bottom, 6 mid, 7 remove, 8 identity):
  `m-en-light-1366-*`, `m-en-light-1024-*`, `m-en-dark-1366-*`, `m-en-dark-1024-*`, `m-vi-light-1366-*`, `m-vi-light-1024-*`, `m-vi-dark-1366-*`, `m-vi-dark-1024-*`.
- Cards and errors: `f1-copied.png`, `f2-own.png`, `f2-valid.png`, `f2-corrupt-payload.png`, `f2-big.png`, `f2-full-error.png`, `f2-full-boss.png`, `f7-noclip-en.png`.
- List, dates, remove: `f3-dates-1.png`, `f3-dates-2.png`, `f3-dates-boss.png`, `f3-remove-confirm.png`, `f3-after-remove.png`, `f3-empty-boss.png`, `vi-stale.png`, `vi-boss-waiting.png`.
- Identity: `f4-confirm.png`, `f4-after.png`, `f4-old-self-as-friend.png`, `f4-old-self-boss.png`, `swap-A.png`, `swap-B.png`.
- Blob and win: `f5-win-by-card.png`, `f5c-en-light-hp1.png`, `f5c-en-light-win.png`, `f5c-en-light-wardrobe.png`, `f5c-vi-dark-win.png`, `f5c-vi-dark-wardrobe.png`, `sticker-en-light.png`, `sticker-vi-dark.png`, `undo-boss.png`, `roll-before.png`, `roll-after-midnight.png`.
- Visits: `f6-en-light-1366-700.png`, `f6-en-light-1366-6000.png`, `f6b-with-bubble.png`, `f6b-hover.png`, `f6b-opened.png`, `f6c-bubble-during-visit.png`, `f6c-asleep.png`, `leave-Stepaway.png`, `walk-penguin-sheet.png`, `walk-dragon-sheet.png`, `label-cut-en.png`, `label-cut-vi.png`, `label-en-1024-20.png`, `label-vi-1024-20.png`, `nat-4.png`, `nat-13.png`, `f6d-1366-40.png`, `f6d-1024-1300.png`.
- Names and duplicates: `names-b0-list.png`, `names-b1-boss.png`, `dup-boss.png`.
- Regressions: `r-<lang>-<theme>-<w>-board.png`, `r-<...>-wardrobe.png`, `pg-settings-*.png`, `pg-gallery-*.png`, `pg-diary-*.png`, `diary-page.png`, `r3-spam.png`.
