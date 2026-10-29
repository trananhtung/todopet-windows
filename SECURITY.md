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
  pin): it is never saved to disk or written to the diary, and it is dropped at midnight. Only today's
  "start when…" plans (a task id and a meeting, an app name or "after lunch") are saved, in the `triggers` store key. Typing detection records only the time of the last key-down via Windows Raw Input, never which key.
- **Links** — "Join" buttons only open known meeting services (Google Meet, Teams, Zoom, Webex, Whereby);
  `open_url` accepts `https`, `http`, and real Teams / Zoom meeting links only.
- **Windows** — each window may call only the commands it needs (Tauri capabilities per window).

## Supported versions

Only the latest release gets fixes.
