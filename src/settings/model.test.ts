import { describe, expect, it } from "vitest";
import { BackendError } from "../backend/types";
import { setLang } from "../core/l10n";
import { newLife } from "../core/life";
import { defaultPrefs, prefsFromJson } from "../core/prefs";
import {
  NUMBER_LIMITS,
  type NumberKey,
  PET_SCALE,
  changedEvents,
  checkCalendarText,
  hourLabel,
  listItems,
  parseBounded,
  secretErrorText,
  sectionFromHash,
  unlockProgress,
  workHoursProblem,
} from "./model";

describe("sectionFromHash", () => {
  it("reads known sections and falls back to pet", () => {
    expect(sectionFromHash("#calendar")).toBe("calendar");
    expect(sectionFromHash("TODOIST")).toBe("todoist");
    expect(sectionFromHash("")).toBe("pet");
    expect(sectionFromHash("#nope")).toBe("pet");
  });
});

describe("NUMBER_LIMITS", () => {
  it("matches the clamps in prefsFromJson", () => {
    for (const [key, { min, max }] of Object.entries(NUMBER_LIMITS) as [NumberKey, { min: number; max: number }][]) {
      expect(prefsFromJson({ [key]: min - 1000 })[key], `${key} min`).toBe(min);
      expect(prefsFromJson({ [key]: max + 1000 })[key], `${key} max`).toBe(max);
    }
  });

  it("keeps the pet scale range prefsFromJson accepts", () => {
    expect(prefsFromJson({ petScale: PET_SCALE.min }).petScale).toBe(PET_SCALE.min);
    expect(prefsFromJson({ petScale: PET_SCALE.max }).petScale).toBe(PET_SCALE.max);
    expect(prefsFromJson({ petScale: PET_SCALE.max + 0.01 }).petScale).toBe(1);
  });
});

describe("parseBounded", () => {
  it("rounds and clamps", () => {
    expect(parseBounded("4", 10, 240)).toBe(10);
    expect(parseBounded("45", 10, 240)).toBe(45);
    expect(parseBounded("2.6", 1, 10)).toBe(3);
    expect(parseBounded("999", 1, 10)).toBe(10);
  });

  it("returns null for blanks and non-numbers", () => {
    expect(parseBounded("", 1, 10)).toBeNull();
    expect(parseBounded("  ", 1, 10)).toBeNull();
    expect(parseBounded("abc", 1, 10)).toBeNull();
  });
});

describe("listItems", () => {
  it("trims, drops blanks and case-insensitive repeats", () => {
    expect(listItems("TikTok, Netflix,, netflix , ")).toEqual(["TikTok", "Netflix"]);
    expect(listItems("")).toEqual([]);
  });
});

describe("checkCalendarText", () => {
  it("accepts https and webcal, one per line or comma-separated", () => {
    const r = checkCalendarText("https://a.example/x.ics\nwebcal://b.example/y.ics, http://c.example/z.ics\n\n  notes  ");
    expect(r.links).toEqual(["https://a.example/x.ics", "webcal://b.example/y.ics"]);
    expect(r.invalid).toEqual(["http://c.example/z.ics", "notes"]);
    expect(r.overLimit).toBe(0);
  });

  it("counts links past the limit of 10", () => {
    const text = Array.from({ length: 12 }, (_, i) => `https://x.example/${i}.ics`).join("\n");
    const r = checkCalendarText(text);
    expect(r.links).toHaveLength(10);
    expect(r.overLimit).toBe(2);
  });
});

describe("unlockProgress", () => {
  it("measures streak unlocks by best streak", () => {
    const life = { ...newLife(), bestStreak: 4, totalDone: 80 };
    expect(unlockProgress({ kind: "streak", value: 7 }, life)).toEqual({ have: 4, need: 7, done: false });
  });

  it("measures task unlocks by tasks finished and caps progress", () => {
    const life = { ...newLife(), totalDone: 63 };
    expect(unlockProgress({ kind: "tasks", value: 50 }, life)).toEqual({ have: 50, need: 50, done: true });
  });
});

describe("changedEvents", () => {
  const base = defaultPrefs(0);

  it("says nothing when nothing changed", () => {
    expect(changedEvents(base, { ...base })).toEqual([]);
  });

  it("uses species-changed for the species alone", () => {
    expect(changedEvents(base, { ...base, species: "fox" })).toEqual([{ type: "species-changed" }]);
  });

  it("uses prefs-changed for other fields, and both when both changed", () => {
    expect(changedEvents(base, { ...base, focusMinutes: 50 })).toEqual([{ type: "prefs-changed" }]);
    expect(changedEvents(base, { ...base, species: "cat", petName: "Tom" })).toEqual([
      { type: "species-changed" },
      { type: "prefs-changed" },
    ]);
  });
});

describe("secretErrorText", () => {
  it("explains a refused Todoist token", () => {
    setLang("en");
    const e = new BackendError({ kind: "unauthorized", message: "401" });
    expect(secretErrorText(e, "todoist")).toBe("Todoist didn't accept this token. Copy the API token again. (401)");
    expect(secretErrorText(e, "anthropic")).toMatch(/didn't accept this key/);
  });

  it("keeps the backend message for network errors and plain errors", () => {
    setLang("en");
    expect(secretErrorText(new BackendError({ kind: "network", message: "timed out" }), "todoist")).toBe("Couldn't connect: timed out");
    expect(secretErrorText(new Error("boom"), "todoist")).toBe("boom");
    expect(secretErrorText("??", "todoist")).toBe("Something went wrong.");
  });

  it("speaks Vietnamese", () => {
    setLang("vi");
    expect(secretErrorText(new BackendError({ kind: "unauthorized", message: "" }), "todoist")).toMatch(/Todoist không nhận/);
    setLang("en");
  });
});

describe("workHoursProblem", () => {
  it("flags an end before the start and a deadline outside work hours", () => {
    setLang("en");
    expect(workHoursProblem({ workStart: 8, workEnd: 18, planDeadline: 10 })).toBeNull();
    expect(workHoursProblem({ workStart: 18, workEnd: 8, planDeadline: 10 })).toMatch(/end after it starts/);
    expect(workHoursProblem({ workStart: 8, workEnd: 18, planDeadline: 19 })).toMatch(/planning deadline/);
  });
});

it("hourLabel pads hours", () => {
  expect(hourLabel(8)).toBe("08:00");
  expect(hourLabel(24)).toBe("24:00");
});
