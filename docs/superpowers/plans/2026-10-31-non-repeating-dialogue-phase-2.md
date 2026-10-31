# Non-repeating Dialogue, Phase 2 (Content) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the line packs to about 400 options per language (315 new), reviewed by the user in batches, after fixing the three gaps phase 1 left.

**Architecture:** Phase 1 built the engine (`variety.ts`, `LifeState.said`, `Brain.phrase`) with today's words. This phase first closes three gaps (a waiting note that re-picks its line, a lint blind to numbers and pack sizes, spec targets naming keys that don't exist), then appends options to the packs in `lines.ts`, one reviewed batch at a time, and adds the context lines for a finished task (`done.target/stuck/frog/first/early/friday`).

**Tech Stack:** TypeScript, Vitest, React demo (`npm run dev`, `?demo`).

**Spec:** `docs/SPEC.md`, section "v0.8 'Có hồn'" → "1. Non-repeating dialogue". Phase 1 plan: `docs/superpowers/plans/2026-10-30-non-repeating-dialogue-phase-1.md` (its key table is the list of keys).

**Branch:** `feat/v0.8-dialogue-lines` from `main`. One PR at the end. No release: 0.8.0 is decided separately.

## Global Constraints

- **Review gate per batch.** Each batch's table (`key | # | VI | EN | note`) goes to the user before any of its lines enter `lines.ts`. Stop and wait. Apply the user's changes exactly; their wording wins. This gate is a planned stop, not an optional check-in.
- **Voice** (spec, verbatim): the pet says "mình" and calls the user "bạn" (VI), "I"/"you" (EN). Warm, casual, never scolding (worried and helpful when things slip, as in v0.3). Chatter at most about 90 characters before a task title is filled in; `done*` lines at most about 60, since the bubble also holds Undo. At most one emoji, at the end. Both languages say the same thing in spirit, not word for word. `${sound}` (the species' voice) may appear in `done*` lines.
- **Append only.** New options go at the end of a pack. An existing option may be edited in place (same index) only when its batch table shows the edit and the user approved it. Never remove or reorder.
- **Same facts in both languages.** Every value a line fills in (title, app, place, number, time) appears in both the VI and EN text of an option.
- Keys match `/^[a-z][a-zA-Z0-9.]{0,63}$/`; a pack has 1 to 40 options (`MAX_OPTIONS`).
- Out of scope: chest, craft and wrap-up lines (`chests.ts`, `craft.ts`, `wrapup.ts`), labels, buttons, errors, update texts.
- Every task ends with `npm run typecheck` clean and `npm test` green.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Context boundaries.** 8:59 is early, 9:00 is not; 4:59 is not early (a 2 a.m. finish isn't "up early"); Friday 14:59 is plain, 15:00 is Friday; Saturday is never Friday. Pinned in Task 3's priority test.
2. **Context priority.** A stuck frog that also reaches the target says `done.target`; a stuck frog says `done.stuck`. Pinned in Task 3's priority test.
3. **Language switch while the day-close note waits.** The note keeps the same option and shows it in the new language. Pinned in Task 1's `stickyPhrase` test.
4. **Tests that call varied lines with `randomPhrase`.** They become flaky once packs grow. Task 2 turns every such assertion into one over every option (`everyOption`).
5. **A pack that shrinks.** Removing an option shifts indices and confuses the memory. Pinned by Task 2's "never fewer options than shipped" lint; reordering is caught by the per-batch diff check (Batch procedure step 7).

---

### Task 1: A waiting day-close note picks its line once

The day-close note's `rebuild` calls `dayCloseNote`, which calls `lines.levelUp(…, this.phrase)` on every rebuild, so each tick while the note waits picks (and records) a new option. Invisible today (`levelUp` has 1 option), real once Task 4 gives it 4.

**Files:**
- Modify: `src/core/variety.ts` (add `stickyPhrase`)
- Modify: `src/core/brain.ts` (`phrase` split into `pickLine` + text; `dayCloseNote` takes `say`; the day-close site around line 1516)
- Test: `src/core/variety.test.ts`, `src/core/brain.test.ts` (next to "tells about a growth stage reached overnight", ~line 356)

**Interfaces:**
- Produces: `export function stickyPhrase(pick: (pack: Pack) => number): Phrase` in `variety.ts`. The first call for a key asks `pick` for an index; later calls for that key return the same option, rendered with `L` in the language of the moment. `private pickLine(pack: Pack): number` in `Brain` (0 without storing for 1 option; otherwise chooses, records in `life.said`, returns the index).

- [ ] **Step 1: Write the failing test** in `variety.test.ts`:

```ts
describe("stickyPhrase", () => {
  it("chooses once per key and keeps that option, in the language of the moment", () => {
    const picked: string[] = [];
    const say = stickyPhrase((p) => { picked.push(p.key); return 1; });
    const grown: Pack = { key: "levelUp", options: [["Lớn rồi", "Grown"], ["Cao rồi", "Taller"]] };
    expect(say(grown)).toBe("Taller");
    setLang("vi");
    try {
      expect(say(grown)).toBe("Cao rồi");
    } finally {
      setLang("en");
    }
    expect(say({ key: "streak", options: [["Chuỗi", "Streak"], ["Chuỗi 2", "Streak 2"]] })).toBe("Streak 2");
    expect(picked).toEqual(["levelUp", "streak"]);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run src/core/variety.test.ts -t stickyPhrase` → FAIL, `stickyPhrase` is not exported.
- [ ] **Step 3: Implement `stickyPhrase`** in `variety.ts` (a `Map<string, number>` of chosen indices; import `L` from `./l10n`).
- [ ] **Step 4: Run it.** Same command → PASS.
- [ ] **Step 5: Use it in the brain.** Split `phrase` into `pickLine` and `phrase = (pack) => pack.options.length === 0 ? "" : L(...option at pickLine(pack))`. Give `dayCloseNote` a last parameter `say: Phrase` used for `lines.levelUp`. Where the day closes, make one `const say = stickyPhrase((p) => this.pickLine(p))` and pass it to both the first `dayCloseNote` call and the `rebuild` closure.
- [ ] **Step 6: Brain test** "a growth note waiting to be told keeps the line it picked": boot as the overnight-growth test does (`boot({ xp: 290, streak: 2 }, doneOn27(3))`), copy `life.said.levelUp`, run `brain.tick()` four times with the clock 15 s apart, and expect `life.said.levelUp` unchanged. Comment that it guards nothing until `levelUp` has 2+ options; Task 4 adds `toBeDefined()`.
- [ ] **Step 7: Run** `npx vitest run src/core/brain.test.ts src/core/variety.test.ts` → PASS; then `npm run typecheck` and `npm test` → green.
- [ ] **Step 8: Commit** `fix(brain): a waiting day-close note picks its line once`.

### Task 2: Lints, targets and every-option tests

Closes deferred items 2 and 3, and makes the suite safe for growing packs.

**Files:**
- Modify: `src/core/variety.ts` (add `everyOption`), `src/core/variety.test.ts`
- Modify: `src/core/lines.test.ts` (sample values, new lints, `TARGETS`, `SHIPPED`, `FILLED`, `UNTIL_REVIEWED`)
- Modify: `src/core/core.test.ts`, `src/core/review.test.ts` (assertions over every option)
- Modify: `docs/SPEC.md` (targets table with the real keys; lint list)

**Interfaces:**
- Produces: `export function everyOption(line: (say: Phrase) => string): string[]` in `variety.ts`: every text `line` can return in the current language, one per combination of the options of the packs it says (a line that says two packs of 2 and 3 gives 6). `TARGETS`, `FILLED`, `UNTIL_REVIEWED` in `lines.test.ts`, which every batch edits.

- [ ] **Step 1: Write the failing test** in `variety.test.ts`:

```ts
it("everyOption lists every way a line can come out", () => {
  const two: Pack = { key: "a", options: [["A1", "a1"], ["A2", "a2"]] };
  const three: Pack = { key: "b", options: [["B1", "b1"], ["B2", "b2"], ["B3", "b3"]] };
  expect(everyOption((say) => `${say(two)} ${say(three)}`).sort()).toEqual(["a1 b1", "a1 b2", "a1 b3", "a2 b1", "a2 b2", "a2 b3"]);
  expect(everyOption(() => "fixed")).toEqual(["fixed"]);
});
```

- [ ] **Step 2: Run it** → FAIL (not exported). **Step 3: Implement** (call once to learn the pack sizes in call order, then walk the combinations like an odometer). **Step 4: Run it** → PASS.
- [ ] **Step 5: Distinctive sample values in `sayEverything`.** Every printed number argument takes a value from `const NUMS = [13, 17, 23, 29, 37, 41, 43, 47]` unless the branch needs another (0, 1, satiety under 10, `completed === target`). Every `Date` argument whose time is printed gets minute 37 (`timeString` is `HH:MM` in both languages). Keep every branch reached; the existing "covers every key" test proves it.
- [ ] **Step 6: New lints** in the "packs every varied line goes through" describe:
  - "fills in the same numbers in both languages": for each option and each `v` of `NUMS`, `(?<!\d)v(?!\d)` matches VI exactly when it matches EN.
  - "keeps a key's pack the same size wherever it is said": per key, one size across all recorded packs.
  - "keeps lines short": strip `“⟦.⟧”` and `⟦.⟧`, count code points; `done` and `done.*` ≤ 60, the rest ≤ 90. Entries in `UNTIL_REVIEWED` (`"key#index"`) are skipped.
  - "never has fewer options than it shipped with": `SHIPPED` holds each key's count at 0.7.1 (all 1 except `plan.*` 2, `nudge.*` 2, `distraction` 2, `grumble` 2, `stuck` 2, `done` 4, `voice.cheer` 2, `voice.grumble` 2, `tip` 6).
  - "filled keys reach their target": every key in `FILLED` (empty for now) has at least `TARGETS[key]` options.
  - "every key has a target": every key of `KEYS` is in `TARGETS`.
- [ ] **Step 7: Run** `npx vitest run src/core/lines.test.ts`. Expected: the length lint fails on `overdue.worried#0`, `overdue.repeating#0`, `tripBack.souvenir#0`, `tripBack.stories#0` (measured on main: 95–109 code points); the number lint may fail where an EN line drops a count. Put each failure in `UNTIL_REVIEWED` with a comment naming the batch that fixes it (overdue → Task 5, trips → Task 10; others by area per the batch table below), and ledger a `Ruling:` per entry. Rerun → PASS.
- [ ] **Step 8: Every-option assertions.** In `core.test.ts` and `review.test.ts`, every assertion on the result of a varied line called with `lines.randomPhrase` holds for each element of `everyOption((say) => lines.x(…, say))`. Equality between two calls becomes equality of their `everyOption` lists. The "never scolds" check (`withSay`, ~line 222) checks every option. The `variants()` helper's voice-line uses (~line 457) become `everyOption` in both languages. Leave the single `randomPhrase` sanity test in `lines.test.ts`.
- [ ] **Step 9: `TARGETS`** (the spec's numbers on the keys that exist; `morning.plain` dropped, since with no next task the morning line is the greeting alone):

| Area | Targets |
|---|---|
| Greeting, morning | `greeting.{morning,midday,afternoon,evening}` 4; `morning.{plan,frogPicked,frog}` 6 |
| Planning, nudges | `plan.{normal,annoyed,angry}` 6; `nudge.{normal,happy,annoyed,angry}` 8; `overdue` 6, `overdue.worried` 4, `overdue.repeating` 3 |
| Distraction | `distraction` 8, `distraction.angry` 4; `grumble` 6, `parade` 6, `block` 5 |
| Finishing | `done` 20; `done.{target,stuck,frog,first}` 6; `done.{early,friday}` 5; `allDone` 8; `planComplete.next` 6, `planComplete` 4 |
| Pet life | `hungry` 6, `hungry.starving` 3, `dirty` 5, `cleaned` 4, `cleaned.clean` 3, `golden` 4, `combo` 5, `levelUp` 4, `streak` 6 |
| Focus, breaks | `focusStart.task` 6, `focusStart` 4, `focusEnd.task` 6, `focusEnd` 4, `breakStart` 5, `breakEnd` 5, `backToWork` 6, `welcomeBack` 8 |
| Starters, postponed | `starterStart.task` 4, `starterStart` 3, `starterEnd.task` 4, `starterEnd` 3, `starterGone` 3, `starterEnough` 4, `stuck` 6, `stuck.angry` 4, `splitDone` 3 |
| Meetings | `soon` 4, `dueNow` 4, `meetingOver` 4 |
| Day's end, week | `review` 6, `review.clear` 4, `review.empty` 3, `lateNight` 5, `newWeek.recap` 5, `newWeek` 3 |
| Trips | `tripOffer` 5, `tripStart` 4, `tripBack.{souvenir,stories,early}` 3, `tripStayed` 3 |
| Tips, voice | `tip` 14; `voice.cheer` 6, `voice.grumble` 4, `voice.angry` 4, `voice.block` 3, `voice.hungry` 3 |

  409 options per language in all (94 shipped, 315 new).
- [ ] **Step 10: Spec.** Replace the spec's Targets table with this one, note the `done.early` window (Task 3), and extend the content-lint bullet with the number/time check, one size per key, never fewer than shipped. Fixes deferred item 3.
- [ ] **Step 11: Run** `npm run typecheck`, `npm test` → green. **Commit** `test(lines): lint numbers, pack sizes and lengths; targets per key` (code and spec may be two commits).

### Batch procedure (Tasks 3–10)

Each batch task lists its keys and how many options it adds. For each:

1. **Draft** `docs/dialogue/batch-N-<area>.md`: a one-line header (keys, counts), then `| key | # | VI | EN | note |`, `#` being the option's 1-based place in its pack; note is `mới` (new) or `sửa` with the old text (an `UNTIL_REVIEWED` entry of this area). Read each key's existing options and the code branch first, so new lines fit what the situation knows (task title, counts, app). Follow the Voice constraint; vary openings, rhythm and emoji across a pack.
2. **Gate.** Send the table to the user (file link, and the table in the message). Stop until they approve. Apply their edits to the file.
3. **Targets first.** Add the batch's keys to `FILLED` in `lines.test.ts`; run `npx vitest run src/core/lines.test.ts` → FAIL on those keys' counts.
4. **Append** the approved options to the packs in `lines.ts`, in table order; apply approved `sửa` edits in place and drop their `UNTIL_REVIEWED` entries.
5. **Run** `npx vitest run src/core/lines.test.ts` → PASS (counts, lengths, numbers, markers).
6. **Run** `npm run typecheck` and `npm test`. A failing assertion on one of these lines means one of two things: the new option breaks a meaning the test protects (fix the option, tell the user) or the test pinned wording rather than meaning (loosen it to the meaning; ledger a `Ruling:`).
7. **Diff check.** `git diff src/core/lines.ts` shows only appended options plus the table's `sửa` rows.
8. **Commit** the table and the lines: `feat(lines): batch N, <area>`.

### Task 3: Batch 1, finishing a task in context (49 options, with code)

Keys: `done` +16, `done.target` +5, and the new `done.stuck` 6, `done.frog` 6, `done.first` 6, `done.early` 5, `done.friday` 5. Over 40 because the context code needs all its keys at once.

**Files:** `src/core/lines.ts` (`DoneContext`, `done`), `src/core/brain.ts` (`celebrate`), `src/core/lines.test.ts`, `src/core/brain.test.ts`, `docs/dialogue/batch-1-finishing.md`, `docs/SPEC.md`.

**Interfaces:**
- Produces: `export interface DoneContext { completed: number; target: number; sound: string; frog: boolean; stuck: boolean; hour: number; weekday: number }` and `done(t: TodoTask, ctx: DoneContext, say: Phrase): string` in `lines.ts` (`weekday` as `Date.getDay()`, 5 = Friday).

- [ ] **Step 1: Draft and gate** (procedure steps 1–2).
- [ ] **Step 2: Priority test** in `lines.test.ts`, written before the code:

```ts
it("says the most specific done line", () => {
  const ctx = (over: Partial<lines.DoneContext>): lines.DoneContext =>
    ({ completed: 2, target: 13, sound: "⟦S⟧", frog: false, stuck: false, hour: 11, weekday: 3, ...over });
  const keyOf = (c: lines.DoneContext) => { let key = ""; lines.done(T, c, (p) => { key = p.key; return ""; }); return key; };
  expect(keyOf(ctx({ completed: 13, stuck: true, frog: true }))).toBe("done.target");
  expect(keyOf(ctx({ completed: 1, stuck: true, frog: true }))).toBe("done.stuck");
  expect(keyOf(ctx({ completed: 1, frog: true }))).toBe("done.frog");
  expect(keyOf(ctx({ completed: 1, hour: 8 }))).toBe("done.first");
  expect(keyOf(ctx({ hour: 8 }))).toBe("done.early");
  expect(keyOf(ctx({ hour: 5 }))).toBe("done.early");
  expect(keyOf(ctx({ hour: 4 }))).toBe("done");
  expect(keyOf(ctx({ hour: 9 }))).toBe("done");
  expect(keyOf(ctx({ weekday: 5, hour: 15 }))).toBe("done.friday");
  expect(keyOf(ctx({ weekday: 5, hour: 14 }))).toBe("done");
  expect(keyOf(ctx({ weekday: 6, hour: 16 }))).toBe("done");
});
```

  Run → FAIL (`DoneContext` missing).
- [ ] **Step 3: Implement** `DoneContext` and the priority in `done` (target, stuck, frog, first = `completed === 1`, early = hour 5–8, friday = weekday 5 and hour ≥ 15, else `done`). `done.early` starts at 5:00, not midnight (Review Focus 1); amend the spec's table row to "5:00–8:59". Every context pack holds its approved options.
- [ ] **Step 4: Brain.** In `celebrate`, before `mutateLife`/`recompute`, capture `stuck` (`this.state.stuck.some((x) => x.task.id === task.id)`) and `frog` (`this.state.day.frogId === task.id`); build the context with `completed: this.state.day.completed.length`, `target: this.state.target`, `sound`, and `hour`/`weekday` from `new Date(nowMs)`.
- [ ] **Step 5: Sample calls and keys.** `sayEverything` calls `done` once per context; `KEYS` gains the five new keys. Add all seven `done*` keys to `FILLED`.
- [ ] **Step 6: Brain tests** in the v0.8 describe:
  - `finishDone` builds the expected line with `lines.done(task, ctx, option(index))`, the ctx read the same way the brain builds it.
  - "finishing tasks says every done line once before any comes back": use the `done` pack size (20) instead of 4, with a `dailyTarget` above the number of completions; the first completion of the day is now `done.first`.
  - "each context says its own line and keeps Undo": the day's first task → `done.first`; today's frog (set up as the existing tests that use a frog do; `grep -n frogId src/core/brain.test.ts`) → `done.frog`; a postponed task (as the existing `stuck` tests do) → `done.stuck`; at 8:30 → `done.early`; Friday 30 Oct 2026 at 15:30 → `done.friday`. Each: the key has a recorded pick and the bubble has Undo.
- [ ] **Step 7:** Procedure steps 5–8. Commit `feat(lines): batch 1, finishing a task in context`.

### Tasks 4–10: the other batches

Same procedure. "+n" is the options the batch adds; the targets are in Task 2's table.

| Task | Batch | Keys (+new) | Total |
|---|---|---|---|
| 4 | 2, finishing and rewards | `allDone` +7, `planComplete.next` +5, `planComplete` +3, `voice.cheer` +4, `combo` +4, `golden` +3, `levelUp` +3, `streak` +5, `hungry` +5, `hungry.starving` +2 | 41 |
| 5 | 3, nudges and overdue | `nudge.{normal,happy,annoyed,angry}` +6 each, `overdue` +5, `overdue.worried` +3, `overdue.repeating` +2, `voice.grumble` +2, `voice.angry` +3 | 39 |
| 6 | 4, planning and distraction | `plan.{normal,annoyed,angry}` +4 each, `distraction` +6, `distraction.angry` +3, `grumble` +4, `parade` +5, `block` +4, `voice.block` +2 | 36 |
| 7 | 5, greeting, morning, care | `greeting.*` +3 each, `morning.{plan,frogPicked,frog}` +5 each, `dirty` +4, `cleaned` +3, `cleaned.clean` +2 | 36 |
| 8 | 6, focus and breaks | `focusStart.task` +5, `focusStart` +3, `focusEnd.task` +5, `focusEnd` +3, `breakStart` +4, `breakEnd` +4, `backToWork` +5, `welcomeBack` +7, `voice.hungry` +2 | 38 |
| 9 | 7, starters, postponed, meetings | `starterStart.task` +3, `starterStart` +2, `starterEnd.task` +3, `starterEnd` +2, `starterGone` +2, `starterEnough` +3, `stuck` +4, `stuck.angry` +3, `splitDone` +2, `soon` +3, `dueNow` +3, `meetingOver` +3 | 33 |
| 10 | 8, day's end, trips, tips | `review` +5, `review.clear` +3, `review.empty` +2, `lateNight` +4, `newWeek.recap` +4, `newWeek` +2, `tripOffer` +4, `tripStart` +3, `tripBack.{souvenir,stories,early}` +2 each, `tripStayed` +2, `tip` +8 | 43 |

Batch-specific steps:
- **Task 4:** strengthen Task 1's brain test with `expect(first).toBeDefined()` and see it pass; the overnight-growth test (~line 362) accepts any `levelUp` option (`everyOption`).
- **Task 5:** the `overdue` lines keep what `core.test.ts` checks for every option (a fresh start offered only when tasks can move; the repeating count). Shorten `overdue.worried#0` and `overdue.repeating#0` (`sửa`).
- **Task 7:** the morning greeting joins two packs; `everyOption` covers the combinations in tests.
- **Task 10:** `review` lines keep the move-to-day question the tests check; shorten `tripBack.souvenir#0` and `tripBack.stories#0` (`sửa`).

### Task 11: Everything filled

**Files:** `src/core/lines.test.ts`, `docs/SPEC.md`.

- [ ] **Step 1:** `FILLED` becomes every key (remove the set; the target lint covers `KEYS`); add "`TARGETS` names exactly the keys of `KEYS`"; `UNTIL_REVIEWED` is empty and removed. Run `npx vitest run src/core/lines.test.ts` → PASS.
- [ ] **Step 2:** The spec's Targets table matches `TARGETS`; phase 2 marked done.
- [ ] **Step 3: Demo.** `npm run dev`, open `?demo`, finish 6 tasks: 6 different done lines, the first one `done.first`; switch language, still no repeat. Check one long Vietnamese line fits its bubble.
- [ ] **Step 4:** `npm run typecheck`, `npm test` green. Commit `test(lines): every key reaches its target`.
- [ ] **Step 5:** Whole-branch review, then a PR to `main` (no release).
