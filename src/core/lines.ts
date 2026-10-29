// Everything the pet says, in both languages (Lines.swift). Tone follows the mood.
import type { CalEvent, SlotSuggestion } from "./calendar";
import { hoursText, shortText, timeString } from "./dates";
import { L, pick } from "./l10n";

/** English noun with its count: n(1, "task") → "1 task", n(3, "task") → "3 tasks". */
const n = (count: number, noun: string, nouns = `${noun}s`) => `${count} ${count === 1 ? noun : nouns}`;
import { accessoryEmoji, accessoryName, stageName } from "./life";
import { isRecurring, taskTitle, type TodoTask } from "./models";
import type { StuckTask } from "./stuck";
import type { Accessory, Mood, StageIndex } from "./types";

const q = (t: TodoTask) => `“${shortText(taskTitle(t))}”`;

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 11) return L("Chào buổi sáng! ☀️", "Good morning! ☀️");
  if (h < 13) return L("Chào buổi trưa! 🌤", "Good day! 🌤");
  if (h < 18) return L("Chào buổi chiều! 🌇", "Good afternoon! 🌇");
  return L("Chào buổi tối! 🌙", "Good evening! 🌙");
}

export function hello(name: string): string {
  return L(
    `Xin chào! Mình là ${name} 🐾 Cho mình API token Todoist để mình giữ nhịp làm việc cho bạn nhé.`,
    `Hi! I'm ${name} 🐾 Give me your Todoist API token and I'll keep you on track.`,
  );
}

export function morning(now: Date, plannedCount: number, openCount: number, next: TodoTask | null, target: number): string {
  const g = greeting(now);
  if (plannedCount < target) {
    return `${g} ${L(
      `Hôm nay mình làm ${target} việc gì nào? Mới có ${plannedCount}/${target} việc thôi 📝`,
      `What are our ${target} things today? Only ${plannedCount}/${target} planned so far 📝`,
    )}`;
  }
  if (next) {
    return `${g} ${L(
      `Hôm nay có ${openCount} việc. Ăn con ếch trước: ${q(next)} 🐸`,
      `${openCount} tasks today. Eat the frog first: ${q(next)} 🐸`,
    )}`;
  }
  return g;
}

// Outside distractions a low mood is worry, so the worried (and grumpy) lines offer help, never a telling-off.

export function plan(mood: Mood, plannedCount: number, target: number): string {
  const k = target - plannedCount;
  if (mood === "angry") {
    return pick([
      [`Mình cùng kéo hôm nay lại nhé: chọn thêm ${k} việc, mình giúp bạn bắt đầu 💪`, `Let's get today back on track: pick ${k} more and I'll help you start 💪`],
      [`Mình cùng lên nốt kế hoạch hôm nay nhé: còn ${k} việc nữa thôi 📝`, `Let's plan the rest of today together: just ${k} more to go 📝`],
    ]);
  }
  if (mood === "annoyed") {
    return pick([
      [`Mình hơi lo… hôm nay mới có ${plannedCount}/${target} việc. Chọn thêm ${k} việc cùng mình nhé? 📝`, `I'm a little worried… only ${plannedCount}/${target} planned. Pick ${k} more with me? 📝`],
      [`Kế hoạch chưa đủ cũng không sao. Chọn ${k} việc nhỏ cho dễ bắt đầu nhé 🌱`, `Not fully planned yet, and that's okay. Pick ${n(k, "small task")} to get going 🌱`],
    ]);
  }
  return pick([
    [`Hôm nay mình làm ${target} việc gì nào? Mới có ${plannedCount}/${target} việc 📝`, `What are our ${target} things today? ${plannedCount}/${target} planned 📝`],
    [`Chọn ${k} việc quan trọng nhất cho hôm nay nhé ✍️`, `Pick the ${k} most important tasks for today ✍️`],
  ]);
}

