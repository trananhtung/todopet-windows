// Every line the pet varies goes through `say` with a well-formed pack (SPEC v0.8 §1). Calls each line function with
// sample arguments covering every branch, records the packs and checks them.
import { describe, expect, it } from "vitest";
import type { CalEvent } from "./calendar";
import * as lines from "./lines";
import { taskFromRaw } from "./models";
import { SOUVENIR_IDS } from "./trips";
import type { Mood } from "./types";
import { LINE_KEY, MAX_OPTIONS, type Pack, type Phrase } from "./variety";

const T = taskFromRaw({ id: "1", content: "⟦T⟧" });
const at = (h: number, m = 0) => new Date(2026, 9, 30, h, m);
const meeting = (title: string, h: number): CalEvent => ({ id: title, title, start: at(h), end: at(h + 1), joinUrl: null });
const MOODS: readonly Mood[] = ["happy", "normal", "annoyed", "angry", "sleeping", "focus", "celebrating"];
const place = SOUVENIR_IDS[0];

/**
 * Numbers the sample calls fill in. Each is distinctive enough to find in a line, so the lint can check it shows in both
 * languages or in neither. A branch that needs another value (0, 1, satiety under 10) keeps it, unchecked.
 */
const NUMS = [13, 17, 23, 29, 30, 37, 41, 43, 47];

/** Calls every varied line function once per branch, with numbers from `NUMS` and times at minute 37. */
function sayEverything(say: Phrase): void {
  for (const h of [8, 12, 15, 20]) lines.greeting(at(h), say);
  lines.morning(at(8), 13, 47, T, 17, null, say);
  lines.morning(at(8), 17, 23, T, 17, { frog: T, note: "⟦N⟧" }, say);
  lines.morning(at(8), 17, 23, T, 17, null, say);
  lines.morning(at(8), 17, 0, null, 17, null, say);
  for (const mood of MOODS) {
    lines.plan(mood, 13, 30, say);
    lines.nudge(mood, T, 23, say);
    lines.overdue(mood, 13, 17, say);
    lines.distraction(mood, "⟦A⟧", 29, T, say);
    lines.stuck({ task: T, days: 37 }, mood, say);
  }
  lines.overdue("normal", 0, 23, say);
  lines.distraction("angry", "⟦A⟧", 29, null, say);
  const doneIn = (over: Partial<lines.DoneContext>) =>
    lines.done(T, { completed: 13, target: 17, sound: "⟦S⟧", frog: false, stuck: false, hour: 11, weekday: 3, ...over }, say);
  for (const over of [{}, { completed: 17 }, { stuck: true }, { frog: true }, { completed: 1 }, { hour: 7 }, { weekday: 5, hour: 16 }]) doneIn(over);
  lines.allDone(say);
  lines.review(13, 17, 0, null, say);
  lines.review(0, 17, 0, null, say);
  lines.review(13, 17, 23, "⟦D⟧", say);
  lines.backToWork(say);
  lines.welcomeBack(T, say);
  lines.soon(T, 41, say);
  lines.dueNow(T, say);
  lines.focusStart(T, 43, say);
  lines.focusStart(null, 43, say);
  lines.focusEnd(T, 43, say);
  lines.focusEnd(null, 47, say);
  lines.focusEnd(null, 1, say);
  lines.breakStart(13, say);
  lines.breakEnd(say);
  lines.planComplete(17, T, say);
  lines.planComplete(17, null, say);
  lines.lateNight(say);
  lines.meetingOver(meeting("⟦E⟧", 10), meeting("⟦F⟧", 11), 29, say);
  lines.starterStart(T, 23, say);
  lines.starterStart(null, 23, say);
  lines.starterEnd(T, say);
  lines.starterEnd(null, say);
  lines.starterGone(T, say);
  lines.starterGone(null, say);
  lines.starterEnough(say);
  lines.splitDone(13, "⟦F⟧", say);
  lines.cleaned(0, say);
  lines.cleaned(13, say);
  lines.levelUp(2, say);
  lines.streak(37, say);
  lines.dirty(41, say);
  lines.golden(say);
  lines.combo(43, say);
  lines.hungry(5, T, say);
  lines.hungry(47, null, say);
  lines.grumble(T, say);
  lines.parade(T, say);
  lines.block("⟦A⟧", T, say);
  lines.voiceCheer(say);
  lines.voiceGrumble(say);
  lines.voiceAngry(T, say);
  lines.voiceBlock("⟦A⟧", say);
  lines.voiceHungry(say);
  lines.tip(say);
  lines.tripOffer(at(15, 37), say);
  lines.tripStayed(say);
  lines.tripStart("⟦P⟧", at(17, 37), say);
  lines.tripBack({ place, minutes: 60, souvenir: place, xp: 0 }, say);
  lines.tripBack({ place, minutes: 60, souvenir: null, xp: 47 }, say);
  lines.tripBack({ place, minutes: 10, souvenir: null, xp: 0 }, say);
  lines.newWeek({ key: "2026-10-26", done: 13, stickers: 17, trips: 23 }, say);
  lines.newWeek(null, say);
}

