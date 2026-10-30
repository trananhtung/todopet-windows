# TodoPet for Windows — design spec

A Windows port of [TodoPet](https://github.com/trananhtung/todopet) (macOS, Swift): a desktop pet that lives on
top of the taskbar, reads your Todoist tasks, asks you to plan 3 tasks a day, reminds you, cheers your progress and
worries (and offers help) when things slip. English and Vietnamese.

**What's new on Windows:** 25 pet species instead of one (22 from the start, 3 unlocked by milestones), each
with its own body, gait and voice, all sharing the moods, growth stages, hunger, dirt and accessories of the
original.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** (Rust) | WebView2 ships with Windows 10/11, so the installer is ~5–8 MB and RAM stays low for an app that runs all day. Rust reaches Win32 directly (foreground window, UI Automation, idle time, Credential Manager). |
| UI | **React 19 + TypeScript + Vite**, hand-written CSS | Pet art is SVG drawn in code, crisp at any DPI scale. All UI runs in a plain browser with a demo backend, so it is testable on any OS with Playwright. |
| Logic | Pure TypeScript modules under `src/core`, unit-tested with **Vitest** | Same split as the original (`MoodEngine`, `LifeRules`, `CalmRules` are pure). |
| Surface | **One transparent, always-on-top overlay window** covering the primary monitor's work area | The pet walks with CSS transforms instead of moving a window; bubble, board, sign parade, table flip and fireworks share one surface. Rust polls the cursor (~40 Hz) and the overlay toggles click-through with `set_ignore_cursor_events` only when the cursor enters/leaves an interactive element (`document.elementFromPoint`). |
| Other windows | Settings and Diary are normal decorated windows | They need focus and scrolling; they talk to the overlay through Tauri events. |
| Secrets | Windows **Credential Manager** (`keyring` crate) | Tokens never reach JavaScript: Rust reads them and makes the Todoist / Anthropic calls itself. |
| Storage | Small JSON files (atomic writes) in `%APPDATA%\com.trananhtung.todopet`; diary as daily JSONL files in `%LOCALAPPDATA%` | Prefs, pet life, postponed-task log, today's "start when…" plans (`triggers`, v0.4), tomorrow's frog and note (`plan`, v0.4), the friends' pet cards and the day's visits (`friends`, v0.6, overlay window only, at most 64 KB); the diary keeps 14 days. Browser demo uses `localStorage`. |
| Calendar | **ICS links** (Google "secret address in iCal format", Outlook "Publish calendar"), stored in Credential Manager, parsed with `ical.js` | Windows has no EventKit equivalent; ICS covers Google, Outlook/Microsoft 365 and iCloud. Rust fetches (public addresses only), JS parses and expands recurrences. |
| Distraction | Foreground process via Win32, active tab address via **UI Automation** (Chrome, Edge, Brave, Vivaldi, Opera, Firefox), window title as fallback | Same rules as the original (`youtube.com`, `youtube.com/shorts`). Addresses stay in memory. |
| Typing / idle | `GetLastInputInfo` for idle; Windows **Raw Input** that stores **only the timestamp** of the last key-down | Needed for "interrupt at a pause" and "in the zone" rules. No key codes are read or stored; no keyboard hook. |
| Packaging | GitHub Actions on `windows-latest`: NSIS `.exe` and `.msi` via `tauri build`; tags `v*` publish a release | Cross-compiling WebView2 apps from Linux is fragile; CI is the source of truth for Windows builds. |

## Architecture

```
todopet-windows/
  index.html            dev hub (links to every page)
  overlay.html          the pet surface (production main window)
  settings.html         settings window
  diary.html            diary window
  gallery.html          every species × mood × life state (dev + screenshots)
  src/
    core/               pure logic, no DOM: l10n, dates, models, mood, life, calm, stuck, calendar,
                        sites, lines, prefs, log, brain
    pets/               species registry + SVG renderer (renderPet(speciesId, pose) → SVG string)
    backend/            Backend interface, Tauri implementation, in-memory demo implementation
    overlay/            React app for the overlay: Pet, Bubble, Board, Antics, Effects
    settings/ diary/ gallery/   React apps for the other windows
    ui/                 shared styles and small components
  src-tauri/            Rust: commands, tray, Win32 watchers, Todoist/Anthropic/ICS HTTP, secrets
```

The **Brain** (`src/core/brain.ts`) runs inside the overlay. It owns tasks, mood, life, focus timer and the
reminder rules, exposes a snapshot for React (`useSyncExternalStore`) and actions (complete, add, move,
delete, focus, quiet…). It talks to the OS only through the `Backend` interface (`src/backend/types.ts`), so
the same Brain runs in Tauri, in the browser demo and in unit tests with a fake clock.

Backend selection: Tauri when `window.__TAURI_INTERNALS__` exists, otherwise the demo backend with sample
tasks (also forced by `?demo`).

## Features (parity with the original)

1. **Pet on the taskbar.** Walks along the top edge of the taskbar, looks at the cursor, stops and blushes
   on hover, can be dragged anywhere and falls back down. Hides while a full-screen app is in front.
   Keeps still while you type.
2. **Planning (Rule of 3).** If today has fewer than `target` tasks it asks you to plan: gently in the
   morning, insistently every 30 min after the planning deadline.
3. **Reminders.** Next task by "eat the frog" order; a nudge every 45 min; 10 min before and at the time of
   timed tasks; overdue tasks every 90 min; welcome back after 15+ min away.
4. **Moods.** 0–100 score every 15 s (exact formula of `MoodEngine.swift`): happy ≥ 75, chill ≥ 50,
   worried below; grumpy (below 30) only while you're on a distracting app or site in work hours (v0.3);
   sleeping at night / idle 10 min; focus; celebrating. Grumpy pet marches toward the cursor. Hovering the
   reason line on the board shows the breakdown.
5. **Board** (click the pet): today's tasks, overdue, completed; complete / undo; add (Today, Tomorrow,
   No date, Todoist quick-add syntax) with priority; move to today/tomorrow; delete with confirmation;
   focus; split; Todoist streak; life bar; wardrobe; mood reasons; calendar card.
6. **Focus timer.** 25 min (configurable) on a task; pet wears a headband and sits in the corner; at the end
   asks if you finished → completes in Todoist and starts the break.
7. **End-of-day review** 30 min before work ends: what you finished, move the rest to tomorrow.
8. **Distracting apps and websites** (2 min → frown). Configurable lists; URL rules match part of a site.
9. **Meetings** from ICS links: reminder N min before with Join button, quiet during meetings, meeting time
   counts as work, adaptive daily target, time-block suggestions in free gaps.
10. **Postponed tasks** (3+ days): split into 15–30 min steps (Todoist sub-tasks, step 1 today) or drop
    from plan; optional **Ask Claude** (`claude-opus-5-5`, low effort, JSON schema output).
11. **Pet life.** Fullness (+25 per task, −7/work hour), dirt (missed workdays, up to 3, flies), XP and stages
    Baby → Kid → Teen → Grown-up → Master, random celebrations (jump, spin, flip, dance), 10% golden treat,
    combos within 30 min → fireworks, accessories (bow, scarf, sunglasses, top hat, crown, grad cap)
    unlocked by milestones, sticker book of perfect days.
12. **Mischief**, only while you're on a distracting app or site (v0.3): a sign parade after 5 min on it
    while grumpy, then (the escalation) a table flip (╯°□°)╯︵ ┻━┻ jumping into the middle of the screen
    after 15 min, sharing one slot of at most one stunt per 20 min; a grumble after 10 min on it in a low
    mood; "Spare me 15'" button; never during meetings, focus or while away, and the parade and grumble
    wait for a pause in typing.
