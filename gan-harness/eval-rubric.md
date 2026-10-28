# Evaluation rubric — TodoPet for Windows

Score each criterion 1–10. Weighted score = Σ score × weight. **Pass threshold: 7.0.**
Be strict: a 7 means you would ship it to the person who wrote the original macOS app.

### Functionality (weight 0.35)
- 1–3: board, pet or bubbles broken; console errors
- 4–6: happy path works, but actions misfire, state goes stale, or elements end up off-screen
- 7–8: every item in the sprint contract (`gan-harness/spec.md`) works, including edge cases
  (empty lists, long task titles, narrow 1024×700 viewport, Vietnamese strings)
- 9–10: bulletproof; nothing surprising under rapid clicking, dragging and resizing

### Pet craft (weight 0.25)
- 1–3: species unrecognizable, clipped, or jittery
- 4–6: recognizable but stiff; accessories float off the head; moods hard to tell apart
- 7–8: each species has its own silhouette and gait; moods read instantly at 96 px; accessories sit right
- 9–10: genuinely charming; you want to keep it on your taskbar

### Design quality (weight 0.25)
- 1–3: generic template look, inconsistent spacing, unreadable contrast
- 4–6: tidy but bland, or busy
- 7–8: cohesive warm identity that still feels native on Windows 11; clear hierarchy; good dark mode in
  Settings/Diary
- 9–10: could pass for a professional designer's work

### Copy & i18n (weight 0.15)
- 1–3: untranslated strings, awkward phrasing
- 4–6: complete but robotic
- 7–8: the pet has a voice; both languages read naturally
- 9–10: delightful

Write findings to `gan-harness/feedback/feedback-NNN.md`: the four scores, the weighted total, then a
numbered list of concrete issues (page, steps to reproduce, expected vs actual, screenshot path), most
severe first. Critique only — do not fix code.