/** The keys of the plan's table: every one of them, and nothing else, goes through `say`. */
const KEYS = [
  "greeting.morning", "greeting.midday", "greeting.afternoon", "greeting.evening",
  "morning.plan", "morning.frogPicked", "morning.frog",
  "plan.angry", "plan.annoyed", "plan.normal",
  "nudge.happy", "nudge.annoyed", "nudge.angry", "nudge.normal",
  "overdue.repeating", "overdue.worried", "overdue",
  "distraction.angry", "distraction",
  "done.target", "done.stuck", "done.frog", "done.first", "done.early", "done.friday", "done", "allDone",
  "review.clear", "review.empty", "review",
  "backToWork", "welcomeBack", "soon", "dueNow",
  "focusStart.task", "focusStart", "focusEnd.task", "focusEnd", "breakStart", "breakEnd",
  "planComplete.next", "planComplete", "lateNight", "meetingOver",
  "starterStart.task", "starterStart", "starterEnd.task", "starterEnd", "starterGone", "starterEnough",
  "stuck.angry", "stuck", "splitDone",
  "cleaned.clean", "cleaned", "levelUp", "streak", "dirty", "golden", "combo", "hungry.starving", "hungry",
  "grumble", "parade", "block",
  "voice.cheer", "voice.grumble", "voice.angry", "voice.block", "voice.hungry",
  "tip", "tripOffer", "tripStayed", "tripStart", "tripBack.souvenir", "tripBack.stories", "tripBack.early",
  "newWeek.recap", "newWeek",
];

/**
 * Options per key when every batch of v0.8 is in (SPEC v0.8 §1, Targets). A key counts once it is in `FILLED`; every
 * batch adds its keys there, and the last one checks them all.
 */
const TARGETS: Record<string, number> = {
  "greeting.morning": 4, "greeting.midday": 4, "greeting.afternoon": 4, "greeting.evening": 4,
  "morning.plan": 6, "morning.frogPicked": 6, "morning.frog": 6,
  "plan.normal": 6, "plan.annoyed": 6, "plan.angry": 6,
  "nudge.normal": 8, "nudge.happy": 8, "nudge.annoyed": 8, "nudge.angry": 8,
  overdue: 6, "overdue.worried": 4, "overdue.repeating": 3,
  distraction: 8, "distraction.angry": 4, grumble: 6, parade: 6, block: 5,
  done: 20, "done.target": 6, "done.stuck": 6, "done.frog": 6, "done.first": 6, "done.early": 5, "done.friday": 5,
  allDone: 8, "planComplete.next": 6, planComplete: 4,
  hungry: 6, "hungry.starving": 3, dirty: 5, cleaned: 4, "cleaned.clean": 3, golden: 4, combo: 5, levelUp: 4, streak: 6,
  "focusStart.task": 6, focusStart: 4, "focusEnd.task": 6, focusEnd: 4, breakStart: 5, breakEnd: 5, backToWork: 6, welcomeBack: 8,
  "starterStart.task": 4, starterStart: 3, "starterEnd.task": 4, starterEnd: 3, starterGone: 3, starterEnough: 4,
  stuck: 6, "stuck.angry": 4, splitDone: 3,
  soon: 4, dueNow: 4, meetingOver: 4,
  review: 6, "review.clear": 4, "review.empty": 3, lateNight: 5, "newWeek.recap": 5, newWeek: 3,
  tripOffer: 5, tripStart: 4, "tripBack.souvenir": 3, "tripBack.stories": 3, "tripBack.early": 3, tripStayed: 3,
  tip: 14, "voice.cheer": 6, "voice.grumble": 4, "voice.angry": 4, "voice.block": 3, "voice.hungry": 3,
};
/** The keys whose batch is in: they must reach their target. */
const FILLED = new Set<string>([
  // Batch 1: finishing a task, by context.
  "done", "done.target", "done.stuck", "done.frog", "done.first", "done.early", "done.friday",
  // Batch 2: finishing the day's plan, and the pet's rewards.
  "allDone", "planComplete.next", "planComplete", "voice.cheer", "combo", "golden", "levelUp", "streak", "hungry", "hungry.starving",
]);
/** Keys that shipped (0.7.1) with more than one option. A pack never shrinks: an option's index is its identity. */
const SHIPPED: Record<string, number> = {
  "plan.normal": 2, "plan.annoyed": 2, "plan.angry": 2,
  "nudge.normal": 2, "nudge.happy": 2, "nudge.annoyed": 2, "nudge.angry": 2,
  distraction: 2, grumble: 2, stuck: 2, done: 4, "voice.cheer": 2, "voice.grumble": 2, tip: 6,
};
/** Shipped options that break a rule below, each until the batch that rewrites it (`key#index` → why). */
const UNTIL_REVIEWED: Record<string, string> = {
  "overdue.worried#0": "too long; batch 3",
  "overdue.repeating#0": "too long; batch 3",
  "tripBack.souvenir#0": "too long; batch 8",
  "tripBack.stories#0": "too long; batch 8",
};

