<p align="center"><img src="docs/icon.png" width="128" alt="TodoPet icon"></p>

<h1 align="center">TodoPet for Windows</h1>

<p align="center">
A desktop pet for Windows 10/11 that lives on top of your taskbar, reads your <a href="https://todoist.com">Todoist</a> tasks,
<b>cheers you on when you work</b> and <b>worries (and helps) when things slip</b>. Now with <b>24 species</b>.<br>
English · <a href="README.vi.md">Tiếng Việt</a> · Windows port of <a href="https://github.com/trananhtung/todopet">TodoPet for macOS</a>
</p>

![The species](docs/species.png)

## What's new on Windows

- **24 pets instead of one.** Mochi (the original round cat-eared mochi), Cat, Shiba, Bunny, Fox, Panda, Penguin, Frog, Hamster, Axolotl, Capybara, Duckling, Red Panda, Sea Otter, Hedgehog, Koala, Pygmy Hippo, Seal Pup, Owlet, Lamb and Piglet from the start, plus a **Bee** (unlocked after 20 finished tasks), a **Baby Dragon** (unlocked by a 7-day streak) and a **Unicorn** (unlocked after 50 finished tasks). Each one has its own body, gait (bounce, hop, waddle, float or scurry) and voice, and all of them share the moods, growth stages, hunger, dirt, accessories and celebrations. Pick yours in **Settings → Pet**.
- **Native Windows integration.** Lives above the taskbar on your primary monitor, clicks pass through everywhere except the pet, its bubbles and the board. Tray icon with mood and progress (`😊 2/3`, `🍅 18:42`), **Ctrl+Alt+T** to add a task from anywhere, start with Windows, and it hides while a full-screen game, video or slideshow is in front.
- **Any calendar.** Paste an ICS link (Google Calendar's "Secret address in iCal format", Outlook's "Publish calendar", iCloud) instead of relying on a system calendar. Recurring meetings and their exceptions are handled.

## What it does

Everything from the macOS app:

