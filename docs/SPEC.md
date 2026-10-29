# TodoPet for Windows — design spec

A Windows port of [TodoPet](https://github.com/trananhtung/todopet) (macOS, Swift): a desktop pet that lives on
top of the taskbar, reads your Todoist tasks, asks you to plan 3 tasks a day, reminds you, cheers your progress and
worries (and offers help) when things slip. English and Vietnamese.

**What's new on Windows:** 24 pet species instead of one (21 from the start, 3 unlocked by milestones), each
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
| Storage | Small JSON files (atomic writes) in `%APPDATA%\com.trananhtung.todopet`; diary as daily JSONL files in `%LOCALAPPDATA%` | Prefs, pet life, postponed-task log, today's "start when…" plans (`triggers`, v0.4), tomorrow's frog and note (`plan`, v0.4); the diary keeps 14 days. Browser demo uses `localStorage`. |
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
of the last key-down. Secrets (tokens, ICS links) live in Credential Manager; everything else is local. See
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
  as a reminder), from an hour before work starts, on that day only.
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
  far to scroll to; the buttons stay in reach below. Escape goes back to the list, like **Back**.
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
  is also shows in plain words in the strip's header ("~3h45 over"), and tapping it opens the same state. The warning
  bubble is dropped if the day fits again before anyone read it.
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
- An urgent bubble that announces or asks something (a meeting, a timed task, "is it done?", "Move some?") shows as a
  banner at the top of the open board, with its words and buttons. The quiet replies ("Added ✔︎") stay out of the way
  (the board has its own note), and the rest wait for the board to close.
- Every bubble can say when it stops being true: the meeting it announces has started, the task it names is gone or
  done, the focus session it confirms was stopped, the day no longer runs over. A stale bubble is dropped unseen, at
  once when its subject changes and at the latest at the next beat; that is no refusal and costs nothing.
- The demo panel can show what the browser can't otherwise: **Day's end** (the review bubble, past the gap between
  bubbles), **Next morning** (the clock moves to 8:20 on the next workday: what you moved to tomorrow comes back as
  today's tasks, with the greeting, the frog and the note) and **Friday** (16:30 with weekends off, so "tomorrow" is
  "Monday").

## v0.5 "Game"

Why: research proposals 9–12. The companions people keep open all day give the pet something to make while you
focus (Focus Friend), reasons to come back on a timer (Finch's adventures, Bongo Cat's chests), limited seasonal
sets, and gentle failure. Rewards stay cosmetic, random rewards have published odds, and nothing is ever sold.

### 1. Crafting while you focus, and the pet's home
- During a focus session the pet knits (a yarn ball and needles beside it, an item growing). A completed session
  finishes one **home decoration**; abandoning it keeps the progress for next time.
- Being on a distracting app or site for 30 s during focus **drops a few stitches** (−10% progress, never below 0,
  never loses a finished item).
- About 12 decorations (rug, plant, lamp, cushion, bookshelf, mug, poster, garland, fish bowl, radio, blanket,
  lantern), drawn in the house style, given in random order; once all are owned a session gives XP.
- **Home:** a small corner of the taskbar strip shows up to 3 chosen decorations (board → Home; `prefs.showHome`).

### 2. Expeditions
- When today's plan is complete the pet offers a trip ("Back at 16:30") with **Go!** / **Stay**. While it is away
  (2 h, or until work ends) a small sign stands in its place (click to call it back) and non-urgent bubbles pause.
- It returns with a **souvenir** from one of ~16 places (Hội An lantern, Đà Lạt strawberries, Hạ Long pearl, Sa Pa
  postcard, Kyoto fan…) and a postcard entry in the diary. Souvenirs fill a shelf in the wardrobe. One trip a day.

### 3. Chests, published odds and seasonal sets
- Every 30 minutes of active work (in work hours, not idle, not distracted) earns a chest, at most 3 a day; finishing
  a task opens one. The odds are shown in the wardrobe: common 70% (+20 XP or a 🍪), rare 25% (a new accessory),
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
