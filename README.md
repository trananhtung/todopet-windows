<p align="center"><img src="docs/icon.png" width="128" alt="TodoPet icon"></p>

<h1 align="center">TodoPet for Windows</h1>

<p align="center">
A desktop pet for Windows 10/11 that lives on top of your taskbar, reads your <a href="https://todoist.com">Todoist</a> tasks,
<b>cheers you on when you work</b> and <b>worries (and helps) when things slip</b>. Now with <b>25 species</b>.<br>
English · <a href="README.vi.md">Tiếng Việt</a> · Windows port of <a href="https://github.com/trananhtung/todopet">TodoPet for macOS</a>
</p>

![The species](docs/species.png)

## What's new on Windows

- **24 pets instead of one.** Mochi (the original round cat-eared mochi), Cat, Shiba, Bunny, Fox, Panda, Penguin, Frog, Hamster, Axolotl, Capybara, Duckling, Red Panda, Sea Otter, Hedgehog, Koala, Pygmy Hippo, Seal Pup, Owlet, Lamb and Piglet from the start, plus a **Bee** (unlocked after 20 finished tasks), a **Baby Dragon** (unlocked by a 7-day streak) and a **Unicorn** (unlocked after 50 finished tasks). Each one has its own body, gait (bounce, hop, waddle, float or scurry) and voice, and all of them share the moods, growth stages, hunger, dirt, accessories and celebrations. Pick yours in **Settings → Pet**.
- **Native Windows integration.** Lives above the taskbar on your primary monitor, clicks pass through everywhere except the pet, its bubbles and the board. Tray icon with mood and progress (`😊 2/3`, `🍅 18:42`), **Ctrl+Alt+T** to add a task from anywhere, start with Windows, and it hides while a full-screen game, video or slideshow is in front. Light on your battery: it stops drawing while the screen is locked or off, and on battery saver it stands still until you interact with it.
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
- **A little game around your work:** a chest for every 30 minutes of real work (opened by your next finished task, with the odds shown and nothing ever sold), 20 accessories including seasonal ones for Tết, Mid-Autumn, Halloween and Christmas, home decorations the pet knits while you focus (a distraction only drops a few stitches), a trip with a souvenir and a postcard once your plan is done, and weekly diary chapters with a fresh start on Mondays.
- **It feels alive:** pet it by moving the cursor over it, and it squints and slow-blinks like a cat. Click it a few times and it giggles; keep going and it gets dizzy. It shakes itself off after you drag it, waves when you come back, fidgets and yawns when things are quiet, and tilts its head when your cursor rests nearby. None of it happens while you type, focus or meet.
- **Forgiving streaks.** One finished task keeps your streak; a snack from your stash saves a missed day, a broken streak can be repaired the next workday, and days off, days the PC is off and packed meeting days never count against you.
- **A daily nudge budget:** at most 8 unsolicited reminders a day (you choose), and the ones you keep closing come less often.
- **"Where was I?"** After 5+ minutes away, a meeting, or a 2+ minute detour on a distracting site, the pet shows what you were on (the task, the app and the page) with **Reopen ↗ ⟨site⟩**, **Focus** and **Something else**. It never shows while a call is in front, never names a private window's page, and **Settings → Behavior → Calm** can turn the page title and address off. **📌 Pin my place** on the board keeps your spot with a one-line next step. It isn't counted against the nudge budget, but it comes at most every 30 minutes.
- **Meeting bookends.** The "meeting soon" bubble lists up to 2 related tasks; after a meeting of 15+ minutes the pet asks "Anything to capture?" (**＋ Next step** opens the add field with the meeting's name in it) and suggests a 5-minute breather when the next meeting is close.
- **If-then starts and a 2-minute starter.** A task's **⋯** menu has **Start when…** (after a meeting, when I open an app, after lunch) and **Try 2 minutes**, a tiny "just open it" session that ends with an offer for a full one or a kind "that's enough".
- **A shutdown ritual.** When the day is almost over (or from the board's day strip after 15:00) **Wrap up** shows today's wins, lets you send each unfinished task to **Tomorrow**, take it off the plan (**No date**) or keep it, pick **tomorrow's frog** and leave yourself a one-line note. **Done for today** puts the pet to sleep and quiet until your next workday starts (meetings and timed tasks still get through). The next morning's greeting names the frog and the note, and the frog goes first that day.
- **An overbooked warning and a day strip.** The board shows your work day as a compact strip (meetings, timed tasks, now) with "~6h / 7h left". Once a day, after planning, if tasks plus the meetings still ahead run an hour or more past the time left, the pet says so kindly and offers **Pick tasks to move**. Tasks without a Todoist duration count for the default length in Settings (30 minutes). Not counted against the nudge budget.
- **Friends, with no server.** In the board's **Friends** sheet you copy your **pet card**, a short line of text, and send it to a friend over any chat app; paste theirs and **Add**. You get a **buddy streak** (days in a row you both hit your goal; days off don't break it), a weekly **Procrastination Blob** 👾 to beat together (beaten: +50 XP and a 🏅 sticker), and once or twice a day a friend's pet **drops by** for about 25 seconds at a calm moment. See [Friends](#friends).
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

### Updates

From 0.7 on you only install TodoPet once. About every 6 hours it asks GitHub whether a newer version is out. When one is, the pet mentions it once, at a calm moment (never in a meeting or mid-focus), and keeps it findable in the tray menu, on the board and in **Settings → Updates**. **Update now** downloads the new installer, checks its signature, installs it and brings the pet back on the new version, with a note on what's new. No SmartScreen prompt, no hunting for the download page.

- The one-click update is for the `setup.exe` install. If you installed the `.msi` (per-machine, needs admin), the pet offers the download page instead.
- Coming from 0.6 or older? Those versions can't update themselves: install 0.7 once by hand, and every update after that is one click.
- Prefer to check yourself? Turn off **Check for updates automatically** in **Settings → Updates** and use **Check now**.

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

## Friends

There is no friends server, no account and nothing to host: friends swap **pet cards**, short text codes that start with `TODOPET1.`, over whatever chat app you already use. Open the board and press the **Friends** button next to the wardrobe.

- **The sheet** opens on your friends and this week's blob; **My card** and **Add a friend** are two compact rows underneath, and what a card holds is a folded row at the foot.
- **My card:** **Copy my card** copies your pet's card (**Show** opens its text). Send it to a friend; send a fresh one whenever you like (a newer card replaces your older one on their side, and the buddy streak grows each time cards are swapped). **Make a new card identity** (under **Show**, it asks first) gives you a new key: friends then see you as a new person, and can remove your old entry. Your own friends list stays, and an old card of yours that comes back to you in a chat is refused ("That's one of your own older cards"), not added as a friend.
- **Add a friend:** press **Add a friend**, paste their card into the box and press **Add**. A card that can't be read, or that doesn't check out (it was changed on its way, or isn't from the key it names), gets a kind message and changes nothing; your own card (current or older), and an older card than the one you have, are refused. You can have 12 friends. Two friends with the same pet name are told apart by a short tag from their key ("Mai · #a3f"). **Remove** (after a confirmation) takes a friend off the list.
- **Buddy streak:** for each friend, the days in a row you both reached your daily goal, counted back from the latest day both cards cover. A day either of you took off is skipped, not broken.
- **This week's boss:** the Procrastination Blob has 15 HP for you and for each friend whose card is from this week. Every task you finish (counted live) and every task in your friends' latest cards hurts it, **each person counting up to 15**: it takes everyone, and a card that says 999 is still 15. There is no losing and no penalty; it comes back on Monday. Beat it and everyone gets +50 XP and a 🏅 sticker, once a week.
- **Visits:** a friend whose card is at most 7 days old may drop by (at most twice a day) with a small label (the friend's name, then "dropped by! 🔥 buddy streak 3" on a second line, so a long name never hides the streak); click it to open Friends. It only comes at a calm moment (not while you type, focus, meet, are done for today, muted, hidden or in a full-screen app) and is not a reminder: it never counts against the nudge budget.

A card holds your pet's **name, species, accessories and growth stage, this week's finished-task count, and a 28-day record** (one letter a day: goal met, rest, or nothing; a rest day is a day off, or a day too packed with meetings to count), the date, and your **public key**, which links your cards together until you make a new card identity. It is signed with a key made on first use and kept in Windows Credential Manager (it never reaches the web view), so a friend's newer card can only come from the same install, and a changed card is refused. It **never** holds task titles, times, app names or your name. Nothing is uploaded: the card leaves this PC only when you send it yourself.

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

- No analytics and no servers of its own. Network traffic goes to `api.todoist.com`, your ICS links, to `api.anthropic.com` only when you press **Ask Claude**, and to GitHub (`api.github.com`, `github.com`) to look for updates, which sends nothing about you (it can be turned off).
- Distraction detection reads the **name of the app in front** and, for browsers, the **address of the active tab** and its page title (window titles of other apps are never read). They stay in memory and are never stored or sent anywhere.
- The **"Where was I?"** card remembers the task, app, page title and address (http/https only) you were on, plus the next step you pin. It lives **in memory only**: never saved to disk, never written to the diary, and forgotten at midnight. Your **Start when…** plans (a task, and a meeting's id and title, an app name or "after lunch") are saved for the day and deleted the day after; the diary only says what kind of plan it was. So are the frog (a task id) and the one-line note from **Wrap up**, until the day they are for is over.
- Typing detection uses Windows Raw Input and records **only the time of the last key-down**: it never reads which key, and it is not a keyboard hook.
- Calendar ICS links are secret addresses, so they're stored in Windows Credential Manager like the tokens, and only public internet addresses are fetched.
- **Friends** never go through a server. A pet card holds only your pet's name, species, accessories and stage, this week's finished-task count, a 28-day goal/rest record, the date and your public key (it links your cards until you make a new card identity): never task titles, times, app names or your name. It is signed with a key kept in Credential Manager, and leaves this PC only when you copy and send it yourself. The cards you add are checked (size, format and signature), shown as plain text only, and kept in the `friends` document (with the day's visits).
- Settings, the pet's life, today's "start when…" plans, tomorrow's frog and note and your friends' cards are in `%APPDATA%\com.trananhtung.todopet`; the diary stays on this PC in `%LOCALAPPDATA%\com.trananhtung.todopet` (14 days, can be turned off).
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
| `src/core/friends.ts` | Pet cards (encode and strict parse), the friend list, buddy streaks, the weekly boss, visits |
| `src-tauri/crates/todopet-core/src/card.rs`, `src-tauri/src/cards.rs` | Card signatures: the Ed25519 key (Credential Manager) and `card_public_key` / `card_sign` / `card_verify` / `card_reset_key` |
| `src/core/lines.ts` · `l10n.ts` | Everything the pet says, in English and Vietnamese |
| `src/pets/` | The 25 species, drawn in SVG for every mood, stage and accessory |
| `src/overlay/` | The pet surface: motion, bubble, board, mischief, effects |
| `src/settings/` · `src/diary/` | The Settings and Diary windows |
| `src/backend/` | The `Backend` interface, its Tauri implementation and the in-memory demo |
| `src-tauri/` | Rust: overlay window, click-through, tray, hotkey, Win32 watchers, Credential Manager, HTTP |

## License

[MIT](LICENSE)
