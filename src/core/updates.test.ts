// v0.7 "Always fresh": the update rules as pure functions (SPEC v0.7 §2): when to check, whether a version is news, the
// first start of a newer version, the highlights of the release notes, and the words around them.
import { beforeEach, describe, expect, it } from "vitest";
import type { AvailableUpdate, UpdateManualReason, UpdateStatus } from "../backend/types";
import { setLang } from "./l10n";
import * as u from "./updates";

const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => setLang("en"));

describe("the check schedule", () => {
  const log = (patch: Partial<u.CheckLog> = {}): u.CheckLog => ({ startedAt: 1_000_000, last: null, ...patch });

  it("makes the first check 2 minutes after the start, and not before", () => {
    expect(u.checkDue(true, log(), 1_000_000)).toBe(false);
    expect(u.checkDue(true, log(), 1_000_000 + 2 * MIN - 1)).toBe(false);
    expect(u.checkDue(true, log(), 1_000_000 + 2 * MIN)).toBe(true);
  });

  it("then checks every 6 hours after a check that worked", () => {
    const last = { at: 5_000_000, ok: true };
    expect(u.checkDue(true, log({ last }), last.at + 6 * HOUR - 1)).toBe(false);
    expect(u.checkDue(true, log({ last }), last.at + 6 * HOUR)).toBe(true);
  });

  it("tries again after 30 minutes when the check failed (the network may only just be up), not on every beat", () => {
    const last = { at: 5_000_000, ok: false };
    expect(u.checkDue(true, log({ last }), last.at + 15_000)).toBe(false);
    expect(u.checkDue(true, log({ last }), last.at + 30 * MIN - 1)).toBe(false);
    expect(u.checkDue(true, log({ last }), last.at + 30 * MIN)).toBe(true);
  });

  it("never checks on its own when automatic checks are off, however long it has been", () => {
    expect(u.checkDue(false, log(), 1_000_000 + 100 * HOUR)).toBe(false);
    expect(u.checkDue(false, log({ last: { at: 0, ok: true } }), 100 * HOUR)).toBe(false);
  });

  it("checks again once the clock has gone back past the last check, rather than waiting for the old time to come round", () => {
    const last = { at: 50 * HOUR, ok: true };
    expect(u.checkDue(true, log({ last }), 10 * HOUR)).toBe(true);
  });
});

