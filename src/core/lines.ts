// Everything the pet says, in both languages (Lines.swift). Tone follows the mood.
import type { CalEvent, SlotSuggestion } from "./calendar";
import { hoursText, shortText, timeString } from "./dates";
import { L, pick } from "./l10n";
import type { DayLoad } from "./load";

/** English noun with its count: n(1, "task") → "1 task", n(3, "task") → "3 tasks". */
const n = (count: number, noun: string, nouns = `${noun}s`) => `${count} ${count === 1 ? noun : nouns}`;
import { accessoryEmoji, accessoryName, stageName } from "./life";
import { isRecurring, taskTitle, type TodoTask } from "./models";
import type { ResumeSummary } from "./resume";
import type { StuckTask } from "./stuck";
import { LUNCH_HOUR, type StartTrigger } from "./triggers";
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

/** What the evening before left for this morning (SPEC v0.4 §3): the frog, if it is still open, and the note. */
export interface MorningPlan {
  frog: TodoTask | null;
  note: string | null;
}

export function morning(now: Date, plannedCount: number, openCount: number, next: TodoTask | null, target: number, plan: MorningPlan | null = null): string {
  const g = greeting(now);
  const frog = plan?.frog ?? null;
  const picked = frog !== null && frog.id === next?.id;
  let text: string;
  if (plannedCount < target) {
    text = `${g} ${L(
      `Hôm nay mình làm ${target} việc gì nào? Mới có ${plannedCount}/${target} việc thôi 📝`,
      `What are our ${target} things today? Only ${plannedCount}/${target} planned so far 📝`,
    )}`;
  } else if (next) {
    text = `${g} ${
      picked
        ? L(`Hôm nay có ${openCount} việc. Con ếch bạn đã chọn từ trước: ${q(next)} 🐸`, `${openCount} tasks today. The frog you picked before you left: ${q(next)} 🐸`)
        : L(`Hôm nay có ${openCount} việc. Ăn con ếch trước: ${q(next)} 🐸`, `${openCount} tasks today. Eat the frog first: ${q(next)} 🐸`)
    }`;
  } else {
    text = g;
  }
  // Said once, on the line of its own, unless the greeting above already put it as the frog to eat first.
  if (frog && !(picked && plannedCount >= target)) {
    text += `\n🐸 ${L(`Lúc kết thúc ngày bạn đã chọn ${q(frog)} làm con ếch hôm nay.`, `Before you left you picked ${q(frog)} as today's frog.`)}`;
  }
  if (plan?.note) text += `\n📝 ${L("Ghi chú của bạn: ", "Your note: ")}“${plan.note}”`;
  return text;
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

const staysPut = (repeating: number) =>
  repeating > 0
    ? L(` (${repeating} việc lặp lại vẫn giữ lịch của nó.)`, ` (${n(repeating, "repeating task")} ${repeating === 1 ? "stays" : "stay"} put.)`)
    : "";

/**
 * `movable` overdue tasks can move: to today, or a fresh start that moves them all to tomorrow. `repeating` ones
 * keep their own schedule; when every overdue task repeats, there's nothing to move and only Show is offered.
 */
export function overdue(mood: Mood, movable: number, repeating = 0): string {
  if (movable === 0) {
    return L(
      `${repeating} việc lặp lại đang quá hạn 🔁 Chúng tự quay lại theo lịch, nên xong lần này khi bạn rảnh là được.`,
      `${n(repeating, "repeating task")} ${repeating === 1 ? "is" : "are"} overdue 🔁 They come back on their own schedule, so just tick this one off when you can.`,
    );
  }
  const them = movable === 1 ? "it" : "them";
  if (mood === "annoyed" || mood === "angry") {
    return (
      L(
        `${movable} việc quá hạn đang chờ… 😟 Để mình giúp: dời vào hôm nay, hoặc dời hết sang mai để bắt đầu lại.`,
        `${n(movable, "overdue task")} waiting… 😟 Let me help: move ${them} to today, or clear ${them} to tomorrow for a fresh start.`,
      ) + staysPut(repeating)
    );
  }
  return (
    L(`Có ${movable} việc quá hạn 😬 Dời vào hôm nay, hay dời hết sang mai để bắt đầu lại?`, `${n(movable, "overdue task")} 😬 Move ${them} to today, or make a fresh start tomorrow?`) +
    staysPut(repeating)
  );
}

/** Every task that could move did; `repeating` overdue ones stayed (so today is a clean slate only without them). */
export const freshStart = (moved: number, repeating: number) =>
  repeating === 0
    ? L(`🌱 Bắt đầu lại nhé! Đã dời ${moved} việc quá hạn sang mai, hôm nay nhẹ hơn rồi.`, `🌱 Fresh start! Moved ${n(moved, "overdue task")} to tomorrow. Today is a clean slate.`)
    : L(
        `🌱 Bắt đầu lại nhé! Đã dời ${moved} việc quá hạn sang mai. Việc lặp lại vẫn giữ lịch của nó.`,
        `🌱 Fresh start! Moved ${n(moved, "overdue task")} to tomorrow. Repeating tasks stay put.`,
      );

/** Some tasks couldn't move: `moved` of `total` did, `failed` didn't. */
export function freshStartPartial(moved: number, total: number, failed: number, repeating: number, error: string): string {
  const what =
    moved === 0
      ? L(`Chưa dời được ${total} việc quá hạn 😵`, `Couldn't move the ${n(total, "overdue task")} 😵`)
      : L(`Đã dời ${moved}/${total} việc quá hạn sang mai; ${failed} việc chưa dời được 😵`, `Moved ${moved} of ${n(total, "overdue task")} to tomorrow; ${failed} couldn't move 😵`);
  const repeat = repeating > 0 ? L(" Việc lặp lại vẫn giữ lịch của nó.", " Repeating tasks stay put.") : "";
  return `${what}${error ? ` ${error}` : ""}${repeat}`;
}

/** Undo of a fresh start: `back` tasks are on their old dates again, `failed` couldn't be. */
export const freshStartUndone = (back: number, failed: number) =>
  failed === 0
    ? L(`↩️ Đã trả ${back} việc về ngày cũ.`, `↩️ Put ${n(back, "task")} back on ${back === 1 ? "its" : "their"} old date.`)
    : L(`↩️ Đã trả ${back} việc về ngày cũ; ${failed} việc chưa trả được 😵`, `↩️ Put ${n(back, "task")} back; ${failed} couldn't move 😵`);

// While you're on a distracting app or site, the pet may be playful (a pout, a stomp, a sign), never insulting.

export function distraction(mood: Mood, app: string, left: number, next: TodoTask | null): string {
  if (mood === "angry" && next) {
    return L(`Lại ${app} rồi nè 👀 ${q(next)} đang nhớ bạn đó, quay lại với mình nhé? 😤`, `Psst, ${app} again? 👀 ${q(next)} misses you. Come back to it with me? 😤`);
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
    `Sắp hết giờ làm. Hôm nay xong ${completed}/${plannedCount} việc. Còn ${left} việc — tổng kết ngày, hay dời hết sang mai?`,
    `Almost end of day: ${completed}/${plannedCount} done. Wrap up the day, or move the remaining ${left} to tomorrow?`,
  );

/** "Done for today": a good evening, naming the frog that starts tomorrow when you picked one. */
export const wrappedUp = (frog: TodoTask | string | null) => {
  const name = frog === null ? null : typeof frog === "string" ? `“${shortText(frog, 60)}”` : q(frog);
  return L("Xong ngày rồi 🌙 Nghỉ ngơi nhé.", "All wrapped up 🌙 Rest well.") + (name ? L(` Mai mình bắt đầu với ${name} 🐸`, ` Tomorrow starts with ${name} 🐸`) : "");
};

export const backToWork = () => L("Mình dậy rồi 🌤 Cần gì cứ gọi mình nhé.", "I'm up again 🌤 Call me whenever you need me.");

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

/** `related` are open tasks that share a word with the meeting's title (at most 2 are listed). */
export const meetingSoon = (e: CalEvent, minutes: number, related: TodoTask[] = []) =>
  L(
    `📅 ${minutes} phút nữa họp: “${shortText(e.title)}” (${timeString(e.start)})`,
    `📅 Meeting in ${minutes} min: “${shortText(e.title)}” (${timeString(e.start)})`,
  ) + (related.length > 0 ? `\n${L("Liên quan: ", "Related: ")}${related.slice(0, 2).map((t) => `“${shortText(taskTitle(t), 40)}”`).join(", ")}` : "");

/**
 * After a meeting of 15+ minutes: a kind question. `next` is the following meeting when there is time for a breather
 * before it (`breather` minutes, at most 5), and then a short one is suggested.
 */
export const meetingOver = (e: CalEvent, next: CalEvent | null = null, breather = 5) =>
  L(`“${shortText(e.title)}” xong rồi. Có gì cần ghi lại không?`, `“${shortText(e.title)}” is over. Anything to capture?`) +
  (next
    ? `\n${L(
        `“${shortText(next.title)}” bắt đầu lúc ${timeString(next.start)} — nghỉ ${breather} phút trước nhé?`,
        `“${shortText(next.title)}” starts at ${timeString(next.start)} — a ${breather}-minute breather first?`,
      )}`
    : "");

export function calendarDay(meetings: number, busyMinutes: number, free: number, target: number, reduced: boolean): string {
  const base = L(
    `📅 Hôm nay ${meetings} cuộc họp (${hoursText(busyMinutes)}), còn ${hoursText(free)} trống`,
    `📅 ${n(meetings, "meeting")} today (${hoursText(busyMinutes)}), ${hoursText(free)} free`,
  );
  return base + (reduced ? L(` → ${target} việc là vừa sức.`, ` → ${n(target, "task")} ${target === 1 ? "is" : "are"} realistic.`) : ".");
}

// Overbooked warning and the board's load meter (SPEC v0.4 §4)

/** "45 min", "2h", "2h30": under an hour is said in minutes. */
const span = (minutes: number) => (minutes < 60 ? L(`${Math.round(minutes)} phút`, `${Math.round(minutes)} min`) : hoursText(minutes));

export const overbooked = (load: DayLoad) =>
  L(
    `Hôm nay có vẻ quá tải: ~${span(load.taskMinutes)} việc${load.meetingMinutes > 0 ? ` + ${span(load.meetingMinutes)} họp` : ""} trong khi chỉ còn ${span(load.capacity)}. Dời bớt vài việc nhé?`,
    `Today looks overbooked: ~${span(load.taskMinutes)} of tasks${load.meetingMinutes > 0 ? ` + ${span(load.meetingMinutes)} of meetings` : ""} in ${span(load.capacity)} left. Move some?`,
  );

/** The board's meter: what is still ahead over the work time left ("~6h / 7h left"). */
export function loadMeter(load: DayLoad): string {
  const total = load.taskMinutes + load.meetingMinutes;
  if (load.capacity > 0) return L(`~${span(total)} / ${span(load.capacity)} còn lại`, `~${span(total)} / ${span(load.capacity)} left`);
  if (total > 0) return L(`Hết giờ làm · còn ~${span(total)} việc`, `Work day is over · ~${span(total)} still open`);
  return L("Hôm nay còn trống", "Nothing on today");
}

/** The meter's tooltip: the parts of the load, and by how much it runs over. */
export function loadDetail(load: DayLoad): string {
  const parts = L(
    `~${span(load.taskMinutes)} việc${load.meetingMinutes > 0 ? ` và ${span(load.meetingMinutes)} họp` : ""} còn phía trước`,
    `~${span(load.taskMinutes)} of tasks${load.meetingMinutes > 0 ? ` and ${span(load.meetingMinutes)} of meetings` : ""} still ahead`,
  );
  if (load.capacity <= 0) return `${parts}. ${L("Giờ làm hôm nay đã hết.", "The work day is over.")}`;
  const over = load.overBy > 0 ? L(` — quá ${span(load.overBy)}`, ` — ${span(load.overBy)} over`) : "";
  return `${parts}, ${L(`trong ${span(load.capacity)} làm việc còn lại`, `in ${span(load.capacity)} of work time left`)}${over}.`;
}

export const timeBlock = (s: SlotSuggestion) =>
  L(
    `Gắn giờ cho dễ bắt đầu: ${timeString(s.start)}–${timeString(s.end)} làm ${q(s.task)} nhé?`,
    `A set time makes it easier to start: ${timeString(s.start)}–${timeString(s.end)} for ${q(s.task)}?`,
  );

export const timeSet = (t: TodoTask, at: Date) =>
  L(`Đã hẹn ${q(t)} lúc ${timeString(at)}. Mình sẽ nhắc đúng giờ ⏰`, `Scheduled ${q(t)} at ${timeString(at)}. I'll remind you ⏰`);

// Where was I? (the resume card). It names the app and the page, so the diary gets `resumeDiary` instead.

export type ResumeReason = "away" | "meeting" | "distraction";

export function resumeCard(r: ResumeSummary, reason: ResumeReason = "away"): string {
  const lead =
    reason === "meeting"
      ? L("Họp xong rồi nhé 👋", "Meeting's done 👋")
      : reason === "distraction"
        ? L("Không vội đâu, khi nào sẵn sàng nhé 🌱", "No rush, whenever you're ready 🌱")
        : L("Bạn về rồi! 👋", "Welcome back! 👋");
  const task = r.task ? `“${shortText(r.task, 60)}”` : null;
  const parts = [lead];
  if (task && r.taskIsNext) {
    // Not something you were doing: it's the next one in line, and where you were is a side note.
    parts.push(r.where ? L(`Việc tiếp theo: ${task} · bạn vừa ở ${r.where}`, `Next up: ${task} · you were in ${r.where}`) : L(`Việc tiếp theo: ${task}`, `Next up: ${task}`));
  } else if (task && r.where) parts.push(L(`Bạn đang làm: ${task} · trong ${r.where}`, `You were on: ${task} · in ${r.where}`));
  else if (task) parts.push(L(`Bạn đang làm: ${task}`, `You were on: ${task}`));
  else if (r.where) parts.push(L(`Bạn đang ở: ${r.where}`, `You were in: ${r.where}`));
  if (r.note) parts.push(L(`📌 Bước tiếp theo: ${r.note}`, `📌 Next step: ${r.note}`));
  return parts.join("\n");
}

/** The Reopen button: "Reopen ↗ docs.google.com" (the host is cut when it is long). */
export const reopenTitle = (host: string | null) => L("Mở lại ↗", "Reopen ↗") + (host ? ` ${shortText(host, 28)}` : "");

/** Reopen didn't work. */
export const reopenFailed = () =>
  L("Mình chưa mở lại được trang đó 😅 Lịch sử trình duyệt chắc còn giữ nó.", "Couldn't reopen that page 😅 Your browser's history should still have it.");

/** What the diary keeps of a resume card: never the app, the page or the note. */
export const resumeDiary = (task: string | null, hasNote: boolean) =>
  L("Thẻ “bạn đang làm gì”", "Resume card") + (task ? `: “${shortText(task, 40)}”` : "") + (hasNote ? L(" (có ghi chú đã ghim)", " (with the pinned note)") : "");

export const pinned = () => L("📌 Đã ghim chỗ này. Mình sẽ nhắc khi bạn quay lại.", "📌 Pinned. I'll remind you when you're back.");

// If-then starts and the 2-minute starter

export const asPlanned = (t: TodoTask) => L(`Như đã định: ${q(t)}`, `As planned: ${q(t)}`);

/** The chip on a task with a plan: "⏱ after 14:00 meeting". */
export function triggerChip(trigger: StartTrigger, events: CalEvent[]): string {
  switch (trigger.kind) {
    case "afterMeeting": {
      const e = events.find((x) => x.id === trigger.eventId);
      return e
        ? L(`⏱ sau họp ${timeString(e.start)}`, `⏱ after ${timeString(e.start)} meeting`)
        : L(`⏱ sau “${shortText(trigger.title, 18)}”`, `⏱ after “${shortText(trigger.title, 18)}”`);
    }
    case "appOpen":
      return L(`⏱ khi mở ${shortText(trigger.app, 18)}`, `⏱ when I open ${shortText(trigger.app, 18)}`);
    case "afterLunch":
      return L("⏱ sau bữa trưa", "⏱ after lunch");
  }
}

/** A choice in a task's "Start when…" menu. */
export function triggerChoice(trigger: StartTrigger, events: CalEvent[], max = 30): string {
  switch (trigger.kind) {
    case "afterMeeting": {
      const e = events.find((x) => x.id === trigger.eventId);
      const title = shortText(trigger.title || e?.title || "", max);
      return L(`Sau họp “${title}”${e ? ` (${timeString(e.end)})` : ""}`, `After “${title}”${e ? ` (${timeString(e.end)})` : ""}`);
    }
    case "appOpen":
      return L(`Khi tôi mở ${shortText(trigger.app, max)}`, `When I open ${shortText(trigger.app, max)}`);
    case "afterLunch":
      return L(`Sau bữa trưa (${LUNCH_HOUR}:00)`, `After lunch (${LUNCH_HOUR}:00)`);
  }
}

/** What the diary says about a plan: its kind only, never the meeting's title or the app's name. */
export function triggerKindText(trigger: StartTrigger): string {
  switch (trigger.kind) {
    case "afterMeeting":
      return L("sau một cuộc họp", "after a meeting");
    case "appOpen":
      return L("khi một ứng dụng mở", "when an app opens");
    case "afterLunch":
      return L("sau bữa trưa", "after lunch");
  }
}

export const starterStart = (t: TodoTask | null, minutes = 2) =>
  t
    ? L(`Chỉ ${minutes} phút thôi cho ${q(t)}. Mở ra xem là được rồi 🌱`, `Just ${n(minutes, "minute")} on ${q(t)}. Open it and see, that's all 🌱`)
    : L(`Chỉ ${minutes} phút thôi. Mở ra xem là được rồi 🌱`, `Just ${n(minutes, "minute")}. Open it and see, that's all 🌱`);

export const starterEnd = (t: TodoTask | null) =>
  t
    ? L(`Xong 2 phút rồi, bạn đã bắt đầu ${q(t)}! 🌱 Làm tiếp một phiên đầy đủ, hay dừng ở đây nhé?`, `Two minutes done, you've started ${q(t)}! 🌱 Keep going with a full session, or stop here for now?`)
    : L("Xong 2 phút rồi, bạn đã bắt đầu! 🌱 Làm tiếp một phiên đầy đủ, hay dừng ở đây nhé?", "Two minutes done, you've started! 🌱 Keep going with a full session, or stop here for now?");

export const starterGone = (t: TodoTask | null) =>
  t
    ? L(`Xong 2 phút rồi, và ${q(t)} cũng đã xong! 🌱`, `Two minutes done, and ${q(t)} is already off your list! 🌱`)
    : starterEnd(null);

export const starterEnough = () => L("Hay lắm, bắt đầu là phần khó nhất 🌱 Lần sau sẽ dễ hơn.", "Nice, starting is the hardest part 🌱 It gets easier next time.");

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

/** A snack saved the streak (only eaten when there is one to save). */
export const dayFrozen = (when: string, streak: number, left: number) =>
  L(`🍪 ${cap(when)} bạn chưa xong việc nào, nên mình ăn một bánh để giữ chuỗi 🔥${streak} cho bạn.`, `🍪 Nothing got done ${when}, so I ate a snack to keep your 🔥${streak} streak safe.`) + snacksLeft(left);

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

/** A repair quest ran out unfinished; `streak` is the new one (1 when the quest's day still had a task done). */
export const repairExpired = (streak: number) =>
  streak > 0
    ? L(`🌱 Nhiệm vụ nối chuỗi đã hết hạn, không sao đâu! Chuỗi mới 🔥${streak} của bạn vẫn đang chạy.`, `🌱 The repair quest ran out. No worries, your new 🔥${streak} streak is going.`)
    : L("🌱 Nhiệm vụ nối chuỗi đã hết hạn, không sao đâu! Hôm nay mình bắt đầu chuỗi mới nhé.", "🌱 The repair quest ran out. No worries, a new streak starts today.");

export const dayOff = (on: boolean, streak: number) =>
  on
    ? L("🌿 Hôm nay nghỉ nhé! Mình không nhắc gì đâu", "🌿 Day off! No reminders today") +
      (streak > 0 ? L(`, chuỗi 🔥${streak} không bị đứt.`, `, and your 🔥${streak} streak is safe.`) : ".") +
      L(" Lỡ xong việc nào thì vẫn được tính nhé.", " Anything you do finish still counts.")
    : L("💼 Quay lại làm việc rồi! Mình nhắc như thường nhé.", "💼 Back to work! I'll keep you on track as usual.");

export function hungry(satiety: number, next: TodoTask | null): string {
  const n = next ? L(` Xong ${q(next)} cho mình ăn với 🥺`, ` Finish ${q(next)} and feed me 🥺`) : "";
  return (satiety < 10 ? L("Đói lả rồi… 😵‍💫", "Starving… 😵‍💫") : L("Bụng mình réo rồi nè 🍙", "My tummy is rumbling 🍙")) + n;
}

export const grumble = (next: TodoTask) =>
  pick([
    [`Haizzz… 😮‍💨 ${q(next)} vẫn đang chờ bạn đó.`, `Sigh… 😮‍💨 ${q(next)} is still waiting for you.`],
    [`*giậm chân* Mình giữ ${q(next)} cho bạn lâu lắm rồi nè 😤`, `*taps foot* I've been saving ${q(next)} for you 😤`],
  ]);

export const parade = (next: TodoTask) => L(`Mình sẽ diễu hành tới khi bạn làm ${q(next)} thì thôi! 📢`, `I'm marching until you do ${q(next)}! 📢`);

export function block(app: string, next: TodoTask | null): string {
  const n = next ? L(` Mình cùng làm ${q(next)} nhé?`, ` Shall we do ${q(next)} together?`) : "";
  return L(`(╯°□°)╯︵ ┻━┻ ${app} lâu quá rồi đó!`, `(╯°□°)╯︵ ┻━┻ That's a lot of ${app}!`) + n;
}

/** The end-of-day note on time spent on distracting apps and sites: a neutral tally, then an offer. */
export function distractionSummary(d: Record<string, number>): string {
  const total = Math.trunc(Object.values(d).reduce((a, b) => a + b, 0) / 60);
  const top = Object.entries(d)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} ${Math.trunc(v / 60)}'`)
    .join(", ");
  return L(
    `Hôm nay bạn ghé mấy chỗ xao nhãng tổng cộng ${total} phút (${top}). Mai mình giúp bạn giữ tập trung nhé 🛡️`,
    `Today's detours: ${n(total, "minute")} (${top}). Want me to help guard your focus tomorrow? 🛡️`,
  );
}

// Spoken lines (short, no emoji): invitations, never orders.
export const voiceGrumble = () => pick([["Mình bắt đầu một việc nhỏ nhé?", "Shall we start something small?"], ["Mình ở đây khi bạn sẵn sàng.", "I'm here when you're ready."]]);
export const voiceAngry = (t: TodoTask) => L(`Mình làm ${shortText(taskTitle(t), 30)} nhé? Mình ở đây với bạn.`, `How about ${shortText(taskTitle(t), 30)}? I'll keep you company.`);
export const voiceBlock = (app: string) => L(`Để ${app} lát nữa nhé?`, `Shall we leave ${app} for later?`);
export const voiceHungry = () => L("Mình đói quá.", "I'm so hungry.");
export const voiceCheer = () => pick([["Tuyệt vời!", "Awesome!"], ["Hoan hô!", "Hooray!"]]);
export const voiceSummary = (minutes: number) => L(`Hôm nay có ${minutes} phút xao nhãng. Mai mình làm lại nhé.`, `${minutes} minutes of detours today. Tomorrow is a fresh start.`);

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