export function nudge(mood: Mood, next: TodoTask, hoursIdle: number): string {
  if (mood === "happy") {
    return pick([
      [`Đang ngon trớn! Tiếp theo là ${q(next)} nha ✨`, `On a roll! Next up: ${q(next)} ✨`],
      [`Mình thích nhịp này! Làm luôn ${q(next)} nhé 💪`, `Love this pace! Let's do ${q(next)} 💪`],
    ]);
  }
  if (mood === "annoyed") {
    return pick([
      [`${q(next)} có vẻ khó nhằn? Mình làm 10 phút thôi nhé 🌱`, `${q(next)} feeling heavy? Let's just do 10 minutes 🌱`],
      [`Mình hơi lo cho ${q(next)}. Bật một phiên tập trung, mình ngồi canh cho nhé? ⏱`, `I'm a little worried about ${q(next)}. Start a focus session and I'll keep watch? ⏱`],
    ]);
  }
  if (mood === "angry") {
    const h = Math.max(1, Math.round(hoursIdle));
    return pick([
      [`${h} tiếng chưa có tiến triển. Mình làm bước nhỏ đầu tiên của ${q(next)} nhé 💪`, `${h}h without a win. Let's take the first small step of ${q(next)} 💪`],
      [`Quay lại với ${q(next)} nha? Mình canh giờ cho bạn tập trung 🛡️`, `Back to ${q(next)}? I'll guard the time while you focus 🛡️`],
    ]);
  }
  return pick([
    [`Việc tiếp theo: ${q(next)}. Làm một phiên tập trung không?`, `Next: ${q(next)}. Want a focus session?`],
    [`Nhắc nhẹ: ${q(next)} đang chờ bạn 🙂`, `Gentle nudge: ${q(next)} is waiting 🙂`],
  ]);
}

/** Offers both ways out: today, or a fresh start that moves them all to tomorrow. */
export function overdue(mood: Mood, count: number): string {
  const them = count === 1 ? "it" : "them";
  if (mood === "annoyed" || mood === "angry") {
    return L(
      `${count} việc quá hạn đang chờ… 😟 Để mình giúp: dời vào hôm nay, hoặc dời hết sang mai để bắt đầu lại.`,
      `${n(count, "overdue task")} waiting… 😟 Let me help: move ${them} to today, or clear ${them} to tomorrow for a fresh start.`,
    );
  }
  return L(`Có ${count} việc quá hạn 😬 Dời vào hôm nay, hay dời hết sang mai để bắt đầu lại?`, `${n(count, "overdue task")} 😬 Move ${them} to today, or make a fresh start tomorrow?`);
}

export const freshStart = (count: number) =>
  L(`🌱 Bắt đầu lại nhé! Đã dời ${count} việc quá hạn sang mai, hôm nay nhẹ hơn rồi.`, `🌱 Fresh start! Moved ${n(count, "overdue task")} to tomorrow. Today is a clean slate.`);

export function distraction(mood: Mood, app: string, left: number, next: TodoTask | null): string {
  if (mood === "angry" && next) {
    return L(`${app} nữa hả?!! Đóng lại đi, ${q(next)} đang chờ 😤`, `${app} AGAIN?! Close it, ${q(next)} is waiting 😤`);
  }
  return pick([
    [`Ê! Đang ${app} đó hả? 👀 Còn ${left} việc kìa.`, `Hey! On ${app}? 👀 ${n(left, "task")} left.`],
    [`Mình thấy bạn mở ${app} nha 👀 Quay lại làm việc chứ?`, `I see ${app} 👀 Back to work?`],
  ]);
}

/** `sound` is the species' voice ("meow", "gâu gâu"), so each pet cheers in its own way. */
export function done(t: TodoTask, completed: number, target: number, sound: string): string {
  if (completed === target) return L(`Đủ ${target} việc rồi!!! Bạn là nhất 🏆`, `That's ${target}!!! You're the best 🏆`);
  return pick([
    [`Xong ${q(t)}! 🎉 (${completed}/${target})`, `Done: ${q(t)}! 🎉 (${completed}/${target})`],
    [`Tuyệt vời! ✔︎ ${q(t)}`, `Awesome! ✔︎ ${q(t)}`],
    [`${sound}! Mình vui quá 🥳 (${completed}/${target})`, `${sound}! So happy 🥳 (${completed}/${target})`],
    [`Giỏi quá! Tiếp tục giữ nhịp nhé 💪`, `Nice! Keep the rhythm 💪`],
  ]);
}

