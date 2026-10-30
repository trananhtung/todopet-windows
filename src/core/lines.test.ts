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
const at = (h: number) => new Date(2026, 9, 30, h);
const meeting = (title: string, h: number): CalEvent => ({ id: title, title, start: at(h), end: at(h + 1), joinUrl: null });
const MOODS: readonly Mood[] = ["happy", "normal", "annoyed", "angry", "sleeping", "focus", "celebrating"];
const place = SOUVENIR_IDS[0];

/** Calls every varied line function once per branch. */
function sayEverything(say: Phrase): void {
  for (const h of [8, 12, 15, 20]) lines.greeting(at(h), say);
  lines.morning(at(8), 1, 3, T, 3, null, say);
  lines.morning(at(8), 3, 3, T, 3, { frog: T, note: "⟦N⟧" }, say);
  lines.morning(at(8), 3, 3, T, 3, null, say);
  lines.morning(at(8), 3, 0, null, 3, null, say);
  for (const mood of MOODS) {
    lines.plan(mood, 1, 3, say);
    lines.nudge(mood, T, 2, say);
    lines.overdue(mood, 2, 1, say);
    lines.distraction(mood, "⟦A⟧", 2, T, say);
    lines.stuck({ task: T, days: 4 }, mood, say);
  }
  lines.overdue("normal", 0, 2, say);
  lines.distraction("angry", "⟦A⟧", 2, null, say);
  lines.done(T, 1, 3, "⟦S⟧", say);
  lines.done(T, 3, 3, "⟦S⟧", say);
  lines.allDone(say);
  lines.review(2, 3, 0, null, say);
  lines.review(0, 3, 0, null, say);
  lines.review(2, 3, 1, "⟦D⟧", say);
  lines.backToWork(say);
  lines.welcomeBack(T, say);
  lines.soon(T, 10, say);
  lines.dueNow(T, say);
  lines.focusStart(T, 25, say);
  lines.focusStart(null, 25, say);
  lines.focusEnd(T, 25, say);
  lines.focusEnd(null, 1, say);
  lines.breakStart(5, say);
  lines.breakEnd(say);
  lines.planComplete(3, T, say);
  lines.planComplete(3, null, say);
  lines.lateNight(say);
  lines.meetingOver(meeting("⟦E⟧", 10), meeting("⟦F⟧", 11), 4, say);
  lines.starterStart(T, 2, say);
  lines.starterStart(null, 2, say);
  lines.starterEnd(T, say);
  lines.starterEnd(null, say);
  lines.starterGone(T, say);
  lines.starterGone(null, say);
  lines.starterEnough(say);
  lines.splitDone(3, "⟦F⟧", say);
  lines.cleaned(0, say);
  lines.cleaned(1, say);
  lines.levelUp(2, say);
  lines.streak(4, say);
  lines.dirty(2, say);
  lines.golden(say);
  lines.combo(3, say);
  lines.hungry(5, T, say);
  lines.hungry(20, null, say);
  lines.grumble(T, say);
  lines.parade(T, say);
  lines.block("⟦A⟧", T, say);
  lines.voiceCheer(say);
  lines.voiceGrumble(say);
  lines.voiceAngry(T, say);
  lines.voiceBlock("⟦A⟧", say);
  lines.voiceHungry(say);
  lines.tip(say);
  lines.tripOffer(at(15), say);
  lines.tripStayed(say);
  lines.tripStart("⟦P⟧", at(17), say);
  lines.tripBack({ place, minutes: 60, souvenir: place, xp: 0 }, say);
  lines.tripBack({ place, minutes: 60, souvenir: null, xp: 20 }, say);
  lines.tripBack({ place, minutes: 10, souvenir: null, xp: 0 }, say);
  lines.newWeek({ key: "2026-10-26", done: 5, stickers: 2, trips: 1 }, say);
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
  "done.target", "done", "allDone",
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

const markers = (s: string) => [...s.matchAll(/⟦.⟧/g)].map((m) => m[0]).sort();

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

  it("hands random picks to tests that don't care which line", () => {
    expect(lines.voiceCheer(lines.randomPhrase)).not.toBe("");
  });
});