13. **Calm rules.** Interrupt only at a pause (8 s without typing or an app switch); in the zone after
    10 min of steady typing (🎧, holds non-urgent bubbles); ≥ 15 min between unsolicited bubbles.
14. **Sounds** (Off / Important only / Everything, synthesized with WebAudio) and **spoken lines**
    (Web Speech API with Windows voices, off by default).
15. **Diary**: every reminder and why, responses, held reminders, meetings, focus, moods, distractions,
    feedings, day settlement; summary line; Copy for pasting into Claude; 14 days, can be turned off.
16. **Tray icon** with mood and progress tooltip (`😊 2/3`, `🍅 18:42`) and quick menu: board, add task,
    focus, hide 1 h, quiet 1 h, settings, diary, quit. **Ctrl+Alt+T** opens the board with the add field
    focused. **Start with Windows** option. Single instance.
17. **English and Vietnamese**, switchable; default follows the system language.

## New: pet species

| Species | Gait | Signature details |
|---|---|---|
| Mochi (default) | bounce | the original round cat-eared mochi |
| Cat | bounce | tabby stripes, curling tail, whiskers |
| Shiba | bounce | curled tail, white cheeks, perky ears |
| Bunny | hop | long ears that flop with mood, cotton tail |
| Fox | scurry | big fluffy white-tipped tail, mask |
| Panda | waddle | eye patches, round black ears |
| Penguin | waddle | flippers, white belly, beak |
| Frog | hop | eyes on top, wide mouth ("eat the frog") |
| Hamster | scurry | chubby cheeks that puff when eating |
| Axolotl | float | pink gills that wiggle |
| Capybara | waddle | calm snout, tiny ears; sleeps with a yuzu on its head |
| Duckling | waddle | beak, little tuft, wings flap on celebrations |
| Red panda | scurry | white face mask with tear marks, ringed bushy tail |
| Sea otter | float | pale head, whiskers, holds a seashell |
| Hedgehog | scurry | spiky coat that bristles with mood, button nose |
| Koala | waddle | huge fluffy ears, big dark nose, nibbles eucalyptus when happy |
| Pygmy hippo | waddle | glossy, wide muzzle with nostrils, strong blush |
| Seal pup | waddle | fluffy white, huge eyes, flippers, whiskers |
| Owlet | hop | facial disc, ear tufts, wings |
| Lamb | hop | cloud of wool, floppy ears, hooves |
| Piglet | bounce | round snout, floppy ears, curly tail |
| Bảnh Bao (Dapper Bao) | bounce | a little person: spiky black hair, charcoal polo, white trousers and sneakers, crossbody bag; thumbs-up when happy |
| Bee (unlock: 20 tasks) | float | stripes, buzzing wings, antennae |
| Dragon (unlock: 7-day streak) | float | horns, wings, spiky tail, tiny smoke puff when grumpy |
| Unicorn (unlock: 50 tasks) | hop | horn, rainbow mane |

Every species renders every mood (eyes, mouth/beak, brows, cheeks, sweat, steam, Zzz, focus headband),
every stage (size, sprouts on babies), hunger (thinner, rumble), dirt levels (smudges, flies), all six
accessories at species-specific anchor points, golden variant, and the celebration poses. The species
picker in Settings shows a live preview; locked species show their requirement.

## Privacy

No analytics, no servers of its own. Network: `api.todoist.com`, your ICS links, and `api.anthropic.com`
only when you press Ask Claude. Browser titles and tab addresses stay in memory, and so does the v0.4 "Where was I?"
place (never saved or written to the diary, dropped at the day change; private windows and calls never in it); only the day's "start when…" plans are stored. Raw Input stores only the time
of the last key-down. A v0.6 pet card holds only the pet's name, species, accessories and stage, this week's finished-task count, a 28-day goal/rest record, the date and the install's public key (signed with a key kept in Credential Manager); it leaves the PC only when you send it yourself. Secrets (tokens, ICS links) live in Credential Manager; everything else is local. See
[SECURITY.md](../SECURITY.md).

## Thin vertical slices

1. **Scaffold + first end-to-end path:** Tauri shell, overlay with one pet walking, demo backend, board with
   today's tasks, complete → celebration + feeding. CI builds the Windows installer.
2. **Core logic port** with tests: dates, models, mood, life, calm, stuck, sites, lines, prefs, brain rules.
3. **Species:** 24 species (14 at launch, 10 added in 0.2), all moods/stages/accessories, gallery page, picker.
4. **Windows backend:** Todoist, Credential Manager, foreground app + browser URL, idle/typing, tray,
   hotkey, autostart, single instance, fullscreen hide, ICS fetch, Claude split, diary files.
5. **Full UI:** bubbles with actions, board (all actions), focus, review, mischief, settings, diary.
6. **Polish + release:** README (EN/VI) with screenshots, icon, release workflow.

## v0.3 "Kind" (Tử tế)

Why: see [research-fun-and-indispensable.md](research-fun-and-indispensable.md) (proposals 1, 2, 3, 12). Punishment
backfires, broken streaks demotivate, repairable streaks and freezes keep people going, batched notifications beat
constant ones, and endowed progress raises completion.

### 1. Forgiving streaks (`life.ts`, `prefs.ts`, `brain.ts`)
- **A streak day is a day the app saw with at least 1 finished task** ("you showed up"), rest days and weekends
  included; missing a rest day or a weekend never hurts. The daily goal and the perfect day stay as higher bars:
  a **goal day** (done ≥ target) puts a 🍪 snack in the stash (max 2); a **perfect day** (done ≥ target and
  ≥ planned) earns a sticker and +30 XP, as before; that XP can grow the pet a stage (same level-up words).
- **Days the app never saw** (PC off) are neutral: no streak change, no dirt. A day counts as seen only from a
  count Todoist confirmed; at rollover the brain first asks Todoist how many tasks were finished on the ending day
  (some may have been done on the phone after the last sync). If it can't say, the day closes as never seen.
- **Rest days:** `prefs.restDays` (day keys `YYYY-MM-DD`, deduped, sorted, at most 60, older than yesterday pruned).
  `isWorkday` is false on them, so the pet behaves like on a weekend. The board has a "Take today off" toggle;
  Settings → Schedule adds a date range (max 30 days), says how many days were really added (and warns when the
  60-day cap left the furthest out), and lists upcoming rest days with remove buttons.
- **Busy days:** a workday with fewer than 60 free minutes in work hours (calendar on) is excused when nothing got
  done: streak paused, no dirt, no snack used. Once busy, the day stays busy (a later failed calendar fetch doesn't
  undo it).
- **Missed day** (seen workday, 0 done, not busy): a snack is eaten if there is a streak to save (streak kept, no
  dirt); at streak 0 the snack stays and the day adds dirt. Otherwise dirt +1 and, if the streak was ≥ 2 and its 14
  days haven't gone by already, a **repair quest** is offered: finish 2 tasks on the next workday (within 14 days)
  and the old streak comes back, then that day counts too. The restore follows today's count (a failed close or an
  Undo takes it back) and is final when the day closes; its cheer comes once a day. Unfinished quests expire when
  their day closes, and the next morning's note says so kindly.
- `closeDay` returns what happened (`kept | excused | frozen | broken | none`, snack earned, sticker, page done,
  repair offered or expired, level-up) and the brain explains it kindly in one bubble the next morning (not counted
  as a reminder), from an hour before work starts, on that day only. When the day's first greeting is still to come,
  the kind words ride in it, after the greeting (and its frog and note), as lines of the same bubble: a bubble of their
  own would hold the greeting back for the 15-minute gap between bubbles, and a day with nothing done is the day the
  frog and the note matter most. Without a greeting to join (a day off, or it already came) they are a bubble of their own.