describe("versions", () => {
  it("reads x.y.z and nothing else", () => {
    expect(u.parseVersion("0.7.1")).toEqual([0, 7, 1]);
    expect(u.parseVersion("10.20.3000")).toEqual([10, 20, 3000]);
    for (const bad of ["", "0.7", "0.7.1.2", "v0.7.1", "0.7.1-beta", "0.7.x", " 0.7.1", "0.7.99999", "-1.0.0", null, undefined, 7, {}]) {
      expect(u.parseVersion(bad), String(bad)).toBeNull();
    }
  });

  it("compares by number, not by text: 0.10.0 is newer than 0.9.9", () => {
    expect(u.compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(u.compareVersions("0.7.1", "0.7.1")).toBe(0);
    expect(u.compareVersions("0.7.0", "0.7.1")).toBeLessThan(0);
    expect(u.compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
  });

  it("can't compare what it can't read", () => {
    expect(u.compareVersions("dev", "0.7.1")).toBeNull();
    expect(u.compareVersions("0.7.1", "")).toBeNull();
  });
});

describe("announcing a version", () => {
  it("tells a version that was never announced", () => {
    expect(u.shouldAnnounce("0.7.1", null)).toBe(true);
  });

  it("tells each version once", () => {
    expect(u.shouldAnnounce("0.7.1", "0.7.1")).toBe(false);
  });

  it("tells a newer version after an older one was announced", () => {
    expect(u.shouldAnnounce("0.7.2", "0.7.1")).toBe(true);
    expect(u.shouldAnnounce("0.10.0", "0.9.0")).toBe(true);
  });

  it("does not tell an older version than the one announced (a release was pulled back)", () => {
    expect(u.shouldAnnounce("0.7.1", "0.7.2")).toBe(false);
  });

  it("tells a version it can't compare, unless it is the same text", () => {
    expect(u.shouldAnnounce("weird", "0.7.1")).toBe(true);
    expect(u.shouldAnnounce("weird", "weird")).toBe(false);
  });
});

describe("the first start of a newer version", () => {
  it("only records the version on the very first run: nothing to celebrate", () => {
    expect(u.afterStart(null, "0.7.0")).toBe("first");
  });

  it("celebrates the first start of a newer version", () => {
    expect(u.afterStart("0.7.0", "0.7.1")).toBe("updated");
    expect(u.afterStart("0.9.9", "0.10.0")).toBe("updated");
  });

  it("is quiet when the version is the same", () => {
    expect(u.afterStart("0.7.1", "0.7.1")).toBe("same");
  });

  it("is quiet on a step back (an older build installed by hand): it is recorded, nothing to cheer", () => {
    expect(u.afterStart("0.7.1", "0.7.0")).toBe("older");
  });

  it("is quiet about a version it can't read", () => {
    expect(u.afterStart("0.7.0", "dev")).toBe("older");
    expect(u.afterStart("garbage", "0.7.1")).toBe("older");
  });

  it("takes the saved notes only when they are for the version that started", () => {
    const pending = { version: "0.7.1", notes: "- Faster" };
    expect(u.notesFor(pending, "0.7.1")).toBe("- Faster");
    expect(u.notesFor(pending, "0.7.2")).toBeNull();
    expect(u.notesFor(null, "0.7.1")).toBeNull();
  });

  it("calls saved notes stale once the version they were saved for is running or behind", () => {
    const pending = { version: "0.7.1", notes: "x" };
    expect(u.notesStale(pending, "0.7.1")).toBe(true);
    expect(u.notesStale(pending, "0.7.2")).toBe(true);
    // Saved before an install that did not happen yet (or failed): still waiting for 0.7.1.
    expect(u.notesStale(pending, "0.7.0")).toBe(false);
    expect(u.notesStale(null, "0.7.0")).toBe(false);
  });
});

describe("the highlights of the release notes", () => {
  it("takes the first three bullets under a heading", () => {
    const notes = "## What's new\n\n- Faster board when your list is long\n- Fixed the timer drifting after sleep\n- Kinder wording when Todoist is down\n- A fourth thing\n";
    expect(u.highlights(notes)).toEqual(["Faster board when your list is long", "Fixed the timer drifting after sleep", "Kinder wording when Todoist is down"]);
  });

  it("takes fewer when there are fewer, or as many as asked", () => {
    expect(u.highlights("- One\n- Two")).toEqual(["One", "Two"]);
    expect(u.highlights("- One\n- Two\n- Three", 2)).toEqual(["One", "Two"]);
  });

  it("reads the notes GitHub writes: no 'by @user in <link>', no changelog line", () => {
    const notes = [
      "## What's Changed",
      "* Add dark mode by @alice in https://github.com/x/y/pull/12",
      "* Fix the crash on start by @bob in https://github.com/x/y/pull/13",
      "",
      "**Full Changelog**: https://github.com/x/y/compare/v0.7.0...v0.7.1",
    ].join("\n");
    expect(u.highlights(notes)).toEqual(["Add dark mode", "Fix the crash on start"]);
  });

  it("drops the markup: bold, code, links, numbering and other bullet marks", () => {
    expect(u.highlights("- **Faster** board, see [the details](https://example.com/x)")).toEqual(["Faster board, see the details"]);
    expect(u.highlights("1. First\n2) Second\n• Third")).toEqual(["First", "Second", "Third"]);
    expect(u.highlights("+ Uses `less` memory")).toEqual(["Uses less memory"]);
  });

  it("reads plain lines when there are no bullets, and prefers the bullets when there are", () => {
    expect(u.highlights("Smaller installer.\nBetter focus timer.")).toEqual(["Smaller installer.", "Better focus timer."]);
    expect(u.highlights("Thanks for using TodoPet!\n- The real change")).toEqual(["The real change"]);
  });

  it("skips headings, blank lines and lines that are only a link, and reads CRLF", () => {
    expect(u.highlights("# Title\r\n\r\nhttps://github.com/x/y/releases\r\n- Real\r\n")).toEqual(["Real"]);
  });

  it("is empty for nothing at all", () => {
    expect(u.highlights("")).toEqual([]);
    expect(u.highlights("   \n\n  ")).toEqual([]);
    expect(u.highlights("## Only a heading")).toEqual([]);
  });

  it("shortens a very long line with an ellipsis", () => {
    const out = u.highlights(`- ${"word ".repeat(60)}`);
    expect(out).toHaveLength(1);
    expect(out[0].length).toBeLessThanOrEqual(90);
    expect(out[0].endsWith("…")).toBe(true);
  });

  it("keeps characters from any language and emoji whole", () => {
    expect(u.highlights("- Sửa lỗi hẹn giờ 🍅\n- Nhanh hơn")).toEqual(["Sửa lỗi hẹn giờ 🍅", "Nhanh hơn"]);
  });

  it("never lets markup through: the lines are text, whatever the notes say", () => {
    const out = u.highlights("- <img src=x onerror=alert(1)> hello");
    expect(out).toEqual(["<img src=x onerror=alert(1)> hello"]);
  });
});

describe("notes for reading", () => {
  it("turns bullets into dots, drops heading marks and bold, and keeps the line breaks", () => {
    const text = u.tidyNotes("## Fixes\n\n- **Faster** board\n- Fixed [timer](https://x.y)\n\n\n\nThanks!");
    expect(text).toBe("Fixes\n\n• Faster board\n• Fixed timer\n\nThanks!");
  });

  it("drops a first heading that only repeats the title above the notes (What's new, What's Changed…)", () => {
    expect(u.tidyNotes("## What's new\n\n- One\n- Two")).toBe("• One\n• Two");
    expect(u.tidyNotes("## What's Changed\n* One")).toBe("• One");
    expect(u.tidyNotes("# Release notes for v0.7.1\n\n- One")).toBe("• One");
    expect(u.tidyNotes("## What's new in 0.7.1\n- One")).toBe("• One");
    expect(u.tidyNotes("## Changelog\n- One")).toBe("• One");
    setLang("vi");
    expect(u.tidyNotes("## Có gì mới\n- Một")).toBe("• Một");
  });

  it("keeps a first heading that says something, and a generic one that isn't first", () => {
    expect(u.tidyNotes("## Big changes ahead\n- One")).toBe("Big changes ahead\n• One");
    expect(u.tidyNotes("- One\n\n## What's new\n- Two")).toBe("• One\n\nWhat's new\n• Two");
    // A plain line (not a heading) is the notes themselves.
    expect(u.tidyNotes("What's new\n- One")).toBe("What's new\n• One");
  });

  it("drops the changelog link line and trims the ends", () => {
    expect(u.tidyNotes("\n\n- One\n\n**Full Changelog**: https://x/compare/a...b\n")).toBe("• One");
  });

  it("is empty for empty notes", () => {
    expect(u.tidyNotes("  \n ")).toBe("");
  });
});

describe("progress", () => {
  it("is the share downloaded, rounded down so it never says 100 before it is done", () => {
    expect(u.percentOf({ phase: "downloading", downloaded: 450, total: 1000 })).toBe(45);
    expect(u.percentOf({ phase: "downloading", downloaded: 999, total: 1000 })).toBe(99);
    expect(u.percentOf({ phase: "downloading", downloaded: 0, total: 1000 })).toBe(0);
    expect(u.percentOf({ phase: "downloading", downloaded: 1000, total: 1000 })).toBe(100);
  });

  it("is unknown without a total, and stays within 0 to 100 for odd numbers", () => {
    expect(u.percentOf({ phase: "downloading", downloaded: 10, total: null })).toBeNull();
    expect(u.percentOf({ phase: "downloading", downloaded: 10, total: 0 })).toBeNull();
    expect(u.percentOf({ phase: "downloading", downloaded: 2000, total: 1000 })).toBe(100);
    expect(u.percentOf({ phase: "downloading", downloaded: -5, total: 1000 })).toBe(0);
    expect(u.percentOf({ phase: "downloading", downloaded: Number.NaN, total: 1000 })).toBeNull();
  });

  it("is complete while installing", () => {
    expect(u.percentOf({ phase: "installing" })).toBe(100);
  });

  it("says it in words, in both languages", () => {
    expect(u.progressText({ phase: "downloading", percent: 45 })).toBe("Downloading… 45%");
    expect(u.progressText({ phase: "downloading", percent: null })).toBe("Downloading…");
    expect(u.progressText({ phase: "installing" })).toBe("Installing, see you in a moment!");
    setLang("vi");
    expect(u.progressText({ phase: "downloading", percent: 45 })).toBe("Đang tải… 45%");
    expect(u.progressText({ phase: "installing" })).toBe("Đang cài, chút nữa gặp lại nhé!");
  });
});

describe("the words for the tray and the board", () => {
  it("labels the tray item by whether an update is waiting", () => {
    expect(u.trayLabel(null)).toBe("Check for updates…");
    expect(u.trayLabel("0.7.1")).toBe("✨ Update to 0.7.1");
    setLang("vi");
    expect(u.trayLabel(null)).toBe("Kiểm tra cập nhật…");
    expect(u.trayLabel("0.7.1")).toBe("✨ Cập nhật lên 0.7.1");
  });

  it("labels the board chip, and says 'ready' only when one click will do it", () => {
    expect(u.chipLabel("0.7.1", true)).toBe("✨ 0.7.1 is ready");
    expect(u.chipLabel("0.7.1", false)).toBe("✨ 0.7.1 is out · download");
    setLang("vi");
    expect(u.chipLabel("0.7.1", true)).toBe("✨ Có bản 0.7.1");
    expect(u.chipLabel("0.7.1", false)).toBe("✨ Có bản 0.7.1 · tải về");
  });
});

describe("Settings: the status line and why one click is off", () => {
  const available = (patch: Partial<AvailableUpdate> = {}): AvailableUpdate => ({ version: "0.7.1", notes: "", publishedAt: null, canInstall: true, manualReason: null, ...patch });
  const status = (patch: Partial<UpdateStatus> = {}): UpdateStatus => ({ current: "0.7.0", checkedAt: null, available: null, error: null, ...patch });
  const NOW = 10 * HOUR;

  it("says when it checked, in words", () => {
    expect(u.agoText(NOW - 20_000, NOW)).toBe("just now");
    expect(u.agoText(NOW - 5 * MIN, NOW)).toBe("5 minutes ago");
    expect(u.agoText(NOW - MIN, NOW)).toBe("1 minute ago");
    expect(u.agoText(NOW - 3 * HOUR, NOW)).toBe("3 hours ago");
    expect(u.agoText(NOW - HOUR, NOW)).toBe("1 hour ago");
    expect(u.agoText(NOW - 50 * HOUR, NOW)).toBe("2 days ago");
    // A clock that went back is "just now", not a negative time.
    expect(u.agoText(NOW + HOUR, NOW)).toBe("just now");
    setLang("vi");
    expect(u.agoText(NOW - 5 * MIN, NOW)).toBe("5 phút trước");
    expect(u.agoText(NOW - 3 * HOUR, NOW)).toBe("3 giờ trước");
  });

  it("reads the status: checking, new version, up to date, never checked, couldn't check", () => {
    expect(u.statusLine(status(), true, NOW)).toEqual({ tone: "info", text: "Checking…" });
    expect(u.statusLine(status({ available: available(), checkedAt: NOW }), false, NOW)).toEqual({ tone: "new", text: "Version 0.7.1 is ready", detail: "Checked just now" });
    expect(u.statusLine(status({ checkedAt: NOW - 5 * MIN }), false, NOW)).toEqual({ tone: "ok", text: "You're on the newest version 👍", detail: "Checked 5 minutes ago" });
    expect(u.statusLine(status(), false, NOW)).toEqual({ tone: "info", text: "Not checked yet" });
    expect(u.statusLine(status({ checkedAt: NOW, error: { kind: "network", message: "offline" } }), false, NOW)).toMatchObject({ tone: "error", text: "Couldn't check for updates just now", detail: "Last tried just now" });
  });

  it("has no emoji in the new-version line: its icon is the sparkle", () => {
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      expect(u.statusLine(status({ available: available(), checkedAt: NOW }), false, NOW).text).not.toMatch(/✨/u);
    }
  });

  it("says 'ready' only when one click will do it; a download page is 'out'", () => {
    const st = status({ available: available({ canInstall: false, manualReason: "msi" }), checkedAt: NOW });
    expect(u.statusLine(st, false, NOW).text).toBe("Version 0.7.1 is out");
    setLang("vi");
    expect(u.statusLine(st, false, NOW).text).toBe("Đã có bản 0.7.1");
  });

  it("reads the status in Vietnamese", () => {
    setLang("vi");
    expect(u.statusLine(status(), true, NOW)).toEqual({ tone: "info", text: "Đang kiểm tra…" });
    expect(u.statusLine(status({ available: available(), checkedAt: NOW - 5 * MIN }), false, NOW)).toEqual({ tone: "new", text: "Đã có bản 0.7.1", detail: "Kiểm tra lần cuối: 5 phút trước" });
    expect(u.statusLine(status({ checkedAt: NOW - 3 * HOUR }), false, NOW)).toEqual({ tone: "ok", text: "Bạn đang dùng bản mới nhất 👍", detail: "Kiểm tra lần cuối: 3 giờ trước" });
    expect(u.statusLine(status(), false, NOW)).toEqual({ tone: "info", text: "Chưa kiểm tra" });
    expect(u.statusLine(status({ checkedAt: NOW, error: { kind: "network", message: "x" } }), false, NOW)).toEqual({ tone: "error", text: "Chưa kiểm tra được bản mới lúc này", detail: "Lần thử gần nhất: vừa xong" });
  });

  it("still shows the version found before when a later check failed, and says the check failed (a failed press is never silent)", () => {
    const st = status({ available: available(), checkedAt: NOW, error: { kind: "network", message: "offline" } });
    expect(u.statusLine(st, false, NOW)).toEqual({
      tone: "new",
      text: "Version 0.7.1 is ready",
      // (Not "Checked just now": it was tried, not answered.)
      detail: "Last tried just now",
      problem: "Couldn't check for updates just now. This is what I found earlier.",
    });
    setLang("vi");
    expect(u.statusLine(st, false, NOW)).toMatchObject({ tone: "new", text: "Đã có bản 0.7.1", detail: "Lần thử gần nhất: vừa xong", problem: "Chưa kiểm tra được bản mới lúc này. Đây là bản mình tìm thấy trước đó." });
  });

  it("has no problem to report when the check worked", () => {
    expect(u.statusLine(status({ available: available(), checkedAt: NOW }), false, NOW).problem).toBeUndefined();
  });

  it("explains each reason one click is off, kindly and in both languages", () => {
    for (const r of ["msi", "unsigned", "dev", "check_failed"] as const) {
      setLang("en");
      const en = u.manualReasonText(r);
      setLang("vi");
      const vi = u.manualReasonText(r);
      expect(en.length, r).toBeGreaterThan(30);
      expect(vi.length, r).toBeGreaterThan(30);
      expect(vi, r).not.toBe(en);
    }
    setLang("en");
    expect(u.manualReasonText("msi")).toMatch(/MSI/);
    expect(u.manualReasonText("msi")).toMatch(/download page/i);
    expect(u.manualReasonText("dev")).toMatch(/development/i);
  });

  it("speaks plainly: no 'per-machine' jargon, and no comma splice in the check_failed sentence", () => {
    setLang("en");
    expect(u.manualReasonText("msi")).not.toMatch(/per-machine/i);
    expect(u.manualReasonText("msi")).toMatch(/for everyone on this PC/);
    expect(u.manualReasonText("check_failed")).not.toMatch(/instead, it is safer/);
    expect(u.manualReasonText("check_failed")).toMatch(/It is safer\./);
  });

  it("has a kind, general sentence for a reason it doesn't know yet (Rust may add one), and for none", () => {
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      for (const odd of ["something_new" as UpdateManualReason, null, undefined as unknown as null]) {
        const text = u.manualReasonText(odd);
        expect(text.length, `${lang} ${String(odd)}`).toBeGreaterThan(30);
        expect(text).not.toMatch(/undefined|null|something_new/);
      }
    }
    setLang("en");
    expect(u.manualReasonText("something_new" as UpdateManualReason)).toMatch(/download page/i);
  });
});

