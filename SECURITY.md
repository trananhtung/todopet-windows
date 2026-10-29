# Security

## Reporting a vulnerability

Please report security issues privately through GitHub: **Security → Report a vulnerability** on
[trananhtung/todopet-windows](https://github.com/trananhtung/todopet-windows/security/advisories/new).
Please don't open a public issue for them. You'll get a reply within a week.

## What TodoPet protects

- **Secrets** — the Todoist API token, the optional Anthropic API key and your calendar ICS links are stored in
  Windows Credential Manager. They never reach the web view: the Rust side reads them and makes the HTTPS calls
  itself, and only booleans and calendar host names come back to the UI.
- **Network** — the UI can't make network requests (CSP `connect-src` allows only IPC). Rust talks to
  `api.todoist.com`, `api.anthropic.com` (only when you press Ask Claude) and your calendar links. Calendar fetches
  are HTTPS-only, refuse private, loopback and link-local addresses (also on redirects), and are capped at 5 MB.
- **Activity data** — the app in front, its window title (browsers only) and the active tab's address stay in
  memory. So does the "Where was I?" place (task, app, page and address, http/https only, plus the next step you
  pin): it is never saved to disk or written to the diary, and it is dropped at midnight. A private window
  (InPrivate, Incognito, Private Browsing, "Riêng tư", "Ẩn danh" and their translations) keeps only the app's name; a
  call app or call tab (Zoom, Teams, Meet…) is never the place and the card never shows while one is in front;
  query parameters that look like secrets (`token`, `code`, `key`, `session`…) and the #fragment are left out of the
  address; and **Settings → Behavior → Calm** can turn the page title, address and Reopen off (`resumeDetails`).
  Only today's "start when…" plans are saved, in the `triggers` store key: a task id, the time the plan was made, and
  one of a meeting (its id, hashed when very long, and its title cut to 60 characters), an app name you typed or chose
  (with the program's file name when chosen from the recent apps), or "after lunch". The diary only says what kind of
  plan it was (after a meeting, when an app opens, after lunch), never the meeting's title or the app's name, and the
  once-a-day gate for the question after a meeting keeps a hash of the meeting's id. Yesterday's plans are deleted from
  disk when the pet starts. Tomorrow's frog (a task id), the one-line note you wrote in Wrap up and the time "done
  for today" lasts until are saved in the `plan` store key until the day they are for is over. Typing detection
  records only the time of the last key-down via Windows Raw Input, never which key.
- **Friends (v0.6)** — friends swap *pet cards*: `TODOPET1.` followed by the base64url of a small JSON object. There is
  no server and nothing is uploaded; a card leaves the PC only when you copy and send it yourself.
  - *What a card reveals.* Your pet's name, species, accessories and growth stage; your current and best streak; the ISO
    week and the number of tasks finished this week; a 28-character record of the last 28 days (`G` goal met, `K` a task
    done, `R` day off or excused, `-` nothing); the date it was made; and a random install id (20 characters, made once
    on this PC and kept in the `friends` store key, so a newer card replaces an older one). Never task titles, times,
    app names, the user's name, the Todoist account, addresses or any secret. The install id is the only identifier;
    it is a pseudonym that anyone you give a card to can link your cards by.
  - *A pasted card is untrusted input.* It is parsed by `decodeCard` in `src/core/friends.ts`, which never throws and
    changes nothing on failure: whitespace is stripped; at most 1500 characters; the exact prefix `TODOPET1.`;
    strict base64url (no padding, no other alphabet) that is valid UTF-8; JSON that is a plain object with exactly
    the 12 known keys (no extra ones, so nothing can ride along); `v` is 1; the id matches `[A-Za-z0-9_-]{8,32}`; the
    name is at most 20 characters of plain text with no control, bidi-override, zero-width, line-separator or
    private-use characters; the species and every accessory come from the app's own fixed lists (at
    most 3, one per slot); numbers are whole and in range (stage 0–4, streaks up to 9999, tasks of the week up to 999);
    the record is exactly 28 characters of `G K R -`; the date is a real day and not more than a day ahead of the
    clock; and the week is the ISO week of that date. Anything else is refused with a kind message. Your own card is
    refused, an older card than the one you have is refused, and the list holds 12 friends at most.
  - *Where it goes.* A friend's name is only ever shown as React text (never as HTML, never in the SVG art, never in
    the diary: the diary only says that a friend was added or visited). The pet drawn for a visit comes from the
    species, accessories and stage after the checks above, so no card text reaches the renderer's markup. Cards on
    disk are checked again, as strictly, when they are read back.
  - *Who may read it.* The `friends` key (cards, install id and the day's visits) is readable and writable by the
    overlay window alone; Settings, the Diary and the gallery are refused by Rust. A failed read at startup is never
    overwritten.
  - *Cards work on trust.* A friend can write any task count on their card (the weekly boss is cosmetic: a 🏅 sticker
    and 50 XP, with no rankings and no penalties, so there is nothing worth cheating for).
- **Links** — "Join" buttons only open known meeting services (Google Meet, Teams, Zoom, Webex, Whereby);
  `open_url` accepts `https`, `http`, and real Teams / Zoom meeting links only, and refuses `http(s)` links with a user
  name in front of the host (`https://google.com@evil.example/`).
- **Windows** — each window may call only the commands it needs (Tauri capabilities per window), and Rust checks which
  storage documents each window may read or write by its label: the overlay all of them (the friends' cards are its
  alone), Settings reads `prefs` and `life` and writes `prefs`, the Diary reads `prefs`, the gallery none.

## Supported versions

Only the latest release gets fixes.
