// Sample history for the browser demo's Diary (`diary.html?demo`): a couple of weeks of finished tasks, focus
// sessions, stickers and trips with postcards, so the weekly chapters have something to show. Generated in the
// current language and only merged in for past days; nothing is ever written to storage.
import type { DiaryApi } from "../backend/types";
import { addDays, dayKey, parseDate } from "../core/dates";
import type { DiaryEntry } from "../core/diary";
import { L } from "../core/l10n";
import { postcard } from "../core/lines";
import { placeName, postcardText, type SouvenirId } from "../core/trips";

const TASKS: readonly (readonly [string, string])[] = [
  ["Viết báo cáo tuần", "Write the weekly report"],
  ["Gọi cho khách hàng ABC", "Call client ABC"],
  ["Lên kế hoạch sprint tới", "Plan the next sprint"],
  ["Duyệt bản thiết kế", "Review the design mockups"],
  ["Cập nhật lộ trình sản phẩm", "Update the product roadmap"],
  ["Chuẩn bị buổi demo", "Prepare the demo"],
  ["Trả lời email của sếp", "Reply to the boss's email"],
];

/** The trips in the sample, by how many workdays ago (1 = the last workday before today). */
const TRIPS: Readonly<Record<number, SouvenirId>> = { 1: "kyoto", 3: "paris", 5: "hoian", 8: "dalat" };
/** Workdays that were perfect (a 🌟 sticker, settled the next morning). */
const PERFECT = new Set([1, 3, 4, 8]);

/** The last `n` workdays (Monday–Friday) before `today`, newest first. */
function workdaysBefore(today: string, n: number): string[] {
  const out: string[] = [];
  for (let d = addDays(today, -1); out.length < n; d = addDays(d, -1)) {
    const day = parseDate(d)?.getDay();
    if (day !== 0 && day !== 6) out.push(d);
  }
  return out;
}

const at = (day: string, h: number, m: number) => {
  const d = parseDate(day)!;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
};

/** Sample entries for the ten workdays before `today`, keyed by day. */
export function demoDiary(today: string): Map<string, DiaryEntry[]> {
  const days = workdaysBefore(today, 10);
  const out = new Map<string, DiaryEntry[]>();
  const add = (day: string, e: DiaryEntry) => out.set(day, [...(out.get(day) ?? []), e]);
  let xp = 320;
  days.forEach((day, i) => {
    const k = i + 1;
    const [t1, t2, t3] = [TASKS[i % TASKS.length], TASKS[(i + 2) % TASKS.length], TASKS[(i + 4) % TASKS.length]];
    const title = (t: readonly [string, string]) => L(t[0], t[1]);
    const done = (h: number, m: number, t: readonly [string, string], full: number) => {
      xp -= 10;
      add(day, { at: at(day, h, m), kind: "life", text: L(`Xong “${title(t)}” → no ${full}%, ${xp} XP`, `Done “${title(t)}” → ${full}% full, ${xp} XP`), tag: "done", count: 1 });
    };
    add(day, { at: at(day, 9, 5), kind: "focus", text: L("Bắt đầu tập trung 25 phút", "Started a 25-minute focus session") + `: “${title(t1)}”` });
    add(day, { at: at(day, 9, 30), kind: "focus", text: L("Xong phiên tập trung 25 phút", "Finished a 25-minute focus session") });
    done(9, 32, t1, 80);
    add(day, {
      at: at(day, 10, 40),
      kind: "bubble",
      text: L(`“Mình làm “${title(t2)}” 25 phút nhé? 🍅” — vì việc này nằm trong kế hoạch từ sáng (còn 6 lượt nhắc hôm nay)`, `“Shall we give “${title(t2)}” 25 minutes? 🍅” — because it's been on today's plan since morning (6 left today)`),
    });
    add(day, { at: at(day, 10, 41), kind: "response", text: L("Bạn bấm “▶ Tập trung”", "You tapped “▶ Focus”"), tag: "picked" });
    done(11, 18, t2, 95);
    if (PERFECT.has(k) || k % 2 === 0) done(14, 6, t3, 100);
    const place = TRIPS[k];
    if (place) {
      add(day, {
        at: at(day, 14, 58),
        kind: "bubble",
        text: L("“Xong hết kế hoạch rồi! Cho mình đi chơi chút nha? 17:00 mình về 🎒” — vì xong hết kế hoạch hôm nay", "“Today's plan is all done! Can I go on a little trip? Back at 17:00 🎒” — because today's plan is done"),
      });
      add(day, { at: at(day, 14, 59), kind: "response", text: L("Bạn bấm “Đi đi!”", "You tapped “Go!”"), tag: "picked" });
      add(day, { at: at(day, 15, 0), kind: "life", text: L(`Pet đi chơi ${placeName(place)}, hẹn 17:00 về`, `The pet set off for ${placeName(place)}, back at 17:00`) });
      add(day, { at: at(day, 17, 0), kind: "life", text: postcard(placeName(place), postcardText(place)), tag: "postcard" });
    }
    // A perfect day is settled the next morning, on the day after it.
    if (PERFECT.has(k)) {
      const next = i === 0 ? null : days[i - 1];
      if (next) add(next, { at: at(next, 8, 30), kind: "life", text: L(`Chốt ngày ${day}: xong 3/3 → nhận sticker 🌟`, `Closed ${day}: 3/3 done → earned a 🌟 sticker`), tag: "sticker", day });
    }
  });
  return out;
}

/** The demo's diary with the sample history merged into past days (today stays as the pet writes it). */
export function withDemoDiary(api: DiaryApi, today: () => string = () => dayKey(new Date())): DiaryApi {
  const seed = (day: string) => (day < today() ? (demoDiary(today()).get(day) ?? []) : []);
  return {
    append: (day, line) => api.append(day, line),
    async read(day) {
      const real = await api.read(day);
      return [...seed(day).map((e) => JSON.stringify(e)), ...real];
    },
    async days() {
      const real = await api.days();
      return [...new Set([...real, ...demoDiary(today()).keys()])].sort().reverse();
    },
  };
}