describe("what the pet says about updates", async () => {
  const lines = await import("./lines");
  const sayings: [string, () => string][] = [
    ["available", () => lines.updateAvailable("0.7.1")],
    ["what's new", () => lines.whatsNew(["Faster board", "Fixed timer"]) ?? ""],
    ["update now", lines.updateNow],
    ["download page", lines.downloadPage],
    ["later", lines.updateLater],
    ["failed", lines.updateFailed],
    ["page failed", lines.updatePageFailed],
    ["up to date", lines.upToDate],
    ["check failed", lines.updateCheckFailed],
    ["looking", lines.lookingForUpdate],
    ["updated", () => lines.updated("0.7.1")],
  ];

  it("has every line in both languages, different in each, with no placeholder left over", () => {
    for (const [name, say] of sayings) {
      setLang("en");
      const en = say();
      setLang("vi");
      const vi = say();
      expect(en.length, name).toBeGreaterThan(2);
      expect(vi.length, name).toBeGreaterThan(2);
      expect(vi, name).not.toBe(en);
      for (const t of [en, vi]) expect(t, name).not.toMatch(/undefined|\{|\}|null/);
    }
  });

  it("names the version in the two lines that are about one", () => {
    for (const lang of ["en", "vi"] as const) {
      setLang(lang);
      expect(lines.updateAvailable("0.7.1")).toContain("0.7.1");
      expect(lines.updated("0.7.1")).toContain("0.7.1");
    }
  });

  it("says the words the brief asks for", () => {
    setLang("vi");
    expect(lines.updateAvailable("0.7.1")).toBe("Mình có bản mới 0.7.1 nè ✨");
    expect([lines.updateNow(), lines.updateLater(), lines.downloadPage()]).toEqual(["Cập nhật ngay", "Để sau", "Trang tải về"]);
    expect(lines.updated("0.7.1")).toBe("Mình vừa lên bản 0.7.1! ✨");
    setLang("en");
    expect(lines.updated("0.7.1")).toBe("Now I'm on 0.7.1! ✨");
    expect(lines.upToDate()).toBe("You're on the newest version 👍");
    expect(lines.updateFailed()).toBe("I couldn't update myself. Grab it from the download page?");
    expect(lines.lookingForUpdate()).toBe("Let me look… 🔎");
    setLang("vi");
    expect(lines.lookingForUpdate()).toBe("Để mình xem nào… 🔎");
  });

  it("shows the highlights as dotted lines, and nothing when there are none", () => {
    setLang("en");
    expect(lines.whatsNew(["A", "B"])).toBe("What's new:\n• A\n• B");
    expect(lines.whatsNew([])).toBeNull();
    setLang("vi");
    expect(lines.whatsNew(["A"])).toBe("Có gì mới:\n• A");
  });
});