export const allDone = () =>
  L("Xong hết việc hôm nay rồi! 🎉 Nghỉ ngơi, hoặc chọn sẵn 3 việc cho mai nhé.", "Everything's done for today! 🎉 Rest, or pick tomorrow's 3 tasks.");

export const review = (completed: number, plannedCount: number, left: number) =>
  L(
    `Sắp hết giờ làm. Hôm nay xong ${completed}/${plannedCount} việc. Còn ${left} việc — dời sang mai?`,
    `Almost end of day: ${completed}/${plannedCount} done. Move the remaining ${left} to tomorrow?`,
  );

export const welcomeBack = (t: TodoTask) => L(`Bạn về rồi! 👋 Tiếp tục với ${q(t)} nhé?`, `Welcome back! 👋 Continue with ${q(t)}?`);
export const soon = (t: TodoTask, minutes: number) => L(`⏰ ${minutes} phút nữa: ${q(t)}`, `⏰ In ${minutes} min: ${q(t)}`);
export const dueNow = (t: TodoTask) => L(`⏰ Đến giờ rồi: ${q(t)}!`, `⏰ It's time: ${q(t)}!`);

export function focusStart(t: TodoTask | null, minutes: number): string {
  if (t) return L(`Bắt đầu ${minutes} phút cho ${q(t)}. Mình sẽ ngồi im canh bạn 🤫`, `${n(minutes, "minute")} on ${q(t)}. I'll sit quietly and guard 🤫`);
  return L(`Bắt đầu ${minutes} phút tập trung. Mình ngồi im canh nhé 🤫`, `${n(minutes, "minute")} of focus. I'll stay quiet 🤫`);
}

export function focusEnd(t: TodoTask | null, minutes: number): string {
  if (t) return L(`Hết ${minutes} phút rồi! ${q(t)} xong chưa?`, `${minutes === 1 ? "Time's up" : `${minutes} minutes up`}! Is ${q(t)} done?`);
  return L(`Hết ${minutes} phút rồi! Nghỉ chút nhé?`, `${minutes === 1 ? "Time's up" : `${minutes} minutes up`}! Take a break?`);
}

export const breakStart = (m: number) => L(`Nghỉ ${m} phút nhé ☕ Uống nước, vươn vai đi!`, `${m}-minute break ☕ Water and stretch!`);
export const breakEnd = () => L("Hết giờ nghỉ! Quay lại thôi 💪", "Break's over! Let's go 💪");
export const added = (title: string) => L(`Đã thêm “${shortText(title)}” ✔︎`, `Added “${shortText(title)}” ✔︎`);

export function planComplete(target: number, next: TodoTask | null): string {
  if (next) return L(`Đủ ${target} việc cho hôm nay rồi! Bắt đầu với ${q(next)} nhé 🐸`, `${target} tasks planned! Start with ${q(next)} 🐸`);
  return L(`Đủ ${target} việc cho hôm nay rồi! 🐸`, `${target} tasks planned for today! 🐸`);
}

export const lateNight = () => L("Khuya rồi đó… đi ngủ để mai làm tốt hơn nha 😴", "It's late… sleep now, crush it tomorrow 😴");
export const error = (e: string) => L(`Mình không kết nối được Todoist 😵 ${e}`, `I can't reach Todoist 😵 ${e}`);
export const connected = () => L("Kết nối Todoist thành công! 🎉", "Connected to Todoist! 🎉");
export const demoHello = () =>
  L("Đang chạy demo với dữ liệu giả 🎭 Bấm vào mình để mở bảng việc nhé!", "Demo mode with sample tasks 🎭 Click me to open the task board!");
export const movedToTomorrow = (count: number) =>
  L(`Đã dời ${count} việc sang mai. Nghỉ ngơi nhé 🌙`, `Moved ${n(count, "task")} to tomorrow. Rest well 🌙`);

// Calendar

export const meetingSoon = (e: CalEvent, minutes: number) =>
  L(
    `📅 ${minutes} phút nữa họp: “${shortText(e.title)}” (${timeString(e.start)})`,
    `📅 Meeting in ${minutes} min: “${shortText(e.title)}” (${timeString(e.start)})`,
  );