- Everyone starts with (or migrates to) 1 snack. Copy: the dragon and crown read "Keep a 7-day streak"; dirt reads
  "needs a bath (N missed days)"; the board's streak tooltip shows the snack stash and an active repair quest.

### 2. Head-start sticker pages (`life.ts`, board wardrobe)
- Stickers fill pages of 10. Every new page starts with **2 gift stickers** 🎁. A full page gives +50 XP and a 🍪
  (if the stash isn't full), then a new page starts with 2 gifts. Stored as `stickerPage` (1-based) and
  `pageFilled` (0–10); migration: page = 1 + ⌊perfect days ÷ 8⌋, filled = 2 + perfect days mod 8.
- The wardrobe shows the current page (gifts, stickers, empty slots, "6/10 · 4 more perfect days for a gift") above
  the 30-day strip, and locked accessories show their progress ("12/25").

### 3. Kind moods (`mood.ts`, `face.ts`, `limbs.ts`, `lines.ts`, `brain.ts`)
- **Grumpy only for distraction:** the angry mood needs an active distraction in work hours; everything else
  (overdue, no progress, unplanned day, hunger, dirt) bottoms out at the second-lowest mood, now called **worried**
  (😟). Its art: open eyes with brows raised in the middle, the wavy mouth and sweat drop, arms down instead of
  crossed. All species share it.
- Non-distraction lines in the worried mood offer help instead of scolding.
- Mischief (grumble, sign parade, blocking the screen) only happens while you are on a distracting app or site.
- The overdue bubble offers **Move to today**, **Fresh start** (move every non-recurring overdue task to tomorrow)
  and **Show**.

### 4. Nudge budget (`prefs.ts`, `brain.ts`, board, Settings → Behavior)
- `prefs.nudgeBudget` (default 8, 0–30): the most unsolicited non-urgent bubbles per day. Never counted: urgent
  bubbles (timed tasks, meetings), replies to what you did, and the two daily check-ins (morning greeting/plan and
  the end-of-day review). When the budget is used up the pet stays quiet (one diary line).
- **Back-off:** each repeating reminder kind has a multiplier (1, 2, 4, 8) on its interval. Closing or ignoring that
  kind doubles it; tapping one of its real buttons resets it ("Later", "Spare me" and "Just a quick break" are
  neutral). Three dismissed reminders in a row hold non-urgent bubbles for an hour; a bubble that expires unseen
  (pet hidden) counts for neither. Multipliers reset each day. The day's gates, multipliers, dismissals in a row and
  the hold are kept across restarts, and counted reminders and check-ins wait for a fresh sync.
- The board shows how many reminders are left today; the diary explains every skip.

## v0.4 "Indispensable" (Không thể thiếu)

Why: research proposals 4–8. Interrupted work often waits hours to be resumed and only a blatant cue helps; unclear
next steps after meetings are the norm; if-then plans have a large effect (d = 0.65); a short end-of-day plan helps
people detach; overcommitting is the main planning failure.

### 1. "Where was I?" resume card (`brain.ts`, board)
- The brain keeps, **in memory only** (never on disk, cleared at day change), the last *work* context: the task
  (running focus task, else the task you last acted on in the board, else the next task), the foreground app name
  and window title, and the browser address if it is http(s). Distracting apps and sites never become the context.
- Snapshot moments: you go idle, a meeting starts, or you switch to a distracting app or site.
- Coming back (after ≥ 5 min away, after a meeting, or leaving a distraction for 2 samples in a row after ≥ 2 min)
  shows a resume card instead of the generic welcome-back: the task on a line of its own ("You were on: ⟨task⟩", or
  "Next up: ⟨task⟩" when it is only the next one in line) and where you were as a quieter line under it ("Last in:
  ⟨app⟩ — ⟨title⟩"), with **Reopen ↗ ⟨host⟩** (only for an http(s) address), **Focus** and **Something else**. It is a check-in, not counted against the nudge budget, but it waits
  for a pause and while reminders are held, comes at most every 30 minutes, and stops for the day after two closes.
- Never a call (Zoom, Teams, Meet…) or the pet itself as the place, and never shown while a call is in front (it waits
  for its 10 minutes). A browser sample whose address can't be read for a second neither ends a distraction nor
  becomes the place. A private window keeps only the app's name. Addresses lose secret-looking parameters and `#…`.
  `prefs.resumeDetails` (Settings → Behavior → Calm, on by default): off, the card has only the task and the app.
- The board has **📌 Pin my place**: saves the context now with an optional one-line "next step" that the resume
  card shows.

### 2. Meeting bookends (`brain.ts`, `calendar.ts`)
- The "meeting soon" bubble lists up to 2 related open tasks (sharing a word of 4+ letters with the meeting title,
  case- and diacritic-insensitive, common words ignored), each with an **Open** button: the board opens (or stays
  open) scrolled to that task, which takes the keyboard focus and flashes once.
- After a meeting of 15+ minutes ends and you are at the PC (within 10 min): "“⟨meeting⟩” is over. Anything to
  capture?" with **＋ Next step** (opens the board's add field prefilled with "⟨meeting⟩: ", never over a draft) and
  **Nothing**. If the next meeting starts in 3 to 15 minutes, it also suggests a breather of up to 5 minutes, cut to
  the time there is. Once per meeting, not counted against the budget, held while reminders are held, and it stops for
  the day after two closes.
- It (and the "Meeting's done" card) needs a sign you were there (a call app or tab in front, 2+ minutes idle, or
  another app than before the meeting in front) and waits while a call is still in front: its 10 minutes count from
  when the call leaves.

### 3. Shutdown ritual (board "Wrap up" sheet, `brain.ts`)
- The end-of-day review bubble opens a **Wrap up** sheet (also in the board menu from 15:00, or from the review time
  when that is earlier), at most a few taps: today's wins; each unfinished task (overdue ones too) with **Tomorrow**
  (the next workday, named when it isn't tomorrow: "Monday") / **No date** / keep; pick **tomorrow's frog**; one
  line "where do I start tomorrow?". **Done for today** puts the pet to sleep and stops non-urgent bubbles until
  the next workday. The sheet is one line per task with its three choices as a radio group (one tab stop, arrow keys
  between the choices); tomorrow's first task is one choice (a list) and the note sits above the tasks, so neither is
  far to scroll to; the buttons stay in reach below. Escape goes back to the list, like **Back**. Every line that says
  "tomorrow" (the note's label, the choices, the bubble after **Done for today**, the end-of-day review and its quick
  button) says the next workday's name when that isn't tomorrow: "Monday" / "Thứ Hai", from one helper. On a short board
  (under 600 px: it opened above the pet) the sheet is tighter so the list shows on open: Back and the title on a line,
  today's wins on a line, the labels beside their fields, a thinner bar; the same keyboard and the same words. Split
  and the wardrobe take the keyboard to their heading the same way, so Escape goes back to the list there too (and
  the focus returns to the button that opened them).
- Tomorrow's frog and the note are stored locally (`plan` key) and the next morning's greeting names them; the
  frog goes first in "eat the frog" ordering that day.
- The draft lives in the brain for the day (closing the board keeps it); a frog finished elsewhere becomes "I'll
  decide tomorrow" with a line about it; the frog of a saved plan is kept even once moved to tomorrow. A retry reuses
  the plan worked out the first time. While "done for today" the pet's hunger and your detours aren't counted, and the
  kind words about yesterday wait for the first greeting after it. Adding a rest day moves the sleep and the plan.
- The sheet only collects choices; **Done for today** applies them together (a repeating task can only stay, since
  moving it would break its repeat). The frog and note are for the next *workday* (Monday after a Friday) and only
  count that day. If a move fails the pet stays awake, the sheet says so and the same button tries again. The day
  strip's **Back to work** wakes the pet again. "Done for today" is stored as the time it ends (`plan.doneUntil`).

### 4. Overbooked warning and day timeline (`calendar.ts`, `brain.ts`, board)
- Estimates: the Todoist duration when set, else `prefs.defaultEstimate` (default 30 min, 15–120).
- Load = estimates of today's open tasks + remaining meeting minutes in work hours; capacity = remaining work
  minutes. Once a day, after planning, if load exceeds capacity by 60+ minutes: "Today looks overbooked: ~6h of
  tasks + 3h of meetings in 7h left. Move some?" with **Pick tasks to move** and **It's fine** (a check-in).
  **Pick tasks to move** opens the board in a "lighten the day" state: a banner at the top of Today says how far over
  the day is ("~3h45 over") and has a close button; every open row shows its estimate ("30'", lighter when it is the
  default) and a one-tap **→ Tomorrow** (the next workday, like the Wrap up sheet; a repeating task can't move). The
  banner follows the load as tasks move and goes away, with a word about it, when the day fits. How far over the day
  is also shows in plain words in the strip's header ("~3h45 over"), and tapping it opens the same state; while the state
  is open the chip steps aside and the timeline folds away (the banner has the words, and the rows need the room: at
  least three show on a 1024 x 700 screen). In that state a row is its tick and its **→ Tomorrow** (the hover icons
  would cover the title): the keyboard goes to the first **→ Tomorrow** when it opens, up and down arrows move between
  them, and after a move it is on the next row's (or the one before, or the add field when the day fits), never on the
  page. The warning bubble is dropped when the state opens, or if the day fits again before anyone read it.
- The board shows a compact timeline of the work day: meetings, timed tasks, now, and a load meter. The blocks are 14 px
  bars (3:1 or better against the track in both themes), labeled when wide enough, with hours marked every 2 hours and
  a caption under them that follows hover and focus (now and what is next otherwise). They are reachable by keyboard:
  one tab stop, arrow keys between blocks, each with its name and times.
- The check runs from planning until the middle of the work day (after that the review covers it) and when work time
  is left. Load counts today's open tasks (not overdue ones) and only the part of a meeting that is still ahead; a
  timed task inside a meeting isn't counted twice. Blocks of the timeline that overlap stack in rows.

### 5. If-then starts and the 2-minute starter (`brain.ts`, board)
- A task's menu has **Start when…**: after ⟨a meeting today⟩, when I open ⟨app⟩ (recent non-distracting apps, not the one
  in front, or **Another app…**, a small dialog for a name of 3+ letters: the start of the app's name word by word, or of
  its program's, ignoring case and a trailing ".exe", so "fig" and "Figma.exe" are both Figma), after lunch (13:00). The
  dialog says which app seen lately the name matches; a name that matches none is still kept, and the confirmation says
  so kindly. A plan's chip uses the words of its menu entry ("⏱ after “Team sync” (12:00)"). An app plan fires when the app comes to the front after the plan was made. Stored locally for
  the day; fires once with "As planned: ⟨task⟩" and **Focus now** / **Later** (the user asked for it, so it is not
  counted against the budget and not held; **Later** re-arms it for 30 minutes). A plan whose meeting moved or was
  cancelled is dropped at the calendar sync. The diary only says what kind of plan it was.
- **▶ Try 2 minutes** (task menu and the stuck-task bubble) starts a 2-minute focus on the task ("just open it");
  when it ends the pet offers a normal focus session or "that's enough". While a focus session is running, the menu
  asks first ("You're 12 minutes into a focus session. Switch to 2 minutes?").

### 6. Bubbles and the open board
- An urgent bubble that announces or asks something (a meeting, a timed task, "is it done?") shows as a banner at the
  top of the open board, with its words and buttons, and so does the day's "Move some?" check-in, which isn't urgent: it
  is read there once, so when the board closes it isn't shown again over the pet. The quiet replies ("Added ✔︎") stay out
  of the way (the board has its own note), and the rest wait for the board to close. Escape on a banner's button closes
  the banner, not the board.
- Every bubble can say when it stops being true: the meeting it announces has started, the task it names is gone or
  done, the focus session it confirms was stopped, the day no longer runs over. A stale bubble is dropped unseen, at
  once when its subject changes and at the latest at the next beat; that is no refusal and costs nothing (the
  reminder it counted is given back).
- The demo panel can show what the browser can't otherwise: **Day's end** (the review bubble, past the gap between
  bubbles), **Next morning** (the clock moves to 8:20 on the next workday: what you moved to tomorrow comes back as
  today's tasks, with the greeting, the frog and the note) and **Friday** (16:30 with weekends off, so "tomorrow" is
  "Monday").

## v0.5 "Game"

Why: research proposals 9–12. The companions people keep open all day give the pet something to make while you
focus (Focus Friend), reasons to come back on a timer (Finch's adventures, Bongo Cat's chests), limited seasonal
sets, and gentle failure. Rewards stay cosmetic, random rewards have published odds, and nothing is ever sold.

### 1. Crafting while you focus, and the pet's home
- During a focus session the pet knits (a yarn ball and needles beside it, an item growing), but only while you're
  actually working on it: not idle (input within a minute) and not on a distracting app or site. A whole session of
  25 minutes or more of that real focus (at the session's own length) finishes one **home decoration**; a shorter
  session ("Try 2 minutes") knits its share, and abandoning one keeps the progress for next time. There is no
  top-up at the end: an item is finished only when its progress really reaches 100%, and the moment it does, even
  mid-session.
- Being on a distracting app or site for 30 s during focus **drops a few stitches** (−10% progress, never below 0,
  never loses a finished item).
- About 12 decorations (rug, plant, lamp, cushion, bookshelf, mug, poster, garland, fish bowl, radio, blanket,
  lantern), drawn in the house style, given in random order; once all are owned a finished item gives +30 XP, at
  most 90 XP a day.
- **Home:** a small corner of the taskbar strip shows up to 3 chosen decorations (board → Home; `prefs.showHome`).

### 2. Expeditions
- When today's plan is complete the pet offers a trip ("Back at 16:30") with **Go!** / **Stay** (Stay holds for the
  rest of the day, restarts included). While it is away (2 h, or until work ends) a small sign stands in its place
  (click to call it back) and non-urgent bubbles pause. A call-back in the first 30 minutes brings no souvenir, and
  the sign says so, but it doesn't use up the day's trip.
- It returns with a **souvenir** from one of ~16 places (Hội An lantern, Đà Lạt strawberries, Hạ Long pearl, Sa Pa
  postcard, Kyoto fan…) and a postcard entry in the diary. Souvenirs fill a shelf in the wardrobe. One trip a day.

### 3. Chests, published odds and seasonal sets
- Every 30 minutes of active work (in work hours, not idle, not distracted) earns a chest, at most 3 a day; finishing
  a task opens one. The pet says so once per chest in a small, silent bubble (not counted against the reminders),
  and the board shows a 🎁 with the number waiting. The odds are shown in the wardrobe: common 70% (+20 XP or a 🍪), rare 25% (a new accessory),
  legendary 5% (a seasonal or golden item). Duplicates turn into XP.
- The accessory catalog grows from 6 to about 18 in the existing head, neck and face slots (beanie, flower crown,
  party hat, nón lá, Santa hat, witch hat, red Tết scarf, bell collar, bandana, heart glasses, round glasses, star
  glasses).
- **Seasons:** Tết (Lunar New Year, two weeks around it), Trung Thu (Mid-Autumn, a week around it), Halloween
  (Oct 20–Nov 1) and Christmas (Dec 15–Jan 1). Lunar dates come from a table for 2026–2032. Seasonal items drop only
  in their window and the wardrobe shows how many days are left.

### 4. Weekly chapters and a Monday fresh start
- The first greeting of the week frames a fresh start with last week's recap (tasks, stickers, trips).
- The diary groups days into weekly chapters with a one-line recap.

### With v0.4
- The trip offer is a check-in like the morning greeting or the resume card: it has no reminder kind, so it is never
  counted against the nudge budget, and closing it is a **Stay**, not a refusal. Only counted reminders have a kind.
- **Done for today** holds the trip offer and the "I found a chest" note until the next workday, like every other
  non-urgent bubble. Chests still accrue silently meanwhile, and the note comes once the pet is awake again.
- The end of a **Try 2 minutes** starter says what was knitted, and a chest earned meanwhile, like a full session.

## v0.6 "Friends" (Bạn bè)

Why: research proposal 13. A friend streak goes with completing more days (Duolingo, correlational), and
collaboration plus a little competition beats competition alone. The plan left the server and privacy choice open.
**Decision:** no server, in line with "no servers of its own". Friends swap **pet cards**: short text codes sent over
any chat app. That means nothing to host or pay for, and no data leaves the PC unless you send your card yourself.
Cards are **signed** (Ed25519, one key pair per install, the secret half in Credential Manager and never in JavaScript),
so a friend's card can't be forged or changed on the way, and a newer card from a friend can only come from their install.
A friend can still write any task count on their own card, so what one card can do to the blob is capped at their share (15; §3): a
typo or a cheat can't pay the receiver a 🏅 on its own, and with no rankings and no penalties there is nothing more to cheat for.

### 1. Pet cards (`src/core/friends.ts`, `src-tauri/crates/todopet-core/src/card.rs`)
- **Format:** `TODOPET1.<payload>.<signature>`, at most 1630 characters (a real card is about 550).
  - `payload` is the base64url (no padding) of the card's JSON; `signature` is the base64url of the Ed25519 signature
    (64 bytes, 86 characters) of the exact payload bytes.
  - A friend's identity is the **public key** `pk` in the payload (43 characters), not a name.
- **Card fields:**
  - format version and `pk`, the install's public key;
  - pet name (≤ 20 chars, plain text), species, up to 3 worn accessories, growth stage;
  - ISO week key and tasks finished that week;
  - a 28-day history ending on the card's date, one char per day: `G` goal met, `R` rest (a day off or weekend, or a day
    too packed with meetings to count), `-` nothing or kept (a card doesn't say how many tasks you did);
  - the date issued.
  - No streaks: the buddy streak is worked out from the two histories.
- **Never in a card:** task titles, times, app names, or the user's name.
- **The key.** Every install makes an Ed25519 key pair on first use. The secret seed lives in Credential Manager
  (`TodoPet` / `card-key`) and never reaches JS. The overlay window alone may call `card_public_key`, `card_sign`,
  `card_verify` and `card_reset_key`; Rust checks sizes and strict base64url.
- **Reading a card:**
  - Parsing is strict: size cap, schema check, known species and accessories only, numbers range-checked, dates validated.
  - The signature is then verified through the backend with the card's own `pk`: only a card that checks out is added. A
    card that doesn't gets "This card doesn't check out; ask your friend to copy it again." (never repeating what it says).
  - Your own card (`pk` is yours) can't be added, and neither can one of your own *older* cards: the public keys of your earlier
    identities are kept in the friends document (the last 10, public halves only), and a card with one of them is refused as
    "That's one of your own older cards".
  - A newer card with the same `pk` replaces the older one, quietly: only that key could have signed it.
  - At most 12 friends.
- **Make a new card identity** (Friends sheet, after a confirmation) replaces the key: your next cards carry a new `pk`,
  friends see a new person and can remove the old entry, and the first visit of the day waits again. Your friends list stays,
  and the key you had is remembered (public half, the last 10) so that an old card of yours, pasted back from a chat, is not added as a friend.
- Friends, the day's visits and your older public keys are stored under a new key `friends` (overlay window only, at most 64 KB).

### 2. Buddy streak
- For each friend, count back from the latest day both histories cover.
- A day where both hit their goal (`G`) adds 1.
- A day where either rested (`R`) is skipped and doesn't break the streak.
- Anything else ends it.
- It grows each time cards are swapped; the sheet says when the friend's card is from.

### 3. Weekly co-op boss
- **"The Procrastination Blob" 👾:** its HP is 15 per member (you + friends with a card from this ISO week).
- **Damage:** your tasks finished this week, counted live, plus each friend's `weekDone` from their latest card that week,
  **each person counting up to their share, 15**. The blob needs everyone, and one card that says 999 can't beat it alone. The
  sheet shows each person's real number and says "(each person counts up to 15)" in its help line.
- **Win:** when HP reaches 0 everyone wins: +50 XP and a 🏅 in the sticker book, once a week.
- **No losing, no penalties.** The blob resets on Monday.

### 4. Visits
- A friend whose card is at most 7 days old may visit at most twice a day, and only at a calm moment: not typing, not
  focusing, not in a meeting or a call, not done for today, not quiet, hidden or full-screen.
- Their pet walks in beside yours for about 25 s, with a small label: "⟨name⟩ dropped by! 🔥 buddy streak N".
  Clicking it opens Friends.
- A visit is ambient, not a bubble, so it doesn't count against the nudge budget.

### 5. Friends sheet (board)
Top to bottom (v0.6 evaluation, issue 1: the friends are the point, so they are the first thing, not 8 lines of base64):
- **Friends list:** each friend with their pet, buddy streak, the pet's kind and their card's date, and Remove (after a
  confirmation). The rule of the buddy streak is said once, in a small line under the heading that the list refers to
  (`aria-describedby`), not on every row.
- **This week:** the blob (a small drawing in the pets' style: a smug violet jelly that breathes, and a dizzy grey one with
  stars once beaten) with an HP bar and who contributed (each person's real count; up to 15 of it hurts the blob).
- **My card:** one compact row, **Copy my card**, with a small **Show** that opens the card's text (read-only) and
  **Make a new card identity** (asks first).
- **Add a friend:** one compact row; the button opens the paste box (and puts the keyboard in it), then **Add**. A draft already
  in the box keeps it open.
- **What's on a card?:** a folded row that opens a short list of exactly what a card contains: the pet's looks, this week's task
  count, the 28-day goal/rest record (and that a rest can be a packed day), the date, and the public key that links your cards until
  you make a new identity; and that it never holds task titles, times, app names or your name.
- At 1024×700, in every board placement (the "above" one has a 365 px body), at least one friend is visible when it opens;
  the board is 404 px wide at most.

### 6. As built (interpretations)

Where the sections above left room, this is what v0.6 does. Tests are in `src/core/friends.test.ts`,
`friends.life.test.ts`, `brain.friends.test.ts` and `src/overlay/board.test.tsx`; the Rust key list in `validate.rs`.

- **Card text** (`TODOPET1.<payload>.<signature>`, UTF-8 JSON, base64url without padding in both parts): the JSON has `v` (1), `pk`
  (the public key, 32 bytes as 43 characters), `name`, `species`, `accessories` (≤ 3, one per slot), `stage` (0–4), `week`
  (`2026-W44`, the ISO week of `date`), `weekDone`, `history` (28 × `G R -`, oldest first, ending on `date`), `date`. Exactly
  these keys, in this order when made; an extra key (`id`, `streak`, `best`) is refused. Whitespace anywhere in the pasted text
  is ignored (chat apps wrap lines). The parts are strict base64url: padding, the standard alphabet and a spelling with spare
  bits set are refused, and so is a payload with a byte order mark.
- **The history publishes less.** The pet remembers a kept day (`K`: a task done, the goal not met) for itself; a card says `-`.
  A `R` can mean a rest day or a day too packed with meetings to count (an excused busy day), and the privacy note says so.
- **Signatures.** `verify_strict` is used (weak keys and malleable signatures are refused). `card_sign` signs the exact UTF-8
  of the payload JSON, at most 2 KB; the JS side verifies the same string it parses. In the browser demo (and `--demo`) the
  backend is a clearly marked stand-in, `src/backend/demoCards.ts`: deterministic scrambles, **not** cryptography, so the
  sample friends' cards go through the same path as real ones.
- **"Numbers clamped"** is read as range-checked: a number that is not a whole number in range (streaks 0–9999, tasks
  of the week 0–999, stage 0–4) is a damaged card and is refused with a kind message. The one clamp: a `best` lower
  than `streak` is raised to it. A name is 1–20 code points of plain text, trimmed, with no control, bidi-override or
  zero-width characters (the joiner stays for emoji), at least one visible character (the Hangul fillers U+115F, U+1160,
  U+3164 and U+FFA0, the blank braille U+2800, the grapheme joiner U+034F and no-break spaces don't count) and at most 2
  combining marks in a row. A date more than one day ahead is refused (a friend a time zone
  ahead is already tomorrow).
- **Friend list.** A card from a known `pk` replaces theirs in place when it is from the same day or later (the last visit
  is kept); an older one is refused ("I already have a newer card from this friend"). The 13th friend is refused; a known
  friend can still update when the list is full. Cards read back from disk are checked as strictly (but never dropped for
  being dated ahead of a clock that was set back); only the first 12 entries of the file are read, and a last visit later than
  now is brought back to now.
- **Names.** A friend's name is shown in a `<bdi>` everywhere (a right-to-left name can't reorder the words around it). A
  name that, folded (NFKC, case, accents and joiners aside), equals my pet's name, "You" or "Bạn" is shown with the friend's
  species beside it everywhere (the list, the boss's helpers, the visitor's label, the Remove question and the statuses).
  - A name that passes for mine and already is the name of its pet's species (a pet that kept its default name) shows only the
    species' emoji beside it, "Mochi (🍡)", not the same word twice.
  - **Friends who share a name** (folded the same way) also get a short tag from their public key, "Mai · #a3f" (`#` and the
    first 3 characters of a hash of the key; longer only for a name whose tags would collide), in the same places and in the
    aria labels, so two "Mai" can be told apart and the right one removed. A friend with a name of their own has none. The
    tag is the same wherever it shows and does not change when other friends join or leave.
- **The record of days** is `LifeState.history` (day key → mark, the last 28 days), written by `closeDay`: `G` goal met
  (even on a day off), `K` a task done, `R` a day off with nothing done or a busy day that was excused, `-` otherwise
  (a missed workday, frozen or broken, or a day the app never saw). Days nobody settled (the PC was off) are `R` on a
  day off and `-` on a workday when the card is made, and today is marked live. Older saves get their perfect days as `G`.
- **Buddy streak.** The day a card was made is still open on that card (the pet may not have had its day yet): it counts
  only if both hit the goal and never ends the streak. Closed days follow §2 exactly. At most 28.
- **Boss.** Weeks are ISO weeks (Monday to Sunday, like the pet's own weeks). Alone you can beat it (15 HP). **Each person
  counts for 15 at most**, you (your live count) as much as a friend (their card): the blob has 15 HP per member, so it takes
  every one of you, and a card that says 999 (a typo, or someone's idea of a joke) is 15 and no more. Tested in
  `friends.test.ts` and `brain.friends.test.ts`. The win is
  paid once per ISO week (`LifeState.bossWins`), as +50 XP and a 🏅 that takes a slot on the sticker page after the
  🌟 (`pageMedals`; a full page pays its own +50 XP and 🍪) and counts as a sticker in the week's recap. It is not paid
  while a finished task is still being closed in Todoist (if Todoist refuses, the task comes back), and it is said in
  one small reply when you are around (never counted against the nudge budget). A friend whose latest card is not from this week
  (older, or a time zone ahead) is "waiting", not counted, until a fresh card comes; the sheet says so neutrally.
  - **A win is final.** Once paid, it stays: undoing the task that beat the blob takes that task's own XP back, not the 🏅 or
    its 50 XP, and finishing it again pays nothing more (one reward per ISO week). Tested in `brain.friends.test.ts`.
  - **A win while a close is in flight** is remembered and paid when the closing is done, for the week it was won in, even if
    Sunday midnight passes first (2026-W53 into 2027-W01 is tested). If Todoist refuses the close, nothing is paid.
  - **The notice** ("You beat the blob…") is about its week: once the week is over it is dropped, and it waits for the morning
    greeting instead of taking its place. It is kept in memory only; the 🏅 and the diary keep the record.
- **Visits.** At most 2 a day in all, 2 hours apart; the friend who visited longest ago comes (a tie is settled by the
  brain's random source). The first visit of a day or a session waits 15–75 minutes (a hash of the public key and the
  day, so a restart doesn't re-roll), starts its wait again when you come back after 30 minutes or more away (a night, a
  lunch), and never comes before today's morning greeting has been told. A call app or tab in front is not a calm moment either. Besides §4's conditions (not typing, focusing, in a meeting, done for today, quiet,
  hidden or full-screen) a visit also waits while you are away for 5+ minutes, the pet is asleep or on a trip, a bubble
  is waiting, the board is open or a stunt is going on. A visitor leaves when the moment stops being calm (not for typing
  or a bubble: it keeps still, and hides its label while a bubble shows), when the board opens, or when its friend is
  removed; one that only just walked in is gone at once. Your pet stands still while it is there. The diary says a friend
  dropped by, never whose.
  - **The label** is two short lines: the friend's name (with the species or tag beside it when it has one) and, below it,
    "dropped by! 🔥 buddy streak N". Only the name can be cut with an ellipsis, so a name of 12 to 20 characters never takes the
    streak with it. The same text is its tooltip and screen-reader name.
- **Storage.** The `friends` document: `friends` (the cards and each friend's last visit), the day's `visits` and `oldKeys` (my
  earlier public keys, newest last, at most 10, real keys only); at most
  64 KB, read or written (a bigger file is renamed `.bad` and treated as missing, like a malformed one). A failed read at
  startup (the file can't be opened) is kept in memory only, never written over what is on disk. The Friends sheet is
  also reachable by clicking a visitor or its label (`BoardRequest.friends`).
- **Friends sheet.** The paste box keeps its text in the brain (Escape back to the board and return, and it is still there, and
  open), is focused again after an Add, and "Added Mai!" goes away when typing starts. My card is signed when the sheet opens and
  again when what is on it changes; the "Copied" note goes when the card changes (it is not on the clipboard any more) and Copy
  waits for the new signature. The popover for a new card identity, like Remove's, stays inside the board, above its button when
  there is no room below.
- **Demo.** *Add 2 friends* adds Mai (a card from today) and Bin (two days old), made from sample data and "signed" by the demo's
  stand-in key, through the same path as a pasted card; *Visit* starts a visit now without using up the day's two. Each fresh demo
  load has an identity of its own (a random seed kept in the page's storage, so a reload keeps it), so a card copied in one load is a
  friend's card in another and a real exchange can be tried between two tabs.

## v0.7 "Always fresh" (Luôn mới): update notice and one-click updates

Goal: the user learns about a new version without hunting for it, and installs it with one click, without ever
being nagged. Designed in a dev-team session (PM, Architect, Developer, QA); the decisions below settle the tensions
it raised.

### Decisions

- **Discovery through the GitHub API, not a fixed manifest URL.** Every release is a pre-release and GitHub's
  `/releases/latest` skips those. Rust asks `GET https://api.github.com/repos/trananhtung/todopet-windows/releases?per_page=20`
  and picks the highest strict `vX.Y.Z` tag above the running version (drafts are invisible to it, pre-releases
  count). So a release joins the update channel when a person *publishes* the draft, never on a tag push.
- **One-click needs a signed manifest.** The release workflow attaches `latest.json` and `TodoPet_<v>_x64-setup.exe.sig`
  (Tauri updater format, minisign, signed with `--app-version` so the signature names its version). The app embeds
  the public key and sets `requireSignedVersion`, so a tampered manifest cannot pair a new version number with an
  older, validly signed installer (no downgrades).
- **Only the NSIS (setup.exe) install updates itself.** The manifest has one entry, `windows-x86_64-nsis`. MSI
  installs are per-machine and need an admin prompt, so they get "Open download page" instead. So do dev builds,
  releases without a manifest, and any one-click failure: the download page is always the fallback, so a broken
  updater never strands anyone.
- **Network in Rust only.** Narrow commands (`update_status`, `update_check`, `update_install`, `update_open_page`)
  take no URL from JavaScript; the plugin's own JS API is not granted to any window. URLs are built in Rust from the
  validated tag; the installer URL must sit under `https://github.com/trananhtung/todopet-windows/releases/download/<tag>/`.
- **The signing key never meets project code.** The build job (which runs `npm ci` and cargo) has no secret. A
  separate `sign` job, bound to the `updater-signing` environment, downloads the built setup.exe and signs it with a
  pinned Tauri CLI, then verifies the signature against the public key in `tauri.conf.json` with `minisign` before
  anything is published. A missing secret fails the release loudly.
- **The notice is a kind, once-per-version mention.** It is free (outside the daily nudge budget) but waits for a calm
  moment like any non-urgent bubble (no meeting, no focus session, no screen sharing, no typing flow, no full screen,
  bubble gap respected), and each version is announced at most once. After that it stays quietly findable: tray item
  "✨ Update to 0.7.1", a small chip on the board, and Settings → Updates.

### 1. Rust (`src-tauri/src/updates.rs`, `crates/todopet-core/src/update.rs`)

- Pure core (`todopet-core::update`): strict tag parsing (`v` + three dot-separated numbers, each ≤ 9999, nothing
  else), picking the newest release above the current version from the API's JSON (drafts skipped), building the
  release page and manifest URLs from the tag, checking an installer URL is under the release's download prefix, and
  cleaning release notes to plain text (no control characters, at most 4000 characters and 60 lines).
- Shell (`updates.rs`): the API call uses the shared `api` client (HTTPS only, no redirects) with the GitHub headers,
  a 1 MB body cap and a 20 s timeout. With a manifest and an NSIS install, it builds the plugin's updater with that
  one endpoint and runs `check()`; the result can install only if the announced version equals the tag's and the
  download URL passes the prefix check. The `Update` is cached in managed state for `update_install`.
- Rate limits: a non-forced check reuses the last result if it is younger than 30 minutes; a forced one ("Check now")
  at most every 20 seconds. Failures keep the last good result and report `{ kind, message }`.
- `update_install(onProgress: Channel)`: one at a time; streams `{ phase: "downloading", downloaded, total }`, then
  `{ phase: "installing" }`, then the plugin runs the installer in passive mode with `/UPDATE` and exits; the
  installer relaunches the app.
- Tray: a new item between Diary and Quit, labelled by the page ("Check for updates…" or "✨ Update to 0.7.1"). It
  emits the `update` app command to the overlay, which decides (install if one is ready, else check and answer).
- `e2e-update` cargo feature (never in release builds): reads `TODOPET_E2E_MANIFEST` at start, skips discovery and the
  URL prefix check, installs whatever that manifest offers, logging each step. Used only by the Windows update e2e
  workflow.

### 2. Overlay (`src/core/updates.ts`, `brain.ts`, `Bubble.tsx`, board)

- `prefs.autoUpdateCheck` (default on): first check 2 minutes after start, then every 6 hours.
- Announcement: once per version (`life.updateAnnounced`), at a calm moment, free. Buttons: **Update now** (when it
  can install) or **Download page** (when not), and **Later**. A "What's new" line shows the first highlights.
- Installing: the brain saves everything first, then the bubble shows progress ("Downloading… 45%", "Installing, see
  you in a moment!"). On failure: "I couldn't update myself. Grab it from the download page?" with the button.
- After the update: on the first start of a newer version the pet celebrates once ("I'm on 0.7.1 now! ✨") with the
  notes saved before installing (`life.pendingNotes`), then records `life.lastVersion`. The very first run only
  records the version.
- Board: a small "✨ 0.7.1 is ready" chip while an update is available; clicking it starts the same flow.
- Tray command `update`: install if one is ready; otherwise check now and say "You're on the newest version 👍"
  (or the error, kindly).

### 3. Settings → Updates

Current version; status (up to date / new version / checking / couldn't check); **Check now**; **Update & restart** or
**Open download page**; the release notes; the auto-check toggle; a privacy line ("Asks GitHub about every 6 hours;
sends nothing about you"); for MSI installs, why one-click is off and what to do.

### 4. Verification

- Unit tests: tag parsing and picking, URL checks, notes cleaning (Rust); scheduling, once-per-version, calm-moment
  gating, flows and copy (vitest, fake clock).
- `update-e2e.yml` (windows-latest, on demand and when updater files change): builds an "old" app with the
  `e2e-update` feature and a throwaway key, builds a "new" 9.9.9, signs it, serves the manifest on localhost,
  installs the old app, starts it and waits until the installed version reads 9.9.9 and the new app is running.
- Release: the sign job refuses to publish a signature that does not verify against the embedded public key or does
  not name the tag's version.

## v0.8 "Có hồn" (Alive): a pet that feels alive

Goal: lift "pet craft" from 7.5 to 9 ("genuinely charming; you want to keep it on your taskbar"), following
[research-pet-quality.md](research-pet-quality.md). Proposal #3 (stop drawing when nobody can see the pet) shipped in
0.7.1. This section covers proposal #1; the others get their own sections when they are designed.

### 1. Non-repeating dialogue (`src/core/variety.ts`, `lines.ts`, `life.ts`, `brain.ts`)

Today only 9 situations have more than one line (2–6, picked with `Math.random`, so the same one can come twice in a
row) and most say one fixed line. A user finishing 5 tasks a day hears the same cheer the same day. Designed with the
user and a dev-team session (PM, Architect, Developer, QA); the decisions settle what they raised.

#### Decisions

- **Line functions stay pure and return a pack; the brain picks.** A line function that has variants returns
  `Pack = { key: string; options: readonly (readonly [vi: string, en: string])[] }` (the strings already filled in)
  instead of a string. The brain turns it into text with `this.phrase(pack)`. No hidden global state.
- **One memory for both languages.** Each option is a `[vi, en]` pair, so both languages always have the same count
  and switching language keeps the memory right.
- **Indices and times only, never text.** Lines interpolate task titles, and the pet never stores those. The memory
  stores, per key, when each option (by index) was last said.
- **Context lines are branches with their own key**, not a rule engine: `done.frog`, `done.first`, … (see below).
- **Every task completion keeps its bubble** (it carries Undo). No animation-only completions.
- **A line counts as said when it is chosen.** Rules only compose a counted line when no bubble is showing
  (`runRules` returns early on a bubble), so a chosen line is nearly always shown; marking "on show" would need a
  token threaded through `say()` for almost no gain.
- **Only chatter varies.** Labels, buttons, errors, confirmations, update texts, streak bookkeeping and onboarding stay
  fixed: the user needs those to read the same every time.

#### Choosing (`variety.ts`, pure)

- Memory: `LifeState.said: Record<string, { n: number; at: number[] }>`. `n` is the pack's option count when it was
  last used; `at[i]` is when option `i` was last said (epoch ms, 0 = never).
- `chooseLine(n, entry, now, random) → index`:
  1. An entry whose `n` differs from the pack's is ignored (the pack changed since): every option counts as never said.
  2. **Fresh** options were never said or were said 48 h ago or more (`FRESH_MS = 48 h`). If there is any, pick one at
     random among them. So within 48 h every option is used once before any comes back.
  3. Otherwise (a small pack said often): the **least recently said** option; ties go to the lowest index. It cycles
     through the pack and, with 2+ options, never says the same line twice in a row.
  4. A time in the future (the clock went back) counts as "just now".
- `remember(entry, n, index, now) → entry`: a new entry with `at[index] = now`, every other time clamped to `≤ now`
  (so a clock that went back stops holding lines for longer than 48 h), length exactly `n`.
- Packs with one option are returned as is and never stored.
- `withEntry(said, key, entry)` adds or replaces a key and keeps at most `MAX_KEYS = 200` keys, dropping the ones
  used longest ago (by their newest time).

#### Loading (`lifeFromJson`)

- `said` must be an object; anything else gives `{}`. Keys must match `/^[a-z][a-zA-Z0-9.]{0,63}$/`; others are
  dropped. `n` must be an integer in 1…40 (`MAX_OPTIONS`); otherwise the key is dropped.
- `at` keeps its positions: a missing, non-numeric, non-finite or negative entry becomes 0 (never said), never removed,
  so indices never shift. It is cut or padded with 0 to length `n`.
- More than 200 keys: the ones used longest ago are dropped.
- Saved with the batched `routine` life save (within 60 s). A lost minute of memory only means a line may come back
  early.
- Older versions (0.7.x) ignore the field and drop it on their next save; coming back to 0.8 starts the memory again.

#### Brain (`brain.ts`)

- `private phrase(pack: Pack): string` chooses with `this.random` and the brain clock, records the choice in
  `life.said` (routine save) and returns the text in the current language.
- Every call site of a pack-returning line goes through it (`say`, the done bubble, `speak`, the morning greeting).
- Callers that combine lines (the morning greeting = time-of-day greeting + body) phrase each pack on its own.

#### Context lines for a finished task

`lines.done(task, ctx)` takes `{ completed, target, sound, frog, stuck, hour, weekday }` and returns the first that
applies, in this order (most specific first):

| Priority | Key | When |
|---|---|---|
| 1 | `done.target` | this completion reaches today's target (`completed === target`) |
| 2 | `done.stuck` | the task was on the "postponed" list (`state.stuck`) when it was finished |
| 3 | `done.frog` | it was today's frog (`day.frogId`, picked in the evening's Wrap up) |
| 4 | `done.first` | the first task finished today |
| 5 | `done.early` | before 9:00 |
| 6 | `done.friday` | Friday from 15:00 |
| 7 | `done` | everything else |

The extra lines of the bubble (golden treat, combo, level up, chest…) are appended as today.

#### Content

- **Voice.** The pet says "mình" and calls the user "bạn" (VI), "I"/"you" (EN). Warm, casual, never scolding (worried
  and helpful when things slip, as in v0.3). Chatter at most about 90 characters before a task title is filled in;
  `done*` lines at most about 60, since the bubble also holds Undo. At most one emoji, at the end. Both languages say
  the same thing in spirit, not word for word. `${sound}` (the species' voice) may appear in `done*` lines.
- **Append only.** New options go at the end of a pack. Removing or reordering one changes `n` or shifts indices,
  which resets or confuses that key's memory once; do it only when needed.
- **Targets** (options per key; the existing lines count):

| Area | Keys and targets |
|---|---|
| Greeting and morning | `greeting.{morning,midday,afternoon,evening}` 4 each; `morning.{plan,frogPicked,frog,plain}` 6 each |
| Planning and nudges | `plan.{normal,annoyed,angry}` 6 each; `nudge.{normal,happy,annoyed,angry}` 8 each; `overdue` 6 |
| Distraction | `distraction` 8, `distraction.angry` 4; `grumble` 6, `parade` 6, `block` 5 |
| Finishing | `done` 20; `done.{target,stuck,frog,first}` 6 each; `done.{early,friday}` 5 each; `allDone` 8; `planComplete` 6 |
| Pet life | `hungry` 6, `dirty` 5, `cleaned` 4, `golden` 4, `combo` 5, `levelUp` 4, `streak` 6 |
| Focus and breaks | `focusStart` 6, `focusEnd` 6, `breakStart` 5, `breakEnd` 5, `backToWork` 6, `welcomeBack` 8 |
| Starters and postponed | `starterStart` 4, `starterEnd` 4, `starterEnough` 4, `stuck` 6, `splitDone` 3 |
| Meetings and timed tasks | `soon` 4, `dueNow` 4, `meetingOver` 4 |
| Day's end and week | `review` 6, `lateNight` 5, `newWeek` 5 |
| Trips | `tripOffer` 5, `tripStart` 4, `tripBack` 5, `tripStayed` 3 |
| Tips and voice | `tip` 14; `voice.{cheer,grumble,angry,block,hungry}` 6, 4, 4, 3, 3 |

  About 360 chatter options in all (about 300 new per language), plus the fixed lines.
- **Batches.** Written and reviewed in batches of about 40 options, most frequent first: finishing, nudges and
  planning, greeting and morning, then the rest. Each batch is reviewed by the user (Vietnamese) as a table
  `key | VI | EN` before it is merged.
- Out of scope: chest, craft and wrap-up lines (in `chests.ts`, `craft.ts`, `wrapup.ts`), labels, errors, updates.

#### Phases

1. **Engine and plumbing, same words.** `variety.ts` with tests; `LifeState.said`; `phrase()`; every varied line
   function returns a pack built from today's lines; call sites move to `phrase()`. Behaviour changes only in that a
   line never repeats while a fresh one is left. All tests green.
2. **Content**, in the batches above, each with its review table.

#### Tests

- `variety.test.ts`: the rules above, and a 30-day simulation with a seeded random and a fake clock (15 completions a
  day): no option repeats within 48 h while a fresh one is left; never the same option twice in a row with 2+ options;
  a clock that goes back a year recovers within 48 h; `n` changing resets the key; the key cap drops the oldest.
- `life` loading: a table of bad `said` values (not an object, bad keys, `n` out of range, `NaN`, strings, negative
  numbers, `at` too long or short, more than 200 keys): nothing throws, positions are kept, bad entries count as never
  said.
- Content lint (`lines.test.ts`), over every pack each line function can return (called with sample arguments,
  including a 60-character title): keys match the pattern; 1…40 options; no empty or duplicate string in a pack;
  the same `${…}` placeholders filled in both languages (checked by passing marker values); length limits per the
  voice rules; each key's option count is at least its target (phase 2 only).
- Brain: finishing 15 tasks in a day gives 15 different `done` lines; every completion bubble made through the pet
  still has Undo, whatever its context; the saved life, after a day with a task titled with a sentinel string,
  never contains that string; the memory survives a restart (saved and loaded back).
- Existing tests that assert a fixed line accept any option of its pack instead.