const markers = (s: string) => [...s.matchAll(/⟦.⟧/g)].map((m) => m[0]).sort();
const hasNumber = (s: string, v: number) => new RegExp(`(?<!\\d)${v}(?!\\d)`).test(s);
/** Code points a line takes before a title (app, place…) is filled in. */
const bare = (s: string) => [...s.replace(/“⟦.⟧”|⟦.⟧/g, "")].length;

describe("the packs every varied line goes through", () => {
  const packs: Pack[] = [];
  sayEverything((p) => {
    packs.push(p);
    return p.options[0]?.[1] ?? "";
  });

  it("covers every key of the table, and only those", () => {
    expect([...new Set(packs.map((p) => p.key))].sort()).toEqual([...KEYS].sort());
  });

  it("uses well-formed packs: a line key, 1 to 40 options, no empty or repeated line", () => {
    for (const p of packs) {
      expect(p.key, p.key).toMatch(LINE_KEY);
      expect(p.options.length, p.key).toBeGreaterThanOrEqual(1);
      expect(p.options.length, p.key).toBeLessThanOrEqual(MAX_OPTIONS);
      for (const lang of [0, 1] as const) {
        const texts = p.options.map((o) => o[lang]);
        for (const text of texts) expect(text.trim(), p.key).not.toBe("");
        expect(new Set(texts).size, `${p.key}: a line twice`).toBe(texts.length);
      }
    }
  });

  it("fills in the same things in both languages", () => {
    for (const p of packs) for (const [vi, en] of p.options) expect(markers(vi), `${p.key}: ${vi} / ${en}`).toEqual(markers(en));
  });

  it("fills in the same numbers in both languages", () => {
    for (const p of packs)
      for (const [vi, en] of p.options) for (const v of NUMS) expect(hasNumber(vi, v), `${p.key}, ${v}: ${vi} / ${en}`).toBe(hasNumber(en, v));
  });

  it("keeps a key's pack the same size wherever it is said", () => {
    const sizes = new Map<string, Set<number>>();
    for (const p of packs) sizes.set(p.key, (sizes.get(p.key) ?? new Set<number>()).add(p.options.length));
    for (const [key, n] of sizes) expect([...n], key).toHaveLength(1);
  });

  it("keeps lines short: done lines at most 60 characters, the rest 90, before a title is filled in", () => {
    for (const p of packs)
      p.options.forEach((option, i) => {
        if (`${p.key}#${i}` in UNTIL_REVIEWED) return;
        const max = p.key === "done" || p.key.startsWith("done.") ? 60 : 90;
        for (const text of option) expect(bare(text), `${p.key}#${i}: ${text}`).toBeLessThanOrEqual(max);
      });
  });

  it("never has fewer options than it shipped with", () => {
    for (const p of packs) expect(p.options.length, p.key).toBeGreaterThanOrEqual(SHIPPED[p.key] ?? 1);
  });

  it("gives every key a target, and the filled ones reach it", () => {
    for (const key of KEYS) expect(TARGETS[key], key).toBeGreaterThanOrEqual(1);
    for (const p of packs) if (FILLED.has(p.key)) expect(p.options.length, p.key).toBeGreaterThanOrEqual(TARGETS[p.key]);
  });

  it("says the most specific done line", () => {
    const ctx = (over: Partial<lines.DoneContext>): lines.DoneContext => ({
      completed: 2, target: 13, sound: "⟦S⟧", frog: false, stuck: false, hour: 11, weekday: 3, ...over,
    });
    const keyOf = (c: lines.DoneContext) => {
      let key = "";
      lines.done(T, c, (p) => {
        key = p.key;
        return "";
      });
      return key;
    };
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

  it("hands random picks to tests that don't care which line", () => {
    expect(lines.voiceCheer(lines.randomPhrase)).not.toBe("");
  });
});
