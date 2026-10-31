// Which line the pet says (SPEC v0.8 §1): nothing said in the last two days while a fresh line is left, and never the
// same line twice in a row. Pure: the brain keeps the memory in `LifeState.said` and passes the clock and the dice.
import { L } from "./l10n";

/** The options of one situation, each a [vi, en] pair. Append only: an option's index is its identity in the memory. */
export interface Pack {
  key: string;
  options: readonly (readonly [vi: string, en: string])[];
}

/** Turns a pack into the text the pet says. */
export type Phrase = (pack: Pack) => string;

/**
 * When each option of a pack was last said (epoch ms, 0 = never), for a pack of `n` options. Indices and times only,
 * never text: lines carry task titles, and the pet never stores those.
 */
export interface SaidEntry {
  n: number;
  at: number[];
}

/** A line said this long ago (or longer) is fresh again. */
export const FRESH_MS = 48 * 60 * 60 * 1000;
/** Keys the memory keeps; the ones used longest ago go first. */
export const MAX_KEYS = 200;
/** Options a pack may have. */
export const MAX_OPTIONS = 40;
export const LINE_KEY = /^[a-z][a-zA-Z0-9.]{0,63}$/;

/** When option `i` was last said, a time after `now` counting as now (the clock went back). */
const saidAt = (entry: SaidEntry | undefined, n: number, i: number, now: number): number =>
  Math.min(entry?.n === n ? (entry.at[i] ?? 0) : 0, now);

/**
 * The option to say: a random fresh one (never said, or said `FRESH_MS` ago or more) while any is left, else the one
 * said longest ago, so a small pack cycles and never says the same line twice in a row. Ties (all in the future after
 * the clock went back) go to the earliest time as stored, then to the first. An entry made for a pack of another size
 * counts as empty.
 */
export function chooseLine(n: number, entry: SaidEntry | undefined, now: number, random: () => number): number {
  if (n <= 1) return 0;
  const fresh: number[] = [];
  for (let i = 0; i < n; i++) if (now - saidAt(entry, n, i, now) >= FRESH_MS) fresh.push(i);
  if (fresh.length > 0) return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
  const stored = (i: number) => (entry?.n === n ? (entry.at[i] ?? 0) : 0);
  let oldest = 0;
  for (let i = 1; i < n; i++) {
    const a = saidAt(entry, n, i, now);
    const b = saidAt(entry, n, oldest, now);
    if (a < b || (a === b && stored(i) < stored(oldest))) oldest = i;
  }
  return oldest;
}

/**
 * A new entry with option `index` said now and `n` slots. Every other time is pulled back to just before `now` at most
 * (the clock went back), so the line said now stays the newest and the next pick cannot tie with it.
 */
export function remember(entry: SaidEntry | undefined, n: number, index: number, now: number): SaidEntry {
  const at = Array.from({ length: n }, (_, i) => Math.min(entry?.n === n ? (entry.at[i] ?? 0) : 0, now - 1));
  at[index] = now;
  return { n, at };
}

/**
 * A `say` for text that is rebuilt while it waits (the day-close note): each key is chosen once with `pick`, then the
 * same option comes back every time, in the language of the moment.
 */
export function stickyPhrase(pick: (pack: Pack) => number): Phrase {
  const chosen = new Map<string, number>();
  return (pack) => {
    let i = chosen.get(pack.key);
    if (i === undefined) {
      i = pick(pack);
      chosen.set(pack.key, i);
    }
    const option = pack.options[i];
    return option ? L(option[0], option[1]) : "";
  };
}

const newest = (entry: SaidEntry): number => entry.at.reduce((a, b) => Math.max(a, b), 0);

/** The `MAX_KEYS` keys said most recently. */
function keepRecent(said: Record<string, SaidEntry>): Record<string, SaidEntry> {
  const keys = Object.keys(said);
  if (keys.length <= MAX_KEYS) return said;
  const keep = new Set(keys.sort((a, b) => newest(said[b]) - newest(said[a])).slice(0, MAX_KEYS));
  return Object.fromEntries(Object.entries(said).filter(([key]) => keep.has(key)));
}

/** The memory with `key` set to `entry`, still at most `MAX_KEYS` keys. */
export function withEntry(said: Readonly<Record<string, SaidEntry>>, key: string, entry: SaidEntry): Record<string, SaidEntry> {
  return keepRecent({ ...said, [key]: entry });
}

/**
 * The memory as saved, made safe: only line keys and sizes from 1 to `MAX_OPTIONS`; every position is kept, a missing
 * or bad time counting as never said, so indices never shift; at most `MAX_KEYS` keys.
 */
export function normalizeSaid(raw: unknown): Record<string, SaidEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, SaidEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!LINE_KEY.test(key) || !value || typeof value !== "object") continue;
    const { n, at } = value as { n?: unknown; at?: unknown };
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_OPTIONS) continue;
    const times: unknown[] = Array.isArray(at) ? at : [];
    out[key] = {
      n,
      at: Array.from({ length: n }, (_, i) => {
        const t = times[i];
        return typeof t === "number" && Number.isFinite(t) && t >= 0 ? t : 0;
      }),
    };
  }
  return keepRecent(out);
}