export function calendarDay(meetings: number, busyMinutes: number, free: number, target: number, reduced: boolean): string {
  const base = L(
    `📅 Hôm nay ${meetings} cuộc họp (${hoursText(busyMinutes)}), còn ${hoursText(free)} trống`,
    `📅 ${n(meetings, "meeting")} today (${hoursText(busyMinutes)}), ${hoursText(free)} free`,
  );
  return base + (reduced ? L(` → ${target} việc là vừa sức.`, ` → ${n(target, "task")} ${target === 1 ? "is" : "are"} realistic.`) : ".");
}

export const timeBlock = (s: SlotSuggestion) =>
  L(
    `Gắn giờ cho dễ bắt đầu: ${timeString(s.start)}–${timeString(s.end)} làm ${q(s.task)} nhé?`,
    `A set time makes it easier to start: ${timeString(s.start)}–${timeString(s.end)} for ${q(s.task)}?`,
  );

export const timeSet = (t: TodoTask, at: Date) =>
  L(`Đã hẹn ${q(t)} lúc ${timeString(at)}. Mình sẽ nhắc đúng giờ ⏰`, `Scheduled ${q(t)} at ${timeString(at)}. I'll remind you ⏰`);

// Postponed tasks

export function stuck(s: StuckTask, mood: Mood): string {
  if (mood === "angry") {
    return L(`${q(s.task)} chờ ${s.days} ngày rồi. Để mình giúp chia thành từng bước nhỏ nhé? ✂️`, `${q(s.task)} has waited ${s.days} days. Want help splitting it into tiny steps? ✂️`);
  }
  return pick([
    [
      `${q(s.task)} bị dời ${s.days} ngày rồi 🤔 Chắc nó to quá? Chia thành bước nhỏ cho dễ bắt đầu nhé.`,
      `${q(s.task)} has been pushed for ${s.days} days 🤔 Too big? Let's split it into small steps.`,
    ],
    [
      `Mình thấy ${q(s.task)} cứ bị dời mãi (${s.days} ngày). Bước nhỏ nhất để bắt đầu là gì?`,
      `${q(s.task)} keeps getting postponed (${s.days} days). What's the tiniest first step?`,
    ],
  ]);
}

export const splitDone = (count: number, first: string) =>
  L(
    `Đã chia thành ${count} bước ✂️ Bắt đầu với “${shortText(first)}” nhé — chỉ 15–30 phút thôi!`,
    `Split into ${count} steps ✂️ Start with “${shortText(first)}” — just 15–30 minutes!`,
  );

export const deleted = (t: TodoTask) => L(`Đã xoá ${q(t)} 🗑 Danh sách gọn hơn rồi!`, `Deleted ${q(t)} 🗑 One less thing on your list!`);

/** Confirmation text shown before deleting; warns that sub-tasks and recurring series go too. */
export function confirmDelete(t: TodoTask): string {
  let s = L("Xoá hẳn khỏi Todoist (kèm việc con nếu có)", "Delete from Todoist for good (with any sub-tasks)");
  if (isRecurring(t)) s += L(", cả chuỗi lặp lại", ", including the whole recurring series");
  return s + L("? Không khôi phục được.", "? This can't be undone.");
}

export const unplanned = (t: TodoTask) =>
  L(`Đã bỏ ${q(t)} khỏi kế hoạch (vẫn còn trong Todoist, không hạn). Nhẹ đầu hơn chưa? 🙂`, `Took ${q(t)} off the plan (still in Todoist, no date). Feels lighter? 🙂`);

// Pet life

export const golden = () => L("✨ HIẾM! Bánh vàng cho bạn! ✨", "✨ RARE! A golden treat! ✨");
export const combo = (n: number) => L(`🔥 Combo ×${n}! Đang cháy quá!`, `🔥 Combo ×${n}! You're on fire!`);
export const cleaned = (dirtLeft: number) => (dirtLeft === 0 ? L("🛁 Mình sạch bong rồi!", "🛁 Squeaky clean again!") : L("🛁 Sạch hơn chút rồi…", "🛁 A bit cleaner…"));
export const levelUp = (s: StageIndex) => L(`⬆️ Mình lớn lên thành ${stageName(s)}!`, `⬆️ I grew up: ${stageName(s)}!`);
export const unlocked = (items: Accessory[]) => L("🎁 Mở khoá: ", "🎁 Unlocked: ") + items.map((a) => `${accessoryEmoji(a)} ${accessoryName(a)}`).join(", ");
export const speciesUnlocked = (emoji: string, name: string) =>
  L(`🥚 Bạn mới mở khoá một bạn mới: ${emoji} ${name}! Đổi trong Cài đặt nhé.`, `🥚 New friend unlocked: ${emoji} ${name}! Switch in Settings.`);