- **Walks around your screen.** It wanders along the taskbar, looks at your cursor, and stops and blushes when you hover it. Drag it anywhere and it falls back down.
- **Asks "what are we doing today?"** If today has fewer than **3 tasks** (configurable), it asks you to plan, gently in the morning and more insistently once the planning deadline passes.
- **Reminds you of the right task** with "eat the frog" ordering, nudges every 45 minutes, and pings you 10 minutes before timed tasks.
- **Has real moods.** It celebrates every finished task (including ones you tick off in Todoist). When tasks are overdue or nothing moves for hours it gets worried and offers help: a fresh start for overdue tasks, a focus session, splitting a big task. It only gets grumpy while you're on a distracting site or app, and then it marches toward your cursor 😤
- **Lets you work with Todoist from the pet.** Click it for today's tasks: complete, add (Today / Tomorrow / No date / full quick-add syntax like `Call Anna 3pm p1 #Work`), move, delete (after a confirmation), focus, split.
- **Focus timer**, **end-of-day review**, **time-block suggestions** in your free gaps, and **splitting tasks you keep postponing** into 15–30 minute steps (optionally with Claude).
- **Catches distracting websites and apps.** It reads the active tab's address in Chrome, Edge, Brave, Vivaldi, Opera and Firefox through Windows UI Automation (falling back to the window title), and the name of the app in front.
- **A pet that lives with your work:** fullness, dirt and flies after missed days, XP and five growth stages, random celebrations with a rare golden treat, combos and fireworks, accessories to unlock, and a sticker book whose pages start with two gift stickers. Playful mischief (a grumble, a sign parade, then a table flip in the middle of your screen) only happens while you're on a distracting site or app, never in a meeting or while you're focusing (and the grumble and the parade wait for a pause in your typing).
- **Forgiving streaks.** One finished task keeps your streak; a snack from your stash saves a missed day, a broken streak can be repaired the next workday, and days off, days the PC is off and packed meeting days never count against you.
- **A daily nudge budget:** at most 8 unsolicited reminders a day (you choose), and the ones you keep closing come less often.
- **"Where was I?"** After 5+ minutes away, a meeting, or a 2+ minute detour on a distracting site, the pet shows what you were on (the task, the app and the page) with **Reopen ↗ ⟨site⟩**, **Focus** and **Something else**. It never shows while a call is in front, never names a private window's page, and **Settings → Behavior → Calm** can turn the page title and address off. **📌 Pin my place** on the board keeps your spot with a one-line next step. It isn't counted against the nudge budget, but it comes at most every 30 minutes.
- **Meeting bookends.** The "meeting soon" bubble lists up to 2 related tasks; after a meeting of 15+ minutes the pet asks "Anything to capture?" (**＋ Next step** opens the add field with the meeting's name in it) and suggests a 5-minute breather when the next meeting is close.
- **If-then starts and a 2-minute starter.** A task's **⋯** menu has **Start when…** (after a meeting, when I open an app, after lunch) and **Try 2 minutes**, a tiny "just open it" session that ends with an offer for a full one or a kind "that's enough".
- **A shutdown ritual.** When the day is almost over (or from the board's day strip after 15:00) **Wrap up** shows today's wins, lets you send each unfinished task to **Tomorrow**, take it off the plan (**No date**) or keep it, pick **tomorrow's frog** and leave yourself a one-line note. **Done for today** puts the pet to sleep and quiet until your next workday starts (meetings and timed tasks still get through). The next morning's greeting names the frog and the note, and the frog goes first that day.
- **An overbooked warning and a day strip.** The board shows your work day as a compact strip (meetings, timed tasks, now) with "~6h / 7h left". Once a day, after planning, if tasks plus the meetings still ahead run an hour or more past the time left, the pet says so kindly and offers **Pick tasks to move**. Tasks without a Todoist duration count for the default length in Settings (30 minutes). Not counted against the nudge budget.
- **Designed not to break your focus:** it interrupts only at a pause, holds non-urgent bubbles while you're in the zone, spaces bubbles at least 15 minutes apart, keeps still while you type, and is quiet by default.
- **A diary** of every reminder and why it fired, to tune it to how you work.
- **English and Vietnamese.**

![Board](docs/board.png)

| Bubble | Mischief | Settings |
|---|---|---|
| ![Bubble](docs/bubble.png) | ![Table flip](docs/flip.png) | ![Settings](docs/settings.png) |

## Install

Download the latest installer from **[Releases](https://github.com/trananhtung/todopet-windows/releases)**: `TodoPet_x.y.z_x64-setup.exe` (per-user, no admin) or the `.msi`. Windows 10 (1803+) and 11 are supported; the WebView2 runtime that ships with Windows is used.

> The installer isn't code-signed yet, so SmartScreen may say "Windows protected your PC". Choose **More info → Run anyway**.

Want to look around first? Run `TodoPet.exe --demo` to use sample tasks, no account needed.

## Connect Todoist

1. In Todoist open **Settings → Integrations → Developer** ([direct link](https://app.todoist.com/app/settings/integrations/developer)) and copy your **API token**.
2. Click the pet, paste the token and press **Save & connect**.

The token is stored in **Windows Credential Manager** (as `TodoPet`) and is only ever sent to `api.todoist.com` (Todoist API v1). It never reaches the UI layer: the Rust side reads it and makes the calls.

### Calendar (optional)

**Settings → Calendar**, paste one ICS link per line and press **Save**. The links are stored in Windows Credential Manager and never shown again (only their host names):

- **Google Calendar:** Settings → your calendar → *Integrate calendar* → **Secret address in iCal format**.
- **Outlook / Microsoft 365:** Settings → Calendar → Shared calendars → **Publish a calendar** → ICS link.
- **iCloud:** share the calendar as a public calendar and use the `webcal://` link.

### Splitting tasks with Claude (optional)

Add an Anthropic API key in **Settings → Postponed tasks** ([get one](https://console.anthropic.com/settings/keys)). When you press **Ask Claude** in the split view, the task's title and notes are sent to the Claude API, which returns 3–5 small steps. It uses `claude-opus-5-5` at low effort with structured JSON output, with server-side fallback enabled in case a request is declined. You can change the model in Settings.

## Using it

| Action | What happens |
|---|---|
| Click the pet | Opens the task board |
| Hover a task on the board | ▶ focus · ✂️ split · → move · 🗑 delete (asks first) |
| Drag the pet | Moves it; let go and it drops back to the taskbar |
| Right-click the pet / tray icon | Board / tray menu: add task, focus, hide 1 h, quiet 1 h, settings, diary, quit |
| <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>T</kbd> | Opens the board with the add field focused, from any app |
| <kbd>Esc</kbd> | Closes the board |

## How the mood works

The pet keeps a 0–100 happiness score, recalculated every 15 seconds (same formula as the macOS app). Hover the mood line on the board to see the breakdown.

| Makes it happier | Makes it worried |
|---|---|
| +8 per task completed today | −7 per overdue task |
| +30 when today's plan is fully done | −4 per task that's past its time |
| Up to +15 right after you finish something | −12 to −50 when fewer than 3 tasks are planned after the planning deadline |
| +10 during a focus session | Up to −30 when nothing moves for more than 90 minutes |
| Meeting time counts as work | Up to −35 after 2+ minutes in a distracting app or website |
| | −3 per task that keeps getting postponed (up to −9) |
| | Up to −15 when it's hungry · −5 per level of dirt |

Score ≥ 75 is happy, ≥ 50 chill, and anything lower worried. It only turns grumpy (below 30) while you're on a distracting app or site in work hours. Outside work hours, at night, in meetings, or after 10 minutes away it calms down or falls asleep.

## Privacy

- No analytics and no servers of its own. Network traffic goes to `api.todoist.com`, your ICS links, and to `api.anthropic.com` only when you press **Ask Claude**.
- Distraction detection reads the **name of the app in front** and, for browsers, the **address of the active tab** and its page title (window titles of other apps are never read). They stay in memory and are never stored or sent anywhere.
- The **"Where was I?"** card remembers the task, app, page title and address (http/https only) you were on, plus the next step you pin. It lives **in memory only**: never saved to disk, never written to the diary, and forgotten at midnight. Your **Start when…** plans (a task, and a meeting's id and title, an app name or "after lunch") are saved for the day and deleted the day after; the diary only says what kind of plan it was. So are the frog (a task id) and the one-line note from **Wrap up**, until the day they are for is over.
- Typing detection uses Windows Raw Input and records **only the time of the last key-down**: it never reads which key, and it is not a keyboard hook.
- Calendar ICS links are secret addresses, so they're stored in Windows Credential Manager like the tokens, and only public internet addresses are fetched.
- Settings, the pet's life, today's "start when…" plans and tomorrow's frog and note are in `%APPDATA%\com.trananhtung.todopet`; the diary stays on this PC in `%LOCALAPPDATA%\com.trananhtung.todopet` (14 days, can be turned off).
- Spoken lines use the voices built into Windows, offline.

## Development

Built with **Tauri 2** (Rust) and **React + TypeScript**. All logic is plain TypeScript in `src/core` and runs in a browser with a demo backend, so you can work on everything except the Windows integration on any OS.

```bash
npm install
npm run dev            # http://localhost:1420 — open /overlay.html?demo, /settings.html?demo, /gallery.html
npm test               # Vitest: mood, life, calendar, brain rules, pet renderer, motion
npm run typecheck
cd src-tauri && cargo test -p todopet-core   # Rust: validation, Todoist/Claude parsing
npm run tauri dev      # on Windows: the real app
npm run tauri build    # on Windows: NSIS .exe and .msi in src-tauri/target/release/bundle
```

`overlay.html?demo&antic=parade` (or `block`, `grumble`) plays a stunt right away. Releases are built by GitHub Actions on `windows-latest` when a `v*` tag is pushed.

| Path | Role |
|---|---|
| `src/core/brain.ts` | Sync, mood, reminder rules, focus timer, actions (port of `Brain.swift`) |
| `src/core/mood.ts` · `life.ts` · `calm.ts` · `stuck.ts` | Pure rules: mood score, pet life, interruption rules, postponed tasks |
| `src/core/calendar.ts` | ICS parsing (`ical.js`), free time, time-block suggestions |
| `src/core/lines.ts` · `l10n.ts` | Everything the pet says, in English and Vietnamese |
| `src/pets/` | The 24 species, drawn in SVG for every mood, stage and accessory |
| `src/overlay/` | The pet surface: motion, bubble, board, mischief, effects |
| `src/settings/` · `src/diary/` | The Settings and Diary windows |
| `src/backend/` | The `Backend` interface, its Tauri implementation and the in-memory demo |
| `src-tauri/` | Rust: overlay window, click-through, tray, hotkey, Win32 watchers, Credential Manager, HTTP |

## License

[MIT](LICENSE)
