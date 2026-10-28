# TodoPet for Windows — design spec

A Windows port of [TodoPet](https://github.com/trananhtung/todopet) (macOS, Swift): a desktop pet that lives on
top of the taskbar, reads your Todoist tasks, asks you to plan 3 tasks a day, reminds you, and gets happy or
grumpy with your progress. English and Vietnamese.

**What's new on Windows:** 14 pet species instead of one (12 from the start, 2 unlocked by milestones), each
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
| Storage | Small JSON files (atomic writes) in `%APPDATA%\com.trananhtung.todopet`; diary as daily JSONL files in `%LOCALAPPDATA%` | Prefs, pet life, postponed-task log; the diary keeps 14 days. Browser demo uses `localStorage`. |
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
   annoyed ≥ 30, grumpy below; sleeping at night / idle 10 min; focus; celebrating. Grumpy pet marches
   toward the cursor. Hovering the reason line on the board shows the breakdown.
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
11. **Pet life.** Fullness (+25 per task, −7/work hour), dirt (lazy workdays, up to 3, flies), XP and stages
    Baby → Kid → Teen → Grown-up → Master, random celebrations (jump, spin, flip, dance), 10% golden treat,
    combos within 30 min → fireworks, accessories (bow, scarf, sunglasses, top hat, crown, grad cap)
    unlocked by milestones, sticker book of perfect days.
12. **Mischief** when slacking: grumble after 10 min annoyed, sign parade after 10 min grumpy, table flip
    (╯°□°)╯︵ ┻━┻ jumping into the middle of the screen after 5 min on a distraction while grumpy; at most
    one stunt per 20 min; "Spare me 15'" button; never during meetings, focus, typing or while away.
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
| Dragon (unlock: 7-day streak) | float | horns, wings, spiky tail, tiny smoke puff when grumpy |
| Unicorn (unlock: 50 tasks) | hop | horn, rainbow mane |

Every species renders every mood (eyes, mouth/beak, brows, cheeks, sweat, steam, Zzz, focus headband),
every stage (size, sprouts on babies), hunger (thinner, rumble), dirt levels (smudges, flies), all six
accessories at species-specific anchor points, golden variant, and the celebration poses. The species
picker in Settings shows a live preview; locked species show their requirement.

## Privacy

No analytics, no servers of its own. Network: `api.todoist.com`, your ICS links, and `api.anthropic.com`
only when you press Ask Claude. Browser titles and tab addresses stay in memory. Raw Input stores only the time
of the last key-down. Secrets (tokens, ICS links) live in Credential Manager; everything else is local. See
[SECURITY.md](../SECURITY.md).

## Thin vertical slices

1. **Scaffold + first end-to-end path:** Tauri shell, overlay with one pet walking, demo backend, board with
   today's tasks, complete → celebration + feeding. CI builds the Windows installer.
2. **Core logic port** with tests: dates, models, mood, life, calm, stuck, sites, lines, prefs, brain rules.
3. **Species:** 14 species, all moods/stages/accessories, gallery page, picker.
4. **Windows backend:** Todoist, Credential Manager, foreground app + browser URL, idle/typing, tray,
   hotkey, autostart, single instance, fullscreen hide, ICS fetch, Claude split, diary files.
5. **Full UI:** bubbles with actions, board (all actions), focus, review, mischief, settings, diary.
6. **Polish + release:** README (EN/VI) with screenshots, icon, release workflow.