export const streak = (n: number) => L(`🔥 Chuỗi ${n} ngày — giữ nhé!`, `🔥 ${n}-day streak — keep it going!`);
export const dirty = (dirt: number) =>
  L(`🛁 Mình hơi lấm lem (lỡ ${dirt} ngày). Xong 1 việc là mình được tắm nè!`, `🛁 I'm a bit grubby (${n(dirt, "missed day")}). Finish one task and I get a bath!`);

// Forgiving streaks: one kind word the morning after, never a scolding. `when` is "yesterday" / "3 days ago".

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const snacksLeft = (left: number) =>
  left > 0 ? L(` Còn ${left} bánh trong túi.`, ` ${left} left in the stash.`) : L(" Hết bánh rồi, ngày nào đạt mục tiêu là có thêm.", " That was the last one; hit your daily goal to earn another.");

export const dayFrozen = (when: string, streak: number, left: number) =>
  (streak > 0
    ? L(`🍪 ${cap(when)} bạn chưa xong việc nào, nên mình ăn một bánh để giữ chuỗi 🔥${streak} cho bạn.`, `🍪 Nothing got done ${when}, so I ate a snack to keep your 🔥${streak} streak safe.`)
    : L(`🍪 ${cap(when)} bạn chưa xong việc nào, nên mình ăn một bánh cho đỡ buồn — vẫn sạch sẽ nhé.`, `🍪 Nothing got done ${when}, so I had a snack instead of getting grubby.`)) + snacksLeft(left);

export const dayExcused = (when: string, streak: number) =>
  L(`📅 ${cap(when)} lịch họp kín mít nên mình không tính ngày đó.`, `📅 Your calendar was packed ${when}, so that day doesn't count.`) +
  (streak > 0 ? L(` Chuỗi 🔥${streak} vẫn nguyên nhé.`, ` Your 🔥${streak} streak is safe.`) : "");

export const dayBroken = (when: string, lost: number, tasks: number, today: boolean) =>
  L(
    `🌱 Chuỗi ${lost} ngày tạm đứt ${when} — không sao đâu! Xong ${tasks} việc ${today ? "hôm nay" : "vào ngày làm việc tới"} là mình nối lại cho bạn.`,
    `🌱 Your ${lost}-day streak slipped ${when}. No worries! Finish ${tasks} tasks ${today ? "today" : "on your next workday"} and I'll bring it back.`,
  );

export const pageDone = (page: number, snack: boolean) =>
  L(
    `📒 Trang sticker ${page} đầy rồi! +50 XP${snack ? " và một 🍪 cho túi" : ""}. Trang mới tặng sẵn 2 sticker 🎁.`,
    `📒 Sticker page ${page} is full! +50 XP${snack ? " and a 🍪 for the stash" : ""}. The new page starts with 2 free stickers 🎁.`,
  );

export const streakRepaired = (n: number) => L(`🎉 Chuỗi 🔥${n} đã được nối lại! Hôm nay cũng được tính nữa.`, `🎉 Your 🔥${n} streak is back! Today counts too.`);

export const dayOff = (on: boolean, streak: number) =>
  on
    ? L("🌿 Hôm nay nghỉ nhé! Mình không nhắc gì đâu", "🌿 Day off! No reminders today") +
      (streak > 0 ? L(`, chuỗi 🔥${streak} vẫn nguyên.`, `, and your 🔥${streak} streak stays put.`) : ".")
    : L("💼 Quay lại làm việc rồi! Mình nhắc như thường nhé.", "💼 Back to work! I'll keep you on track as usual.");

