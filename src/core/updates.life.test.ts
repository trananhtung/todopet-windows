// v0.7 "Always fresh" in the saved state: the automatic-check preference and the three fields the Brain keeps in the pet's
// life (the version announced, the version last run, the notes saved before an install). Older saves load unchanged.
import { beforeEach, describe, expect, it } from "vitest";
import { setLang } from "./l10n";
import * as life from "./life";
import { defaultPrefs, prefsFromJson } from "./prefs";

beforeEach(() => setLang("en"));

describe("prefs.autoUpdateCheck", () => {
  it("is on by default", () => {
    expect(defaultPrefs().autoUpdateCheck).toBe(true);
    expect(prefsFromJson(null).autoUpdateCheck).toBe(true);
  });

  it("is on for prefs saved before v0.7, which don't have it", () => {
    const { autoUpdateCheck: _gone, ...old } = defaultPrefs(1000);
    expect(prefsFromJson(old, 1000).autoUpdateCheck).toBe(true);
  });

  it("keeps a choice to turn it off, and ignores a value that is not a yes or no", () => {
    expect(prefsFromJson({ autoUpdateCheck: false }).autoUpdateCheck).toBe(false);
    expect(prefsFromJson({ autoUpdateCheck: true }).autoUpdateCheck).toBe(true);
    expect(prefsFromJson({ autoUpdateCheck: "no" }).autoUpdateCheck).toBe(true);
    expect(prefsFromJson({ autoUpdateCheck: 0 }).autoUpdateCheck).toBe(true);
  });
});

describe("the update fields of the pet's life", () => {
  it("start empty on a new pet", () => {
    const s = life.newLife();
    expect(s.updateAnnounced).toBeNull();
    expect(s.lastVersion).toBeNull();
    expect(s.pendingNotes).toBeNull();
  });

  it("are empty for a pet saved before v0.7, and the rest of the pet is untouched", () => {
    const old = { ...life.newLife(), xp: 321, streak: 4 } as Record<string, unknown>;
    delete old.updateAnnounced;
    delete old.lastVersion;
    delete old.pendingNotes;
    const s = life.lifeFromJson(old);
    expect(s).toMatchObject({ xp: 321, streak: 4, updateAnnounced: null, lastVersion: null, pendingNotes: null });
  });

  it("round-trips through JSON", () => {
    const saved = { ...life.newLife(), updateAnnounced: "0.7.1", lastVersion: "0.7.0", pendingNotes: { version: "0.7.1", notes: "- Faster" } };
    expect(life.lifeFromJson(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("drops a version that isn't three numbers, rather than trusting a hand-edited file", () => {
    const s = life.lifeFromJson({ updateAnnounced: "latest", lastVersion: "0.7", pendingNotes: { version: "x", notes: "n" } });
    expect(s.updateAnnounced).toBeNull();
    expect(s.lastVersion).toBeNull();
    expect(s.pendingNotes).toBeNull();
    const t = life.lifeFromJson({ updateAnnounced: 7, lastVersion: {}, pendingNotes: "notes" });
    expect(t).toMatchObject({ updateAnnounced: null, lastVersion: null, pendingNotes: null });
  });

  it("keeps pending notes only as text, and cuts them to the size that is kept", () => {
    expect(life.lifeFromJson({ pendingNotes: { version: "0.7.1", notes: 5 } }).pendingNotes).toBeNull();
    expect(life.lifeFromJson({ pendingNotes: { version: "0.7.1" } }).pendingNotes).toBeNull();
    const long = life.lifeFromJson({ pendingNotes: { version: "0.7.1", notes: "x".repeat(5000) } }).pendingNotes!;
    expect(long.notes.length).toBe(1200);
  });

  it("is not in the demo pet's history: the demo has no earlier version to celebrate", () => {
    expect(life.demoLife()).toMatchObject({ updateAnnounced: null, lastVersion: null, pendingNotes: null });
  });
});