describe("release notes in two languages", () => {
  const both = "### English\n- Faster board\n- Fixed the timer\n\n### Tiếng Việt\n- Bảng nhanh hơn\n- Sửa lỗi hẹn giờ";

  it("shows only the section for the language of the app, without its heading", () => {
    expect(u.forLanguage(both, "en")).toBe("- Faster board\n- Fixed the timer");
    expect(u.forLanguage(both, "vi")).toBe("- Bảng nhanh hơn\n- Sửa lỗi hẹn giờ");
  });

  it("takes the other language when the one asked for is missing or empty, then the whole text when neither is there", () => {
    expect(u.forLanguage("### English\n- Only English", "vi")).toBe("- Only English");
    expect(u.forLanguage("### Tiếng Việt\n- Chỉ tiếng Việt", "en")).toBe("- Chỉ tiếng Việt");
    expect(u.forLanguage("### English\n- One\n### Tiếng Việt\n\n  \n", "vi")).toBe("- One");
    expect(u.forLanguage("### English\n\n### Tiếng Việt\n", "en")).toBe("### English\n\n### Tiếng Việt");
  });

  it("leaves notes without those headings alone, whatever the language", () => {
    const plain = "## What's new\n- One\n- Two\n\n### Fixes\n- Three";
    expect(u.forLanguage(plain, "vi")).toBe(plain);
    expect(u.forLanguage(plain, "en")).toBe(plain);
    expect(u.forLanguage("", "en")).toBe("");
  });

  it("reads the headings at any level, in any case, trimmed, with or without the accents", () => {
    for (const en of ["# English", "## english", "####   ENGLISH   ", "  ### English ###", "###English"]) {
      expect(u.forLanguage(`${en}\n- E\n### Tiếng Việt\n- V`, "en"), en).toBe("- E");
    }
    for (const vi of ["# Tiếng Việt", "## tiếng việt", "### TIẾNG VIỆT", "### Tieng Viet", `### ${"Tiếng Việt".normalize("NFD")}`]) {
      expect(u.forLanguage(`### English\n- E\n${vi}\n- V`, "vi"), vi).toBe("- V");
    }
  });

  it("does not take a heading that only starts with the name, or the name without the hashes", () => {
    const text = "### English notes\n- A\nEnglish\n- B";
    expect(u.forLanguage(text, "vi")).toBe(text);
  });

  it("drops what comes before the first language heading, and keeps other headings inside a section", () => {
    const text = "## What's new in 0.7.1\n\n### English\n#### Fixes\n- Timer\n\n### Tiếng Việt\n#### Sửa lỗi\n- Hẹn giờ";
    expect(u.forLanguage(text, "en")).toBe("#### Fixes\n- Timer");
    expect(u.forLanguage(text, "vi")).toBe("#### Sửa lỗi\n- Hẹn giờ");
  });

  it("puts sections of one language together, and reads Vietnamese first as well as English first", () => {
    expect(u.forLanguage("### Tiếng Việt\n- V1\n### English\n- E1\n### Tiếng Việt\n- V2", "vi")).toBe("- V1\n- V2");
    expect(u.forLanguage("### Tiếng Việt\n- V1\n### English\n- E1", "en")).toBe("- E1");
  });

  it("is what the highlights and the notes for reading are made from, in the language of the app", () => {
    setLang("en");
    expect(u.highlights(both)).toEqual(["Faster board", "Fixed the timer"]);
    expect(u.tidyNotes(both)).toBe("• Faster board\n• Fixed the timer");
    setLang("vi");
    expect(u.highlights(both)).toEqual(["Bảng nhanh hơn", "Sửa lỗi hẹn giờ"]);
    expect(u.tidyNotes(both)).toBe("• Bảng nhanh hơn\n• Sửa lỗi hẹn giờ");
  });

  it("keeps a bilingual note readable when it is cut to the size that is saved for after the restart", () => {
    const long = `### English\n${"- An English line that is quite long\n".repeat(60)}\n### Tiếng Việt\n${"- Một dòng tiếng Việt khá dài\n".repeat(60)}`;
    expect(long.length).toBeGreaterThan(u.MAX_SAVED_NOTES);
    const kept = u.shrinkNotes(long);
    expect(kept.length).toBeLessThanOrEqual(u.MAX_SAVED_NOTES);
    setLang("en");
    expect(u.highlights(kept)).toHaveLength(3);
    expect(u.highlights(kept)[0]).toMatch(/English/);
    setLang("vi");
    expect(u.highlights(kept)[0]).toMatch(/tiếng Việt/);
  });

  it("leaves notes that fit alone, and cuts plain notes at the limit", () => {
    expect(u.shrinkNotes(both)).toBe(both);
    expect(u.shrinkNotes("x".repeat(5000))).toHaveLength(u.MAX_SAVED_NOTES);
  });
});

describe("what a screen reader is told about the download", () => {
  it("is the start, the halfway mark and the last step, not every percent", () => {
    const said = (percents: (number | null)[]) => percents.map((percent) => u.spokenProgress({ phase: "downloading", percent }));
    const all = said([null, 0, 10, 20, 30, 40, 49, 50, 60, 70, 80, 90, 99, 100]);
    expect(new Set(all)).toEqual(new Set(["Downloading…", "Downloading… 50%"]));
    expect(all.slice(0, 7).every((t) => t === "Downloading…")).toBe(true);
    expect(all.slice(7).every((t) => t === "Downloading… 50%")).toBe(true);
    expect(u.spokenProgress({ phase: "installing" })).toBe("Installing, see you in a moment!");
    setLang("vi");
    expect(u.spokenProgress({ phase: "downloading", percent: 80 })).toBe("Đang tải… 50%");
    expect(u.spokenProgress({ phase: "downloading", percent: 3 })).toBe("Đang tải…");
  });
});