export function hungry(satiety: number, next: TodoTask | null): string {
  const n = next ? L(` Xong ${q(next)} cho mình ăn với 🥺`, ` Finish ${q(next)} and feed me 🥺`) : "";
  return (satiety < 10 ? L("Đói lả rồi… 😵‍💫", "Starving… 😵‍💫") : L("Bụng mình réo rồi nè 🍙", "My tummy is rumbling 🍙")) + n;
}

export const grumble = (next: TodoTask) =>
  pick([
    [`Haizzz… 😮‍💨 ${q(next)} vẫn chưa ai đụng tới.`, `Sigh… 😮‍💨 Nobody has touched ${q(next)} yet.`],
    [`*giậm chân* Mình chờ ${q(next)} lâu lắm rồi đó 😤`, `*stomps* I've been waiting for ${q(next)} forever 😤`],
  ]);

export const parade = (next: TodoTask) => L(`Mình sẽ diễu hành tới khi bạn làm ${q(next)} thì thôi! 📢`, `I'm marching until you do ${q(next)}! 📢`);

export function block(app: string, next: TodoTask | null): string {
  const n = next ? L(` Làm ${q(next)} đi!`, ` Go do ${q(next)}!`) : "";
  return L(`(╯°□°)╯︵ ┻━┻ ĐỦ RỒI ${app.toUpperCase()}!`, `(╯°□°)╯︵ ┻━┻ ENOUGH ${app.toUpperCase()}!`) + n;
}

export function distractionSummary(d: Record<string, number>): string {
  const total = Math.trunc(Object.values(d).reduce((a, b) => a + b, 0) / 60);
  const top = Object.entries(d)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} ${Math.trunc(v / 60)}'`)
    .join(", ");
  return L(`Hôm nay bạn ở mấy chỗ xao nhãng ${total} phút đó 😒 (${top})`, `You spent ${n(total, "minute")} on distractions today 😒 (${top})`);
}

// Spoken lines (short, no emoji).
export const voiceGrumble = () => pick([["Haizzz. Làm việc đi chứ.", "Sigh. Get to work."], ["Mình chán quá à.", "I'm so bored."]]);
export const voiceAngry = (t: TodoTask) => L(`Ê! Làm ${shortText(taskTitle(t), 30)} ngay!`, `Hey! Do ${shortText(taskTitle(t), 30)} now!`);
export const voiceBlock = (app: string) => L(`Tắt ${app} đi!`, `Close ${app}!`);
export const voiceHungry = () => L("Mình đói quá.", "I'm so hungry.");
export const voiceCheer = () => pick([["Tuyệt vời!", "Awesome!"], ["Hoan hô!", "Hooray!"]]);
export const voiceSummary = (minutes: number) => L(`Hôm nay bạn lướt mạng ${minutes} phút đó.`, `You goofed off for ${minutes} minutes today.`);

/** Short, evidence-based productivity tips the pet drops occasionally. */
export const tip = () =>
  pick([
    ["Mẹo: làm việc khó nhất trước (Eat the frog 🐸) — năng lượng đầu ngày là tốt nhất.", "Tip: do the hardest task first (eat the frog 🐸) — early energy is your best."],
    ["Mẹo: việc to quá? Chia thành bước 15–30 phút rồi thêm vào Todoist.", "Tip: task too big? Split it into 15–30 minute steps in Todoist."],
    ["Mẹo: gắn giờ cụ thể (“14h làm X”) giúp bạn dễ bắt tay vào việc hơn hẳn.", "Tip: give tasks a concrete time (“2pm: do X”) — it makes starting much easier."],
    ["Mẹo: cuối ngày dành 5 phút chọn sẵn 3 việc cho mai — sáng mai vào việc ngay.", "Tip: spend 5 minutes at day's end picking tomorrow's 3 tasks."],
    ["Mẹo: mỗi lần bị gián đoạn cần khá lâu để tập trung lại — tắt thông báo khi tập trung nhé.", "Tip: every interruption costs a long refocus — mute notifications while focusing."],
    ["Mẹo: uống nước & đứng dậy vươn vai sau mỗi phiên tập trung 💧", "Tip: drink water and stretch after each focus session 💧"],
  ]);
