# Non-repeating dialogue, phase 1 (engine, same words) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every varied line the pet says goes through a memory that keeps it from repeating, with today's words unchanged.

**Architecture:** A pure chooser (`src/core/variety.ts`) picks an option index from a per-key memory of last-said times. Line functions in `src/core/lines.ts` build packs of `[vi, en]` options and hand them to a required `say: Phrase` parameter. The brain's `phrase` chooses, records the choice in `LifeState.said` (routine save) and returns the text.

**Tech Stack:** TypeScript, Vitest (`npm test`), `npm run typecheck`.

**Spec:** `docs/SPEC.md`, section "v0.8 'Có hồn' → 1. Non-repeating dialogue". Phase 1 only: no new lines, no `done` contexts beyond `done.target`, no length lint, no per-key targets.

## Global Constraints

- `FRESH_MS = 48 * 60 * 60 * 1000`; `MAX_KEYS = 200`; `MAX_OPTIONS = 40`.
- Key pattern: `/^[a-z][a-zA-Z0-9.]{0,63}$/`.
- The memory stores option indices and times only, never text (lines carry task titles).
- `LifeState.said: Record<string, SaidEntry>`, `SaidEntry = { n: number; at: number[] }`, `at[i]` epoch ms, 0 = never.
- Packs with one option are never stored.
- Saved with `mutateLife(..., "routine")`.
- Labels, buttons, errors, confirmations, update texts, streak bookkeeping and onboarding stay fixed `L(...)` lines.
- Every option is a `[vi, en]` pair; append-only (note this in a comment at the top of `lines.ts`).

## Review Focus

- **A call site passes a random phrase instead of `this.phrase`** (memory silently skipped): Task 4's brain test checks `said` gains the `done` key after a completion.
- **Language switched mid-day**: one memory serves both languages; Task 4 tests that a line said in English is not chosen again in Vietnamese.
- **A pack that shrinks or grows between versions** (stored `n` differs): Task 1 tests the key is treated as fresh and rewritten with the new `n`.
- **A clock that jumps back a year**: Task 1 tests the 30-day simulation recovers within 48 h after the jump.
- **Corrupt or hand-edited saved state** (`said` not an object, `null` entries, huge arrays): Task 1's `normalizeSaid` table and Task 2's `lifeFromJson` test.

---

### Task 1: The chooser (`variety.ts`)

**Files:**
- Create: `src/core/variety.ts`
- Test: `src/core/variety.test.ts`

**Interfaces:**
- Produces:
  - `type Pack = { key: string; options: readonly (readonly [vi: string, en: string])[] }`
  - `type Phrase = (pack: Pack) => string`
  - `interface SaidEntry { n: number; at: number[] }`
  - `const FRESH_MS`, `MAX_KEYS`, `MAX_OPTIONS`, `LINE_KEY: RegExp`
  - `chooseLine(n: number, entry: SaidEntry | undefined, now: number, random: () => number): number`
  - `remember(entry: SaidEntry | undefined, n: number, index: number, now: number): SaidEntry`
  - `withEntry(said: Readonly<Record<string, SaidEntry>>, key: string, entry: SaidEntry): Record<string, SaidEntry>`
  - `normalizeSaid(raw: unknown): Record<string, SaidEntry>`

- [ ] **Step 1: Write the failing tests** in `src/core/variety.test.ts`:
  - `chooseLine` picks only among never-said or ≥ `FRESH_MS`-old options (entry `{ n: 3, at: [now, 0, now - FRESH_MS] }` → index 1 or 2 for `random` 0, 0.5, 0.99).
  - With no fresh option it returns the least recently said, lowest index on ties (`{ n: 3, at: [now-3, now-1, now-3] }` → 0).
  - An entry whose `n` differs from the pack's counts as empty (`chooseLine(4, { n: 3, at: [...] }, …)` may return 3).
  - A future time counts as now (`at: [now + 1e12, now - FRESH_MS]` → 1).
  - `remember` sets `at[index] = now`, clamps every other time to `≤ now`, pads/cuts to `n`, and starts from zeros when `entry.n !== n`.
  - `withEntry` with 201 keys keeps 200, dropping the key whose newest time is oldest.
  - 30-day simulation: seeded random (mulberry32 seed 7, as in `src/pets/motion.ts`), a fake clock, 15 picks a day at 30-minute steps from 9:00, pack sizes 1, 2, 4, 20:
    no option repeats within 48 h while a fresh one existed at that moment; with `n ≥ 2` never the same index twice in a row.
  - Clock jump: after day 10 the clock goes back 365 days; within 48 h of the jump, picks are again only fresh options.
  - `normalizeSaid` table: `null`, `[]`, `"x"` → `{}`; bad key (`"Done"`, `"1x"`, 65 chars) dropped; `n` 0, 41, 2.5, `"3"` → key dropped; `at` with `NaN`, `-1`, `"5"`, `null` → those positions 0, others kept in place; `at` longer than `n` cut, shorter padded; 250 valid keys → 200, oldest dropped.
