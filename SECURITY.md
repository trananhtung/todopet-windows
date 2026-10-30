# Security

## Reporting a vulnerability

Please report security issues privately through GitHub: **Security → Report a vulnerability** on
[trananhtung/todopet-windows](https://github.com/trananhtung/todopet-windows/security/advisories/new).
Please don't open a public issue for them. You'll get a reply within a week.

## What TodoPet protects

- **Secrets** — the Todoist API token, the optional Anthropic API key, your calendar ICS links and the key that signs your
  pet cards are stored in Windows Credential Manager. They never reach the web view: the Rust side reads them and makes the HTTPS calls
  itself, and only booleans and calendar host names come back to the UI (for the card key: the public half, a signature, or a yes
  or no).
- **Network** — the UI can't make network requests (CSP `connect-src` allows only IPC). Rust talks to
  `api.todoist.com`, `api.anthropic.com` (only when you press Ask Claude), your calendar links and GitHub (updates, below). Calendar fetches
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
- **Friends (v0.6)** — friends swap *pet cards*: `TODOPET1.<payload>.<signature>`, where the payload is the base64url of a small
  JSON object and the signature is an Ed25519 signature of it. There is no server and nothing is uploaded; a card leaves the PC
  only when you copy and send it yourself.
  - *Signed cards.* Every install has an Ed25519 key pair, made on first use. The secret half (a 32-byte seed) is kept in
    Windows Credential Manager (service `TodoPet`, user `card-key`) and **never reaches the web view**: Rust signs and verifies
    (`src-tauri/src/cards.rs`, with `todopet_core::card`, on `ed25519-dalek` 2), and only the overlay window may call
    `card_public_key`, `card_sign`, `card_verify` and `card_reset_key` (they are in its capability alone). The signature covers
    the exact payload bytes (at most 2 KB); verification is strict (small-order keys and malleable signatures are refused) and a
    key or signature that isn't strict base64url of the right size is refused as invalid. A friend *is* their public key, not a
    name: a card replaces a friend's older one only if it checks out under the same key, so a name or a card can't be taken
    over, and a card that was changed on its way is refused with "This card doesn't check out; ask your friend to copy it
    again." (nothing the card says is repeated in an error). What this does not do: it proves two cards come from the same
    install, not who that person is; whoever has the secret key (or this Windows account) can sign as you.
  - *What a card still reveals.* Your pet's name, species, accessories and growth stage; the ISO week and the number of tasks
    finished this week; a 28-character record of the last 28 days (`G` goal met, `R` a rest day: a day off, or a day too packed
    with meetings to count, and `-` nothing, or tasks done without meeting the goal: a card doesn't say how many); the date it
    was made; and your **public key** (43 characters). The key is the one identifier on a card, and it links every card you
    send to the same person until you make a new card identity. No streaks, no task titles, times, app names, user name,
    Todoist account, addresses or secrets. The Friends sheet says the same in plain words.
  - *A new card identity unlinks your cards.* "Make a new card identity" (after a confirmation) replaces the key: cards you make
    afterwards carry a different public key, so friends see a new person and can remove the old entry. It does not recall the
    cards already sent, and the old ones stay linked to each other; the old key is gone.
  - *A pasted card is untrusted input.* It is parsed by `parseCard` in `src/core/friends.ts`, which never throws and changes
    nothing on failure: whitespace is stripped; at most 1630 characters; the exact prefix `TODOPET1.`; exactly two parts,
    each strict base64url (no padding, no other alphabet, no spare bits), the first valid UTF-8 without a byte order mark; JSON
    that is a plain object with exactly the 10 known keys (no extra ones, so nothing can ride along; `id`, `streak` and `best`
    no longer exist); `v` is 1; the public key is 32 bytes; the name is at most 20 characters of plain text with no control,
    bidi-override, zero-width, line-separator or private-use characters, at least one visible character (the Hangul fillers,
    the blank braille pattern, the grapheme joiner and no-break spaces don't count) and at most two combining marks in a row;
    the species and every accessory come from the app's own fixed lists (at most 3, one per slot); numbers are whole and in
    range (stage 0–4, tasks of the week up to 999); the record is exactly 28 characters of `G R -`; the date is a real day and
    not more than a day ahead of the clock; and the week is the ISO week of that date. Only then is the signature checked
    through the backend. Anything else is refused with a kind message. Your own card is refused (and so is one of your own
    older cards: the public keys of your last 10 earlier identities are kept in the friends document, public halves only),
    an older card than the one you have is refused, and the list holds 12 friends at most.
  - *Where it goes.* A friend's name is only ever shown as React text, inside a `<bdi>` so that a right-to-left name can't
    reorder the words around it (never as HTML, never in the SVG art, never in the diary: the diary only says that a friend
    was added or visited). A name that could pass for your pet's name, or for "You" or "Bạn" (compared after NFKC, case,
    accents and joiners), is shown with the friend's species beside it, everywhere; two friends who share a name are told apart
    by a short tag from a hash of their public key. The pet drawn for a visit comes from the
    species, accessories and stage after the checks above, and the renderer only accepts an id prefix of letters, digits,
    `-` and `_`, so no card text reaches the renderer's markup. Cards on disk are checked again, as strictly, when they are
    read back (only the first 12 entries are looked at, and a stored time later than now is brought back to now).
  - *Who may read it.* The `friends` key (cards, the day's visits and my earlier public keys) is readable and writable by the overlay window alone;
    Settings, the Diary and the gallery are refused by Rust. The document is capped at 64 KB, read and written: a bigger file is
    renamed to `friends.json.bad` and treated as missing. So is a file that is not valid JSON (the app starts with no friends and
    the bad copy stays on disk); a file that cannot be read at all (a scanner has it locked) is not a missing file: it is kept in
    memory for the session and never written over.
  - *Cards work on trust.* A friend can write any task count on their card, so the weekly boss counts each person for 15 at most (their
    share of its HP): one card, from a typo or a cheat, can't win the blob alone and pay you a 🏅 sticker and 50 XP. There are no
    rankings and no penalties, so there is nothing more to cheat for.
- **Updates (v0.7)** — an update can run code on every install, so the chain is kept short and checked at both ends.
  - *Finding one.* Rust (never the web view) asks `api.github.com/repos/trananhtung/todopet-windows/releases` over HTTPS with
    no redirects, a 20 s timeout and a 1 MB cap, about every 6 hours (at most every 30 minutes, "Check now" at most every 20 s;
    it can be turned off). The request carries the app's user agent and nothing about you. Only strict `vX.Y.Z` tags above the
    running version count; drafts are invisible, so an update reaches people only when a person publishes the release. Release
    notes are shown as plain text (control characters removed, at most 4000 characters), never as HTML.
  - *Installing it.* The release carries `latest.json` and a minisign signature of `TodoPet_<v>_x64-setup.exe` (Tauri updater
    format). The app embeds the public key (`plugins.updater.pubkey` in `tauri.conf.json`) and verifies the downloaded
    installer before running it; `requireSignedVersion` makes the signature itself name the version, so a doctored manifest
    can't pair a new version number with an older, validly signed installer. The manifest URL and the installer's URL prefix
    are built in Rust from the tag (`github.com/trananhtung/todopet-windows/releases/download/<tag>/`); no command takes a URL
    from JavaScript, and the updater plugin's own JS API is granted to no window (only `update_status`, `update_check`,
    `update_install` and `update_open_page`, in the overlay and Settings). Only the per-user `setup.exe` install updates itself
    (passive installer, then the app restarts); MSI installs, dev builds, releases without a signed manifest and any failure
    fall back to opening the release page.
  - *The signing key.* It lives only in the `updater-signing` GitHub environment and offline with the maintainer. The release
    workflow builds with no secret in reach; a separate job that runs no project code signs the setup.exe with the Tauri CLI
    pinned to the lockfile's integrity, then checks the signature with `minisign` against the public key the app embeds and
    that it names the tag's version, before the draft release is made (the tag, the three version fields and the shipped
    updater config are checked before the key is touched, and the installer's SHA-256 is printed in the run summary). The
    release binary is checked for the e2e hook. A missing key fails the release. The key is never committed.
  - *If the key is lost or leaks.* Installed apps trust only the embedded public key, so nothing can be "re-keyed" from
    the outside. Lost: put a new public key in `tauri.conf.json`, release it signed with the new key, and tell users
    (README, release notes) to install that one version by hand; one-click works again after it. Leaked: delete any release
    you didn't publish (a signature alone is not enough, the release must also be published, and drafts are invisible to the
    app), rotate the environment secrets, and ship the new key the same way. Keep an offline backup of the key, with its
    passphrase stored apart from it (a password manager).
  - *Proof on Windows.* `update-e2e.yml` installs an old build on a Windows runner, serves a manifest signed with a throwaway key
    on localhost, and waits for the app to update itself and come back. That build uses the `e2e-update` cargo feature and a
    patched config; neither is ever in a release.
- **Links** — "Join" buttons only open known meeting services (Google Meet, Teams, Zoom, Webex, Whereby);
  `open_url` accepts `https`, `http`, and real Teams / Zoom meeting links only, and refuses `http(s)` links with a user
  name in front of the host (`https://google.com@evil.example/`).
- **Windows** — each window may call only the commands it needs (Tauri capabilities per window), and Rust checks which
  storage documents each window may read or write by its label: the overlay all of them (the friends' cards are its
  alone), Settings reads `prefs` and `life` and writes `prefs`, the Diary reads `prefs`, the gallery none.

## Supported versions

Only the latest release gets fixes.
