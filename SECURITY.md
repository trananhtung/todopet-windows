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
- **Links** — "Join" buttons only open known meeting services (Google Meet, Teams, Zoom, Webex, Whereby);
  `open_url` accepts `https`, `http`, and real Teams / Zoom meeting links only, and refuses `http(s)` links with a user
  name in front of the host (`https://google.com@evil.example/`).
- **Windows** — each window may call only the commands it needs (Tauri capabilities per window), and Rust checks which
  storage documents each window may read or write by its label: the overlay all of them, Settings reads `prefs` and
  `life` and writes `prefs`, the Diary reads `prefs`, the gallery none.

## Supported versions

Only the latest release gets fixes.
