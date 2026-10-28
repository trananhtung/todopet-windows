# GAN harness spec — TodoPet for Windows

Source of truth: [`docs/SPEC.md`](../docs/SPEC.md). This file is the evaluator's checklist for the browser-testable
surface (`npm run dev`, http://localhost:1420). Windows-only behavior (click-through, tray, UI Automation,
Credential Manager, installers) is verified by unit tests and the `windows-latest` CI job, not by the evaluator.

## Pages

| URL | What must work |
|---|---|
| `/overlay.html?demo` | Fake desktop + taskbar; pet walks on the taskbar; demo bubble; click pet → board; drag pet → falls back; demo controls panel |
| `/overlay.html?demo&antic=parade` (also `block`, `grumble`) | The stunt plays within ~2 s |
| `/settings.html?demo` | All sections, species picker with live preview, values persist across reload |
| `/diary.html?demo` | Days list, entries, summary, filters, Copy |
| `/gallery.html?static=1` | All 14 species × moods × life states, recognizable and unclipped |

## Sprint contract (what "done" means for this MVP)

1. **Pet** — renders the chosen species, walks with the species' gait, blinks, looks at the cursor, blushes on
   hover, dangles while dragged, falls back to the taskbar, sits in the corner during focus, sleeps when idle.
2. **Bubbles** — appear above the pet with a tail pointing at it, never off-screen, auto-fade with a visible timer
   that pauses on hover, close button, action buttons that do what they say.
3. **Board** — header with avatar, mood and score (hover shows reasons); stats strip (done/target, fullness,
   XP/stage, streak); add task with due + priority (Enter submits); overdue / today / done lists; per-task focus,
   split, move, delete-with-confirmation; calendar card with Join and time-block suggestions; split sheet with
   template + Ask Claude (demo returns canned steps); wardrobe with accessories, locked species progress and
   sticker book; footer sync / quiet / hide. Escape closes.
4. **Life loop** — finishing a task: celebration dance + confetti/fireworks, food falls into the mouth, fullness
   +25%, XP up, bubble with Undo; Undo reverts.
5. **Mood** — switching the demo foreground to YouTube and running rules drops the score with a
   "distracted by youtube.com" reason; focus mode shows 🍅 countdown badge.
6. **Mischief** — parade drags a sign with the next task across the screen; table flip jumps the pet big into the
   middle with "(╯°□°)╯︵ ┻━┻"; both end (parade at the edge, block on "Spare me"/click/leaving the site).
7. **i18n** — every visible string has English and Vietnamese (switch in Settings → language).
8. **No console errors** on any page.