- [ ] **Step 2: Run** `npx vitest run src/core/variety.test.ts` — expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/core/variety.ts`** with the interfaces above. `chooseLine`: when fresh options exist, `fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))]`; otherwise the minimum of `min(at[i], now)`.
- [ ] **Step 4: Run** `npx vitest run src/core/variety.test.ts` — expected: PASS.
- [ ] **Step 5: Commit** `feat(core): a chooser that keeps lines from repeating`.

### Task 2: The memory in the pet's state (`life.ts`)

**Files:**
- Modify: `src/core/life.ts` (`LifeState`, `newLife`, `lifeFromJson`)
- Test: `src/core/variety.test.ts` (one more `describe`)

**Interfaces:**
- Consumes: `SaidEntry`, `normalizeSaid` (Task 1).
- Produces: `LifeState.said: Record<string, SaidEntry>` (doc comment: indices and times only, never text).

- [ ] **Step 1: Write the failing test** `lifeFromJson keeps the line memory and repairs it`:
  `lifeFromJson({ said: { done: { n: 4, at: [5, "x", null, 9] } } }).said` equals `{ done: { n: 4, at: [5, 0, 0, 9] } }`; `lifeFromJson({}).said` equals `{}`; `lifeFromJson(JSON.parse(JSON.stringify(life)))` round-trips `said`.
- [ ] **Step 2: Run** `npx vitest run src/core/variety.test.ts` — expected: FAIL.
- [ ] **Step 3: Add the field**: `said: {}` in `newLife`, `said: normalizeSaid(r.said)` in `lifeFromJson`.
- [ ] **Step 4: Run** `npx vitest run src/core/` and `npm run typecheck` — expected: PASS (fix any `LifeState` literal the compiler names).
- [ ] **Step 5: Commit** `feat(life): remember which lines were said, by index only`.

### Task 3: Line functions build packs (`lines.ts`)

**Files:**
- Modify: `src/core/lines.ts`
- Modify: `src/core/core.test.ts` (voice and overdue calls), `src/core/review.test.ts` (`meetingOver` calls): pass `lines.randomPhrase`
- Test: `src/core/lines.test.ts` (new)

**Interfaces:**
- Consumes: `Pack`, `Phrase` (Task 1).
- Produces: `export const randomPhrase: Phrase` (picks with `pick` from `l10n.ts`, so `Math.random` mocks still work); each function below gains a last, required `say: Phrase` parameter (after any existing optional ones), still returns `string`.

Each branch's chatter becomes `say({ key, options: [...today's pairs] })`; suffixes listed as fixed stay `L(...)`. Keys:

| Function | Branch → key |
|---|---|
| `greeting(now, say)` | `greeting.morning` (<11h), `.midday` (<13h), `.afternoon` (<18h), `.evening` |
| `morning(..., plan, say)` | planned < target → `morning.plan`; next is the picked frog → `morning.frogPicked`; next → `morning.frog`; frog and note lines fixed |
| `plan` | `plan.angry`, `plan.annoyed`, `plan.normal` |
| `nudge` | `nudge.happy`, `nudge.annoyed`, `nudge.angry`, `nudge.normal` |
| `overdue` | movable 0 → `overdue.repeating`; annoyed/angry → `overdue.worried`; else `overdue`; `staysPut` suffix fixed |
| `distraction` | angry with next → `distraction.angry`; else `distraction` |
| `done` | completed === target → `done.target`; else `done` |
| `review` | left 0 and completed > 0 → `review.clear`; left 0 → `review.empty`; else `review` |
| `focusStart`, `focusEnd`, `starterStart`, `starterEnd`, `planComplete` | with a task (`planComplete`: with next) → `<name>.task` / `planComplete.next`; else `<name>` |
| `starterGone(t, say)` | with a task → `starterGone`; else `starterEnd(null, say)` |
| `meetingOver` | first line → `meetingOver`; the breather line fixed |
| `stuck` | angry → `stuck.angry`; else `stuck` |
| `cleaned` | dirt 0 → `cleaned.clean`; else `cleaned` |
| `hungry` | satiety < 10 → `hungry.starving`; else `hungry`; the next-task suffix fixed |
| `block` | first part → `block`; the next-task suffix fixed |
| `tripBack` | souvenir → `tripBack.souvenir`; xp → `tripBack.stories`; else `tripBack.early` |
| `newWeek` | with a recap → `newWeek.recap`; else `newWeek` |
| `voiceCheer`, `voiceGrumble`, `voiceAngry`, `voiceBlock`, `voiceHungry` | `voice.cheer`, `voice.grumble`, `voice.angry`, `voice.block`, `voice.hungry` |
| `allDone`, `backToWork`, `welcomeBack`, `soon`, `dueNow`, `breakStart`, `breakEnd`, `lateNight`, `starterEnough`, `splitDone`, `levelUp`, `streak`, `dirty`, `golden`, `combo`, `grumble`, `parade`, `tip`, `tripOffer`, `tripStayed`, `tripStart` | the function's name |

- [ ] **Step 1: Write the failing lint test** `src/core/lines.test.ts`: call every function in the table with sample arguments covering each branch (a task titled `"⟦T⟧"`, an app `"⟦A⟧"`, a place, the four greeting hours, every mood), passing a recording `Phrase` that stores each pack and returns its first English option. For every recorded pack: key matches `LINE_KEY`; 1…`MAX_OPTIONS` options; no empty string; no duplicate within a pack (per language); every `⟦…⟧` marker in one language is in the other. Also: the set of recorded keys equals the table's keys (so a branch that skips `say` fails).
- [ ] **Step 2: Run** `npx vitest run src/core/lines.test.ts` — expected: FAIL (`randomPhrase` not exported / functions take no `say`).
- [ ] **Step 3: Convert the functions** per the table, words unchanged; add the append-only comment at the top of `lines.ts`; update the three existing test files to pass `lines.randomPhrase`.
- [ ] **Step 4: Run** `npx vitest run src/core/lines.test.ts src/core/core.test.ts src/core/review.test.ts` — expected: PASS. `npm run typecheck` fails only at `brain.ts` call sites (fixed in Task 4).
- [ ] **Step 5: Commit** together with Task 4 (the tree does not type-check between them).

### Task 4: The brain phrases with its memory (`brain.ts`)

**Files:**
- Modify: `src/core/brain.ts` (a `phrase` property; every call of a table function)
- Test: `src/core/brain.test.ts`

**Interfaces:**
- Consumes: `chooseLine`, `remember`, `withEntry`, `Phrase` (Task 1); `LifeState.said` (Task 2); the `say` parameters (Task 3).
- Produces: `private readonly phrase: Phrase` — one option: its text, nothing stored; otherwise `chooseLine` with `this.random` and `this.now()`, then `mutateLife((s) => { s.said = withEntry(s.said, key, remember(...)) }, "routine")`, then `L(...options[i])`.

- [ ] **Step 1: Write the failing tests** in `brain.test.ts` (rig with `prefs: { dailyTarget: 10 }`, tasks added with `brain.add(title, "today", 1)`):
  - `finishing tasks says every done line once before any comes back`: complete 5 tasks through the pet; the first line of the first 4 completion bubbles is 4 different `done` options; the 5th differs from the 4th; every completion bubble has an Undo action; `life.said.done.n === 4`.
  - `the saved state never holds a task title`: add and finish a task titled `"SENTINEL-7f3a"`; a completion saves the life at once (`broadcast` mode), so `vi.waitFor` until `await backend.storage.load("life")` has `said.done`, then `JSON.stringify` of it does not contain `"SENTINEL-7f3a"`.
  - `the line memory survives a restart`: after 3 completions, stop the brain, create a new `Brain` on the same backend (persisting storage), complete one more task: its line is the 4th, unused option.
  - `one memory for both languages`: finish one task with `setLang("en")`, then `setLang("vi")` and finish another: `life.said.done.at` has two different non-zero positions, and the second bubble's first line is the Vietnamese text of an option other than the first's.
- [ ] **Step 2: Run** `npx vitest run src/core/brain.test.ts -t "done line|task title|restart|both languages"` — expected: FAIL (type errors at call sites count as failing).
- [ ] **Step 3: Implement** `phrase` and pass `this.phrase` at every call of a table function (`npm run typecheck` lists any that are left). No call may sit inside a `mutateLife` callback (none does today).
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — expected: all green. Existing tests that asserted one of several random options now see the chooser's pick for `random: () => 0.5`; if one asserts an exact multi-option line, change it to accept any option of that key.
- [ ] **Step 5: Commit** Tasks 3 and 4: `feat(brain): every varied line goes through a memory, words unchanged`.

### Task 5: Verify and hand over

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run build` — all green.
- [ ] **Step 2:** Demo (`/overlay.html?demo`): finish 4 tasks with the demo panel; the 4 cheers differ; reload the page and finish another: no repeat of the last one.
- [ ] **Step 3:** Code review of the branch (fresh reviewer), fix findings.
- [ ] **Step 4:** Push the branch and open a PR for phase 1.
