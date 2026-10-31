// Everything the pet says, in both languages (Lines.swift). Tone follows the mood.
//
// Lines that vary are packs of [vi, en] options handed to `say` (SPEC v0.8 §1): the brain passes its memory, so the
// pet doesn't say the same line again while a fresh one is left. Append only: a new option goes at the end of its
// pack, since an option's index is its identity in that memory.
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
import { eventKey, LUNCH_HOUR, type StartTrigger } from "./triggers";
import { emojiOf, itemName, placeName, type TripReturn } from "./trips";
import { weekRecap, type WeekStats } from "./chapters";
import type { Accessory, Mood, StageIndex } from "./types";
import type { Phrase } from "./variety";

const q = (t: TodoTask) => `“${shortText(taskTitle(t))}”`;

/** Any option at random: for callers (and tests) without the pet's memory. */
export const randomPhrase: Phrase = (p) => pick(p.options);

export function greeting(now: Date, say: Phrase): string {
  const h = now.getHours();
  if (h < 11) return say({ key: "greeting.morning", options: [["Chào buổi sáng! ☀️", "Good morning! ☀️"]] });
  if (h < 13) return say({ key: "greeting.midday", options: [["Chào buổi trưa! 🌤", "Good day! 🌤"]] });
  if (h < 18) return say({ key: "greeting.afternoon", options: [["Chào buổi chiều! 🌇", "Good afternoon! 🌇"]] });
  return say({ key: "greeting.evening", options: [["Chào buổi tối! 🌙", "Good evening! 🌙"]] });
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

export function morning(now: Date, plannedCount: number, openCount: number, next: TodoTask | null, target: number, plan: MorningPlan | null = null, say: Phrase): string {
  const g = greeting(now, say);
  const frog = plan?.frog ?? null;
  const picked = frog !== null && frog.id === next?.id;
  let text: string;
  if (plannedCount < target) {
    text = `${g} ${say({ key: "morning.plan", options: [[
      `Hôm nay mình làm ${target} việc gì nào? Mới có ${plannedCount}/${target} việc thôi 📝`,
      `What are our ${target} things today? Only ${plannedCount}/${target} planned so far 📝`,
    ]] })}`;
  } else if (next) {
    text = `${g} ${
      picked
        ? say({ key: "morning.frogPicked", options: [[`Hôm nay có ${openCount} việc. Con ếch bạn đã chọn từ trước: ${q(next)} 🐸`, `${openCount} tasks today. The frog you picked before you left: ${q(next)} 🐸`]] })
        : say({ key: "morning.frog", options: [[`Hôm nay có ${openCount} việc. Ăn con ếch trước: ${q(next)} 🐸`, `${openCount} tasks today. Eat the frog first: ${q(next)} 🐸`]] })
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

export function plan(mood: Mood, plannedCount: number, target: number, say: Phrase): string {
  const k = target - plannedCount;
  if (mood === "angry") {
    return say({ key: "plan.angry", options: [
      [`Mình cùng kéo hôm nay lại nhé: chọn thêm ${k} việc, mình giúp bạn bắt đầu 💪`, `Let's get today back on track: pick ${k} more and I'll help you start 💪`],
      [`Mình cùng lên nốt kế hoạch hôm nay nhé: còn ${k} việc nữa thôi 📝`, `Let's plan the rest of today together: just ${k} more to go 📝`],
      [`Hôm nay mình làm lại từ đầu nhé: chọn ${k} việc, bắt đầu từ việc dễ nhất 🔄`, `Let's reset today: pick ${n(k, "task")} and start with the easiest 🔄`],
      [`Mình muốn giúp bạn có một ngày tốt. Chỉ cần thêm ${k} việc nữa thôi 🤗`, `I want to help you have a good day. Just ${n(k, "more task")} 🤗`],
      [`Còn ${k} chỗ trong kế hoạch. Mình chọn cùng nhau, nhanh thôi ⏱️`, `${n(k, "spot")} left in the plan. Let's pick together, it's quick ⏱️`],
      [`Ngày còn dài mà! Chọn ${k} việc, mình đi cùng bạn 💪`, `There's still plenty of day left! Pick ${k}, and I'll go with you 💪`],
    ] });
  }
  if (mood === "annoyed") {
    return say({ key: "plan.annoyed", options: [
      [`Mình hơi lo… hôm nay mới có ${plannedCount}/${target} việc. Chọn thêm ${k} việc cùng mình nhé? 📝`, `I'm a little worried… only ${plannedCount}/${target} planned. Pick ${k} more with me? 📝`],
      [`Kế hoạch chưa đủ cũng không sao. Chọn ${k} việc nhỏ cho dễ bắt đầu nhé 🌱`, `Not fully planned yet, and that's okay. Pick ${n(k, "small task")} to get going 🌱`],
      [`Mình hơi lo hôm nay chưa có kế hoạch rõ. Chọn ${k} việc thôi là được 🌱`, `I'm a bit worried today has no clear plan. Just ${n(k, "task")} will do 🌱`],
      [`Chưa đủ ${target} việc cho hôm nay (${plannedCount}/${target}). Mình cùng chọn nhé? 🤝`, `Not quite ${target} for today yet (${plannedCount}/${target}). Pick some together? 🤝`],
      [`Không cần hoàn hảo đâu. Thêm ${k} việc nhỏ là hôm nay ổn rồi 🍃`, `No need to be perfect. ${n(k, "small task")} and today's set 🍃`],
      [`Kế hoạch còn mỏng quá, mình lo nè. Chọn ${k} việc cùng mình nha? 📝`, `The plan's looking thin, and I'm a little worried. Choose ${k} with me? 📝`],
    ] });
  }
  return say({ key: "plan.normal", options: [
    [`Hôm nay mình làm ${target} việc gì nào? Mới có ${plannedCount}/${target} việc 📝`, `What are our ${target} things today? ${plannedCount}/${target} planned 📝`],
    [`Chọn ${k} việc quan trọng nhất cho hôm nay nhé ✍️`, `Pick the ${k} most important tasks for today ✍️`],
    [`Hôm nay mới lên ${plannedCount}/${target} việc. Thêm ${k} việc nữa cho đủ nhé 📋`, `${plannedCount}/${target} planned so far. ${k} more to round out the day 📋`],
    [`Cùng chọn ${k} việc cho hôm nay nha? Mình đợi bạn ✍️`, `Shall we pick ${n(k, "task")} for today? I'll wait ✍️`],
    [`Kế hoạch hôm nay còn trống ${k} chỗ. Việc nào đáng làm nhất? 🤔`, `Today's plan has ${n(k, "open spot")}. What matters most? 🤔`],
    [`Mục tiêu ${target} việc, mới có ${plannedCount}. Thêm vài việc vào hôm nay nhé 🗂️`, `Aiming for ${target}, ${plannedCount} so far. Add a few to today? 🗂️`],
  ] });
}

export function nudge(mood: Mood, next: TodoTask, hoursIdle: number, say: Phrase): string {
  if (mood === "happy") {
    return say({ key: "nudge.happy", options: [
      [`Đang ngon trớn! Tiếp theo là ${q(next)} nha ✨`, `On a roll! Next up: ${q(next)} ✨`],
      [`Mình thích nhịp này! Làm luôn ${q(next)} nhé 💪`, `Love this pace! Let's do ${q(next)} 💪`],
      [`Bạn đang vào guồng rồi! ${q(next)} tiếp nhé 🚀`, `You're in the zone! ${q(next)} next? 🚀`],
      [`Nhịp đẹp quá! Nhân tiện xử luôn ${q(next)} nha 😎`, `Great rhythm! Might as well take on ${q(next)} 😎`],
      [`Đà này mà làm ${q(next)} là chuẩn luôn ✨`, `With this momentum, ${q(next)} is perfect timing ✨`],
      [`Vui ghê! Mình đi tiếp với ${q(next)} nhé 🎶`, `This is fun! On to ${q(next)} 🎶`],
      [`Năng lượng đang tốt, ${q(next)} chờ bạn đó 🌞`, `Energy's good, ${q(next)} is waiting for you 🌞`],
      [`Cứ thế mà tiến! Tiếp theo: ${q(next)} 🏃`, `Keep it going! Next: ${q(next)} 🏃`],
    ] });
  }
  if (mood === "annoyed") {
    return say({ key: "nudge.annoyed", options: [
      [`${q(next)} có vẻ khó nhằn? Mình làm 10 phút thôi nhé 🌱`, `${q(next)} feeling heavy? Let's just do 10 minutes 🌱`],
      [`Mình hơi lo cho ${q(next)}. Bật một phiên tập trung, mình ngồi canh cho nhé? ⏱`, `I'm a little worried about ${q(next)}. Start a focus session and I'll keep watch? ⏱`],
      [`${q(next)} trông hơi to nhỉ? Chia nhỏ ra, làm phần dễ nhất trước nhé 🧩`, `${q(next)} looks big? Break it down and start with the easiest bit 🧩`],
      [`Mình ở đây nè. Thử 5 phút với ${q(next)} thôi, không cần xong ngay 🌱`, `I'm right here. Just 5 minutes on ${q(next)}, no need to finish 🌱`],
      [`Có vẻ hơi khó bắt đầu. Mở ${q(next)} ra xem trước nhé? 👀`, `Hard to get started? Just open ${q(next)} and have a look 👀`],
      [`Không sao đâu. Một bước nhỏ với ${q(next)} là đủ cho lúc này 🤍`, `It's okay. One small step on ${q(next)} is all it takes for now 🤍`],
      [`Mình hơi lo nè. Cùng làm ${q(next)} 10 phút, mình canh giờ cho 🕙`, `I'm a bit worried. Let's do 10 minutes of ${q(next)}, I'll time it 🕙`],
      [`Bắt đầu từ chỗ dễ nhất của ${q(next)} nhé, mình tin bạn 💛`, `Start with the easiest part of ${q(next)}, I believe in you 💛`],
    ] });
  }
  if (mood === "angry") {
    const h = Math.max(1, Math.round(hoursIdle));
    return say({ key: "nudge.angry", options: [
      [`${h} tiếng chưa có tiến triển. Mình làm bước nhỏ đầu tiên của ${q(next)} nhé 💪`, `${h}h without a win. Let's take the first small step of ${q(next)} 💪`],
      [`Quay lại với ${q(next)} nha? Mình canh giờ cho bạn tập trung 🛡️`, `Back to ${q(next)}? I'll guard the time while you focus 🛡️`],
      [`${h} tiếng trôi qua rồi. Mình thử 10 phút với ${q(next)} nhé? ⏳`, `${h}h have gone by. Shall we try 10 minutes of ${q(next)}? ⏳`],
      [`Mình đứng đây chờ ${q(next)} với bạn nè. Bắt đầu thôi? 🙋`, `I'm standing by for ${q(next)} with you. Shall we start? 🙋`],
      [`Lâu rồi chưa có việc nào xong. Bước nhỏ nhất của ${q(next)} là gì nhỉ? 🔎`, `It's been a while since a win. What's the tiniest step of ${q(next)}? 🔎`],
      [`Mình nhớ cảm giác gạch việc lắm! Cùng làm ${q(next)} nha? 🥺`, `I miss ticking things off! Shall we do ${q(next)} together? 🥺`],
      [`${h} tiếng rồi đó. Mình bật đồng hồ cho ${q(next)} nhé, chỉ 15 phút 🕒`, `It's been ${h}h. Let me start a timer for ${q(next)}, just 15 minutes 🕒`],
      [`Không trách bạn đâu, mình chỉ muốn giúp. ${q(next)} trước nhé? 🤝`, `No blame here, I just want to help. ${q(next)} first? 🤝`],
    ] });
  }
  return say({ key: "nudge.normal", options: [
    [`Việc tiếp theo: ${q(next)}. Làm một phiên tập trung không?`, `Next: ${q(next)}. Want a focus session?`],
    [`Nhắc nhẹ: ${q(next)} đang chờ bạn 🙂`, `Gentle nudge: ${q(next)} is waiting 🙂`],
    [`${q(next)} đang đợi bạn đó. Bắt đầu nhẹ nhàng nhé? 🌿`, `${q(next)} is waiting for you. Ease into it? 🌿`],
    [`Hay mình làm ${q(next)} một chút nhỉ? ⏱`, `How about a little time on ${q(next)}? ⏱`],
    [`Tiếp theo trong danh sách: ${q(next)}. Mình cùng làm nha 🙌`, `Next on the list: ${q(next)}. Let's do it together 🙌`],
    [`Một phiên tập trung cho ${q(next)} không? Mình ngồi canh 🛡️`, `A focus session for ${q(next)}? I'll keep watch 🛡️`],
    [`Bước kế tiếp: ${q(next)}. Chỉ cần mở ra xem thôi cũng được 👀`, `Next step: ${q(next)}. Even just opening it counts 👀`],
    [`Mình nghĩ giờ hợp để làm ${q(next)} đó ✍️`, `Feels like a good moment for ${q(next)} ✍️`],
  ] });
}

const staysPut = (repeating: number) =>
  repeating > 0
    ? L(` (${repeating} việc lặp lại vẫn giữ lịch của nó.)`, ` (${n(repeating, "repeating task")} ${repeating === 1 ? "stays" : "stay"} put.)`)
    : "";

/**
 * `movable` overdue tasks can move: to today, or a fresh start that moves them all to tomorrow. `repeating` ones
 * keep their own schedule; when every overdue task repeats, there's nothing to move and only Show is offered.
 */
export function overdue(mood: Mood, movable: number, repeating = 0, say: Phrase): string {
  if (movable === 0) {
    const tasks = n(repeating, "repeating task");
    return say({ key: "overdue.repeating", options: [
      [
        `${repeating} việc lặp lại đang quá hạn. Chúng tự quay lại theo lịch, nên cứ thong thả 🔁`,
        `${tasks} ${repeating === 1 ? "is" : "are"} overdue. They come back on schedule, so no rush 🔁`,
      ],
      [`Quá hạn: ${repeating} việc lặp lại. Không sao, lịch sẽ mang lượt sau đến 🔁`, `Overdue: ${tasks}. No stress, the schedule will bring the next round 🔁`],
      [`${repeating} việc lặp lại đang trễ một chút. Xong khi nào tiện là được nha 🔁`, `${tasks} running a bit late. Tick off whenever it suits you 🔁`],
    ] });
  }
  const them = movable === 1 ? "it" : "them";
  const tasks = n(movable, "overdue task");
  if (mood === "annoyed" || mood === "angry") {
    return (
      say({ key: "overdue.worried", options: [
        [`${movable} việc quá hạn đang chờ. Mình giúp nhé: dời vào hôm nay, hay sang mai bắt đầu lại? 😟`, `${tasks} waiting. I can help: move ${them} to today, or a fresh start tomorrow? 😟`],
        [`${movable} việc quá hạn làm mình hơi lo. Sang mai bắt đầu lại cho nhẹ nhé? 😟`, `${tasks} have me a bit worried. A fresh start tomorrow, maybe? 😟`],
        [`Mình thấy ${movable} việc quá hạn. Đừng lo: làm hôm nay, hoặc sang mai bắt đầu lại 🤝`, `I see ${tasks}. Don't worry: today, or a fresh start tomorrow 🤝`],
        [`${movable} việc quá hạn đang chờ. Sang mai bắt đầu lại cũng là lựa chọn hay đó 🌱`, `${tasks} waiting. A fresh start tomorrow is a fine choice too 🌱`],
      ] }) + staysPut(repeating)
    );
  }
  return (
    say({ key: "overdue", options: [
      [`Có ${movable} việc quá hạn 😬 Dời vào hôm nay, hay dời hết sang mai để bắt đầu lại?`, `${tasks} 😬 Move ${them} to today, or make a fresh start tomorrow?`],
      [`${movable} việc đã quá hạn. Dời vào hôm nay, hay sang mai bắt đầu lại? 🗓️`, `${tasks}. Today, or a fresh start tomorrow? 🗓️`],
      [`Còn ${movable} việc quá hạn nè. Xử lý hôm nay, hay để mai bắt đầu lại cho nhẹ? 🌤️`, `${tasks} left. Handle ${them} today, or a fresh start tomorrow? 🌤️`],
      [`${movable} việc lỡ hẹn rồi, không sao đâu. Dời vào hôm nay hay sang mai bắt đầu lại? 🙂`, `${tasks}, and that's okay. Today, or a fresh start tomorrow? 🙂`],
      [`Có ${movable} việc quá hạn. Bạn chọn nhé: hôm nay, hoặc dời sang mai để bắt đầu lại 📅`, `${tasks}. Your call: today, or move ${them} for a fresh start tomorrow 📅`],
      [`${movable} việc quá hạn đang đợi. Gom vào hôm nay, hay sang mai bắt đầu lại nhẹ nhàng? 🍃`, `${tasks} waiting. Fold ${them} into today, or a gentle fresh start tomorrow? 🍃`],
    ] }) + staysPut(repeating)
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

export function distraction(mood: Mood, app: string, left: number, next: TodoTask | null, say: Phrase): string {
  if (mood === "angry" && next) {
    return say({ key: "distraction.angry", options: [
      [`Lại ${app} rồi nè 👀 ${q(next)} đang nhớ bạn đó, quay lại với mình nhé? 😤`, `Psst, ${app} again? 👀 ${q(next)} misses you. Come back to it with me? 😤`],
      [`Lại ${app} rồi nè… ${q(next)} vẫn đợi bạn đó 😤`, `${app} again… ${q(next)} is still waiting for you 😤`],
      [`Mình kéo nhẹ tay áo nè: rời ${app}, sang ${q(next)} nhé? 🫳`, `Gentle tug on your sleeve: leave ${app}, over to ${q(next)}? 🫳`],
      [`${app} hấp dẫn thật, nhưng ${q(next)} cần bạn hơn đó 😤`, `${app} is tempting, but ${q(next)} needs you more 😤`],
    ] });
  }
  return say({ key: "distraction", options: [
    [`Ê! Đang ${app} đó hả? 👀 Còn ${left} việc kìa.`, `Hey! On ${app}? 👀 ${n(left, "task")} left.`],
    [`Mình thấy bạn mở ${app} nha 👀 Quay lại làm việc chứ?`, `I see ${app} 👀 Back to work?`],
    [`Ồ, ${app} hả? Danh sách còn ${left} việc đang chờ nè 👀`, `Oh, ${app}? Still ${n(left, "task")} on the list 👀`],
    [`Mình thấy ${app} rồi nha. Nghỉ xíu thôi rồi quay lại nhé? 😉`, `Spotted ${app}. A short break, then back to it? 😉`],
    [`${app} vui ghê ha. Còn ${left} việc, làm xong rồi xem tiếp nhé 🙂`, `${app} is fun, huh. ${n(left, "task")} to go, then it's all yours 🙂`],
    [`Psst… ${app} đó hả? Mình giữ chỗ cho việc tiếp theo nha 🪑`, `Psst… is that ${app}? I'm saving a seat for your next task 🪑`],
    [`Lạc sang ${app} rồi kìa. Quay về với ${left} việc của mình nhé? 🧭`, `Drifted over to ${app}? Let's head back to our ${n(left, "task")} 🧭`],
    [`${app} sẽ vẫn ở đó lát nữa thôi. Việc trước nha? ⏸️`, `${app} will still be there later. Task first? ⏸️`],
  ] });
}

/**
 * What the pet knows when a task is finished (SPEC v0.8 §1). `sound` is the species' voice ("meow", "gâu gâu"), so each
 * pet cheers in its own way; `stuck` and `frog` say the task was on the postponed list or was today's frog; `weekday`
 * as `Date.getDay()` (5 is Friday).
 */
export interface DoneContext {
  completed: number;
  target: number;
  sound: string;
  frog: boolean;
  stuck: boolean;
  hour: number;
  weekday: number;
}

/** The cheer for a finished task: the most specific line that applies, in the order of the spec's table. */
export function done(t: TodoTask, c: DoneContext, say: Phrase): string {
  const { completed, target, sound } = c;
  if (completed === target) {
    return say({ key: "done.target", options: [
      [`Đủ ${target} việc rồi!!! Bạn là nhất 🏆`, `That's ${target}!!! You're the best 🏆`],
      [`Chạm mốc ${target} việc hôm nay rồi! Tự hào về bạn ghê 🏆`, `${target} tasks today, target hit! So proud of you 🏆`],
      [`${sound}! Đủ chỉ tiêu ${target} việc rồi nè 🎊`, `${sound}! That's the ${target}-task goal, done 🎊`],
      [`Mục tiêu ${target} việc: xong! Thêm nữa là thưởng thôi 🌟`, `Goal of ${target}: done! Anything more is a bonus 🌟`],
      [`Đủ ${target} việc! Hôm nay thắng rồi nha 🌈`, `All ${target} done! Today's a win 🌈`],
      [`${target}/${target}! Giờ làm gì cũng là thêm, nhẹ nhàng thôi nhé 🍵`, `${target}/${target}! The rest is extra, take it easy 🍵`],
    ] });
  }
  if (c.stuck) {
    return say({ key: "done.stuck", options: [
      [`Cuối cùng cũng xong ${q(t)} rồi! 🎉`, `${q(t)} is finally done! 🎉`],
      [`${q(t)} chờ lâu lắm rồi, và bạn đã làm được 💪`, `${q(t)} waited a long time, and you did it 💪`],
      ["Việc bạn cứ dời mãi đã xong rồi. Nhẹ hẳn người nhỉ? 🪶", "The one you kept putting off is done. Lighter now? 🪶"],
      [`Hết dời rồi nhé! ${q(t)} xong rồi ✅`, `No more postponing! ${q(t)} is done ✅`],
      ["Mình biết việc này khó bắt đầu lắm. Bạn giỏi thật 🌟", "I know this one was hard to start. Well done 🌟"],
      [`${sound}! ${q(t)} không còn phải chờ nữa 🥳`, `${sound}! ${q(t)} doesn't have to wait anymore 🥳`],
    ] });
  }
  if (c.frog) {
    return say({ key: "done.frog", options: [
      [`Ăn xong con ếch ${q(t)} rồi! 🐸`, `Frog eaten: ${q(t)}! 🐸`],
      ["Việc khó nhất hôm nay xong rồi. Phần còn lại nhẹ hơn nhiều 🐸", "Today's hardest task is done. The rest will feel easier 🐸"],
      [`Đúng con ếch bạn chọn từ trước: ${q(t)} xong! 🎯`, `The frog you picked before you left: ${q(t)}, done! 🎯`],
      [`${sound}! Con ếch hết đường chạy rồi 🐸`, `${sound}! That frog didn't stand a chance 🐸`],
      ["Xong con ếch rồi, cả ngày còn lại nhẹ tênh 🍃", "Frog done, the rest of the day feels light 🍃"],
      [`Bạn giữ lời với chính mình rồi đó: ${q(t)} ✅`, `You kept your word to yourself: ${q(t)} ✅`],
    ] });
  }
  if (completed === 1) {
    return say({ key: "done.first", options: [
      ["Việc đầu tiên hôm nay xong rồi! Khởi động ngon lành 🚀", "First one of the day, done! Great start 🚀"],
      [`Mở hàng rồi nè: ${q(t)} ✅`, `First of the day: ${q(t)} ✅`],
      [`1/${target}! Bước đầu luôn khó nhất, và bạn đã qua 💪`, `1/${target}! The first step is the hardest, and it's done 💪`],
      [`${sound}! Một ngày tốt bắt đầu từ đây 🌞`, `${sound}! A good day starts here 🌞`],
      ["Xong việc đầu tiên, mình bắt đầu thấy hào hứng rồi 😄", "First task done, I'm getting excited 😄"],
      ["Đà có rồi đó! Giữ nhịp nhẹ nhàng thôi nhé 🌱", "Momentum! Let's keep a gentle pace 🌱"],
    ] });
  }
  // Early is from 5:00: a task finished at 2 a.m. isn't "up early".
  if (c.hour >= 5 && c.hour < 9) {
    return say({ key: "done.early", options: [
      [`Mới sáng sớm đã xong ${q(t)}, ghê thật 🌅`, `${q(t)} done this early? Impressive 🌅`],
      ["Dậy sớm làm việc, mình nể bạn ghê ☕", "Up early and getting things done, respect ☕"],
      [`Buổi sáng hiệu quả quá! (${completed}/${target}) 🌄`, `What a productive morning! (${completed}/${target}) 🌄`],
      [`${sound}! Chim dậy sớm có… việc xong sớm 🐦`, `${sound}! The early bird gets… things done 🐦`],
      ["Xong việc trước 9 giờ, cả ngày rộng rãi hẳn 🌤️", "Done before 9, the whole day opens up 🌤️"],
    ] });
  }
  if (c.weekday === 5 && c.hour >= 15) {
    return say({ key: "done.friday", options: [
      ["Chiều thứ Sáu mà vẫn xong việc, bạn đỉnh thật 🎉", "Friday afternoon and still getting it done, wow 🎉"],
      [`Xong ${q(t)}! Cuối tuần đang vẫy tay kìa 👋`, `${q(t)} done! The weekend is waving at you 👋`],
      [`Thứ Sáu khép lại đẹp quá (${completed}/${target}) 🌇`, `A lovely way to wrap up Friday (${completed}/${target}) 🌇`],
      [`${sound}! Một việc nữa trước cuối tuần 🍹`, `${sound}! One more before the weekend 🍹`],
      ["Tuần này bạn làm tốt lắm. Nghỉ ngơi xứng đáng nhé 🌴", "You did great this week. You've earned the rest 🌴"],
    ] });
  }
  return say({ key: "done", options: [
    [`Xong ${q(t)}! 🎉 (${completed}/${target})`, `Done: ${q(t)}! 🎉 (${completed}/${target})`],
    [`Tuyệt vời! ✔︎ ${q(t)}`, `Awesome! ✔︎ ${q(t)}`],
    [`${sound}! Mình vui quá 🥳 (${completed}/${target})`, `${sound}! So happy 🥳 (${completed}/${target})`],
    [`Giỏi quá! Tiếp tục giữ nhịp nhé 💪`, `Nice! Keep the rhythm 💪`],
    [`Xong rồi! ${q(t)} đã gạch khỏi danh sách ✨`, `Done! ${q(t)} is off the list ✨`],
    [`Một việc nữa xong rồi nè (${completed}/${target}) 🌟`, `One more down (${completed}/${target}) 🌟`],
    [`${sound}! ${q(t)} xong rồi, mình mừng ghê 🎉`, `${sound}! ${q(t)} is done, I'm so glad 🎉`],
    [`Gọn gàng ghê! ${q(t)} ✔︎`, `Neat! ${q(t)} ✔︎`],
    [`Bạn làm được rồi đó! (${completed}/${target}) 💪`, `You did it! (${completed}/${target}) 💪`],
    ["Thêm một việc xong, thêm một nụ cười cho mình 😊", "Another one done, another smile for me 😊"],
    [`Xong ${q(t)}. Nhẹ cả người luôn 🍃`, `${q(t)} done. Feels lighter already 🍃`],
    [`${completed} việc rồi đó, đều tay ghê 👏`, `That's ${completed} now, nice and steady 👏`],
    [`Mình ghi công cho bạn: ${q(t)} ✅`, `Credit to you: ${q(t)} ✅`],
    [`${sound} ${sound}! Xong thêm một việc rồi 🥳`, `${sound} ${sound}! Another one done 🥳`],
    [`Yay, ${q(t)} xong! Mình nhảy một điệu nha 💃`, `Yay, ${q(t)} is done! Time for a little dance 💃`],
    ["Từng bước một, bạn đang làm rất tốt 🌱", "Step by step, you're doing great 🌱"],
    [`Tích! ${q(t)} xong rồi. Việc tiếp theo nào? 🎯`, `Tick! ${q(t)} is done. What's next? 🎯`],
    [`Ngon lành! (${completed}/${target}) 😋`, `Smooth! (${completed}/${target}) 😋`],
    ["Bạn vừa làm mình vui cả ngày đó 🥰", "You just made my day 🥰"],
    [`Xong ${q(t)}! Đập tay cái nào ✋`, `${q(t)} done! High five ✋`],
  ] });
}

export const allDone = (say: Phrase) =>
  say({ key: "allDone", options: [
    ["Xong hết việc hôm nay rồi! 🎉 Nghỉ ngơi, hoặc chọn sẵn 3 việc cho mai nhé.", "Everything's done for today! 🎉 Rest, or pick tomorrow's 3 tasks."],
    ["Danh sách hôm nay trống trơn rồi! Phần còn lại của ngày là của bạn 🎉", "Today's list is all clear! The rest of the day is yours 🎉"],
    ["Xong sạch! Mình tự hào về bạn lắm. Nghỉ chút nhé ☕", "All done! I'm so proud of you. Take a little break ☕"],
    ["Hết việc rồi nè! Muốn chọn sẵn việc cho mai thì bấm nút dưới nhé 📝", "Nothing left! Want to line up tomorrow? The button's right below 📝"],
    ["Một ngày trọn vẹn! Hôm nay bạn đã làm rất tốt 🌟", "A full day! You did really well today 🌟"],
    ["Xong hết rồi, giờ mình được chơi với bạn rồi phải không? 🥰", "All done, so now we get to hang out, right? 🥰"],
    ["Không còn việc nào hôm nay. Thư giãn đi, bạn xứng đáng mà 🛋️", "No tasks left today. Relax, you've earned it 🛋️"],
    ["Hôm nay xong rồi! Lần sau mình lại cùng nhau tiếp nhé 🌙", "Today's done! We'll pick it up together next time 🌙"],
  ] });

/**
 * `day` in `review`, `wrappedUp` and `movedToTomorrow` is the next workday's name ("Monday", "Thứ Hai") when it isn't tomorrow, else null: the day
 * the wrap-up really moves things to (the same name as the Wrap up sheet's buttons).
 */
export const review = (completed: number, plannedCount: number, left: number, day: string | null = null, say: Phrase) =>
  left === 0
    ? // Nothing left to move: only the wrap-up is offered.
      completed > 0
        ? say({ key: "review.clear", options: [[`Sắp hết giờ làm. Hôm nay xong ${completed}/${plannedCount} việc 🎉 Mình tổng kết ngày nhé?`, `Almost end of day: ${completed}/${plannedCount} done 🎉 Wrap up the day?`]] })
        : say({ key: "review.empty", options: [["Sắp hết giờ làm. Danh sách hôm nay đã trống. Mình tổng kết ngày nhé?", "Almost end of day, and the list is clear. Wrap up the day?"]] })
    : say({ key: "review", options: [[
        `Sắp hết giờ làm. Hôm nay xong ${completed}/${plannedCount} việc. Còn ${left} việc — tổng kết ngày, hay dời hết sang ${day ?? "mai"}?`,
        `Almost end of day: ${completed}/${plannedCount} done. Wrap up the day, or move the remaining ${left} to ${day ?? "tomorrow"}?`,
      ]] });

/** "Done for today": a good evening, naming the frog that starts the next workday when you picked one. */
export const wrappedUp = (frog: TodoTask | string | null, day: string | null = null) => {
  const name = frog === null ? null : typeof frog === "string" ? `“${shortText(frog, 60)}”` : q(frog);
  return L("Xong ngày rồi 🌙 Nghỉ ngơi nhé.", "All wrapped up 🌙 Rest well.") + (name ? L(` ${day ?? "Mai"} mình bắt đầu với ${name} 🐸`, ` ${day ?? "Tomorrow"} starts with ${name} 🐸`) : "");
};

// The Wrap up sheet's own words that name the day it is for (`day`: the next workday's name, or null for tomorrow).

export const wrapIntro = (day: string | null = null) =>
  L(`Vài cú chạm là xong, không có đúng sai: chỉ là dọn bàn cho ${day ?? "mai"}.`, `A few taps, no right answers: just a tidy desk for ${day ?? "tomorrow"}.`);
export const wrapNoWins = (day: string | null = null) =>
  L(`Hôm nay chưa tick việc nào, và vậy cũng không sao. ${day ?? "Mai"} là một trang mới 🌱`, `Nothing ticked off today, and that's okay. ${day ?? "Tomorrow"} is a fresh page 🌱`);
export const wrapForLabel = (day: string | null = null) => L(`Cho ${day ?? "ngày mai"}`, `For ${day ?? "tomorrow"}`);
export const wrapFrogLabel = (day: string | null = null) => (day ? L(`Làm đầu tiên vào ${day}`, `First on ${day}`) : L("Làm đầu tiên ngày mai", "First tomorrow"));
export const wrapDecideLater = (day: string | null = null) => L(`${day ?? "Mai"} mình chọn sau`, `I'll decide ${day ? `on ${day}` : "tomorrow"}`);
export const wrapFrogDone = (title: string, day: string | null = null) =>
  L(`“${title}” đã xong rồi, giỏi quá! Chọn việc khác hoặc để ${day ?? "mai"} tính.`, `“${title}” is already done, nice! Pick another, or decide ${day ? `on ${day}` : "tomorrow"}.`);
export const wrapNoteLabel = (day: string | null = null) => L(`${day ?? "Mai"} mình bắt đầu từ đâu?`, `Where do I start ${day ? `on ${day}` : "tomorrow"}?`);

export const backToWork = (say: Phrase) => say({ key: "backToWork", options: [["Mình dậy rồi 🌤 Cần gì cứ gọi mình nhé.", "I'm up again 🌤 Call me whenever you need me."]] });

export const welcomeBack = (t: TodoTask, say: Phrase) => say({ key: "welcomeBack", options: [[`Bạn về rồi! 👋 Tiếp tục với ${q(t)} nhé?`, `Welcome back! 👋 Continue with ${q(t)}?`]] });
export const soon = (t: TodoTask, minutes: number, say: Phrase) => say({ key: "soon", options: [[`⏰ ${minutes} phút nữa: ${q(t)}`, `⏰ In ${minutes} min: ${q(t)}`]] });
export const dueNow = (t: TodoTask, say: Phrase) => say({ key: "dueNow", options: [[`⏰ Đến giờ rồi: ${q(t)}!`, `⏰ It's time: ${q(t)}!`]] });

export function focusStart(t: TodoTask | null, minutes: number, say: Phrase): string {
  if (t) return say({ key: "focusStart.task", options: [[`Bắt đầu ${minutes} phút cho ${q(t)}. Mình sẽ ngồi im canh bạn 🤫`, `${n(minutes, "minute")} on ${q(t)}. I'll sit quietly and guard 🤫`]] });
  return say({ key: "focusStart", options: [[`Bắt đầu ${minutes} phút tập trung. Mình ngồi im canh nhé 🤫`, `${n(minutes, "minute")} of focus. I'll stay quiet 🤫`]] });
}

export function focusEnd(t: TodoTask | null, minutes: number, say: Phrase): string {
  if (t) return say({ key: "focusEnd.task", options: [[`Hết ${minutes} phút rồi! ${q(t)} xong chưa?`, `${minutes === 1 ? "Time's up" : `${minutes} minutes up`}! Is ${q(t)} done?`]] });
  return say({ key: "focusEnd", options: [[`Hết ${minutes} phút rồi! Nghỉ chút nhé?`, `${minutes === 1 ? "Time's up" : `${minutes} minutes up`}! Take a break?`]] });
}

export const breakStart = (m: number, say: Phrase) => say({ key: "breakStart", options: [[`Nghỉ ${m} phút nhé ☕ Uống nước, vươn vai đi!`, `${m}-minute break ☕ Water and stretch!`]] });
export const breakEnd = (say: Phrase) => say({ key: "breakEnd", options: [["Hết giờ nghỉ! Quay lại thôi 💪", "Break's over! Let's go 💪"]] });
export const added = (title: string) => L(`Đã thêm “${shortText(title)}” ✔︎`, `Added “${shortText(title)}” ✔︎`);

export function planComplete(target: number, next: TodoTask | null, say: Phrase): string {
  if (next) {
    return say({ key: "planComplete.next", options: [
      [`Đủ ${target} việc cho hôm nay rồi! Bắt đầu với ${q(next)} nhé 🐸`, `${target} tasks planned! Start with ${q(next)} 🐸`],
      [`Kế hoạch ${target} việc xong rồi! Mở đầu bằng ${q(next)} nhé 🐸`, `Your ${target} tasks are set! Open with ${q(next)} 🐸`],
      [`Đủ ${target} việc, kế hoạch gọn gàng. Bắt đầu từ ${q(next)} thôi 🚀`, `${target} tasks, a tidy plan. Let's start with ${q(next)} 🚀`],
      [`Lên kế hoạch xong! Việc đầu tiên: ${q(next)} 🎯`, `Plan done! First up: ${q(next)} 🎯`],
      [`${target} việc đã vào hàng. ${q(next)} đứng đầu nè 🐸`, `${target} tasks lined up. ${q(next)} goes first 🐸`],
      [`Tuyệt, có kế hoạch rồi! Thử bắt tay vào ${q(next)} nhé 💪`, `Great, the plan's ready! Try getting into ${q(next)} 💪`],
    ] });
  }
  return say({ key: "planComplete", options: [
    [`Đủ ${target} việc cho hôm nay rồi! 🐸`, `${target} tasks planned for today! 🐸`],
    [`Kế hoạch ${target} việc cho hôm nay đã sẵn sàng 📋`, `Today's plan of ${target} tasks is ready 📋`],
    [`Đủ ${target} việc rồi! Mình sẵn sàng cùng bạn 💪`, `${target} tasks planned! I'm ready when you are 💪`],
    ["Kế hoạch xong xuôi. Từng việc một thôi nhé 🌱", "Plan all set. One task at a time 🌱"],
  ] });
}

export const lateNight = (say: Phrase) => say({ key: "lateNight", options: [["Khuya rồi đó… đi ngủ để mai làm tốt hơn nha 😴", "It's late… sleep now, crush it tomorrow 😴"]] });
export const error = (e: string) => L(`Mình không kết nối được Todoist 😵 ${e}`, `I can't reach Todoist 😵 ${e}`);
export const connected = () => L("Kết nối Todoist thành công! 🎉", "Connected to Todoist! 🎉");
export const demoHello = () =>
  L("Đang chạy demo với dữ liệu giả 🎭 Bấm vào mình để mở bảng việc nhé!", "Demo mode with sample tasks 🎭 Click me to open the task board!");
export const movedToTomorrow = (count: number, day: string | null = null) =>
  L(`Đã dời ${count} việc sang ${day ?? "mai"}. Nghỉ ngơi nhé 🌙`, `Moved ${n(count, "task")} to ${day ?? "tomorrow"}. Rest well 🌙`);

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
export const meetingOver = (e: CalEvent, next: CalEvent | null = null, breather = 5, say: Phrase) =>
  say({ key: "meetingOver", options: [[`“${shortText(e.title)}” xong rồi. Có gì cần ghi lại không?`, `“${shortText(e.title)}” is over. Anything to capture?`]] }) +
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

/** How far the day runs over, for the strip and the "lighten the day" banner: "~3h45 over". */
export const loadOver = (load: DayLoad) => L(`quá ~${span(load.overBy)}`, `~${span(load.overBy)} over`);

/** The line that goes with it when the board is open to move tasks; `day` is "tomorrow" or the next workday's name. */
export const lightenHint = (day: string) => L(`Dời vài việc sang ${day} cho thoáng nhé.`, `Move a few to ${day} to make room.`);

/** What moving a task bought back, for the note that follows it: a 3 h task inside a meeting frees 2 h, not 3. */
export const freesTime = (minutes: number) => L(` (bớt được ${span(minutes)})`, ` (frees ${span(minutes)})`);

/** The board's note once the day fits again. */
export const dayFits = () => L("Hay lắm, ngày hôm nay đủ chỗ rồi ✓", "Nice, today fits now ✓");

/** The estimate on a task's row while lightening the day: "30'", "1h30", "4h". */
export const estimateLabel = (minutes: number): string => (minutes < 60 ? `${Math.round(minutes)}'` : hoursText(minutes));

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
  // The task, alone on its line; where you were is `resumePlace`, the quiet line under it.
  if (task && r.taskIsNext) parts.push(L(`Việc tiếp theo: ${task}`, `Next up: ${task}`));
  else if (task) parts.push(L(`Bạn đang làm: ${task}`, `You were on: ${task}`));
  else if (r.where) parts.push(L(`Bạn đang ở: ${r.where}`, `You were in: ${r.where}`));
  if (r.note) parts.push(L(`📌 Bước tiếp theo: ${r.note}`, `📌 Next step: ${r.note}`));
  return parts.join("\n");
}

/**
 * Where you were, as the quiet line under the task ("Last in: Google Chrome — Q4 plan"). Empty when there is no task to
 * put it under (the card already says "You were in …") or no place.
 */
export const resumePlace = (r: ResumeSummary): string => (r.task && r.where ? L(`Bạn vừa ở: ${r.where}`, `Last in: ${r.where}`) : "");

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

/** The chip on a task with a plan: "⏱ after “Team sync” (12:00)", the same words as its menu entry (the title cut short). */
export function triggerChip(trigger: StartTrigger, events: CalEvent[]): string {
  switch (trigger.kind) {
    case "afterMeeting": {
      const e = events.find((x) => eventKey(x.id) === trigger.eventId);
      const title = shortText(trigger.title || e?.title || "", 18);
      return L(`⏱ sau họp “${title}”${e ? ` (${timeString(e.end)})` : ""}`, `⏱ after “${title}”${e ? ` (${timeString(e.end)})` : ""}`);
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
      const e = events.find((x) => eventKey(x.id) === trigger.eventId);
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

/** "Another app…": what the typed name matches among the apps seen lately. */
export const appSeen = (name: string) => L(`Khớp với ${shortText(name, 30)}, ứng dụng bạn vừa dùng ✓`, `Matches ${shortText(name, 30)}, which you used lately ✓`);

/** "Another app…": a name that matches nothing seen so far is still kept, and the pet says so. */
export const appUnseen = () => L("Mình chưa thấy ứng dụng nào tên vậy, mình sẽ để ý nhé 👀", "I haven't seen an app called that yet; I'll watch for it 👀");

/** "Try 2 minutes" while a focus session runs: ask before replacing it. */
export const switchToStarter = (minutesIn: number) =>
  minutesIn < 1
    ? L("Bạn vừa bắt đầu một phiên tập trung. Chuyển sang thử 2 phút nhé?", "You just started a focus session. Switch to 2 minutes?")
    : L(`Bạn đã tập trung được ${minutesIn} phút rồi. Chuyển sang thử 2 phút nhé?`, `You're ${n(minutesIn, "minute")} into a focus session. Switch to 2 minutes?`);

export const starterStart = (t: TodoTask | null, minutes = 2, say: Phrase) =>
  t
    ? say({ key: "starterStart.task", options: [[`Chỉ ${minutes} phút thôi cho ${q(t)}. Mở ra xem là được rồi 🌱`, `Just ${n(minutes, "minute")} on ${q(t)}. Open it and see, that's all 🌱`]] })
    : say({ key: "starterStart", options: [[`Chỉ ${minutes} phút thôi. Mở ra xem là được rồi 🌱`, `Just ${n(minutes, "minute")}. Open it and see, that's all 🌱`]] });

export const starterEnd = (t: TodoTask | null, say: Phrase) =>
  t
    ? say({ key: "starterEnd.task", options: [[`Xong 2 phút rồi, bạn đã bắt đầu ${q(t)}! 🌱 Làm tiếp một phiên đầy đủ, hay dừng ở đây nhé?`, `Two minutes done, you've started ${q(t)}! 🌱 Keep going with a full session, or stop here for now?`]] })
    : say({ key: "starterEnd", options: [["Xong 2 phút rồi, bạn đã bắt đầu! 🌱 Làm tiếp một phiên đầy đủ, hay dừng ở đây nhé?", "Two minutes done, you've started! 🌱 Keep going with a full session, or stop here for now?"]] });

export const starterGone = (t: TodoTask | null, say: Phrase) =>
  t
    ? say({ key: "starterGone", options: [[`Xong 2 phút rồi, và ${q(t)} cũng đã xong! 🌱`, `Two minutes done, and ${q(t)} is already off your list! 🌱`]] })
    : starterEnd(null, say);

export const starterEnough = (say: Phrase) => say({ key: "starterEnough", options: [["Hay lắm, bắt đầu là phần khó nhất 🌱 Lần sau sẽ dễ hơn.", "Nice, starting is the hardest part 🌱 It gets easier next time."]] });

// Postponed tasks

export function stuck(s: StuckTask, mood: Mood, say: Phrase): string {
  if (mood === "angry") {
    return say({ key: "stuck.angry", options: [[`${q(s.task)} chờ ${s.days} ngày rồi. Để mình giúp chia thành từng bước nhỏ nhé? ✂️`, `${q(s.task)} has waited ${s.days} days. Want help splitting it into tiny steps? ✂️`]] });
  }
  return say({ key: "stuck", options: [
    [
      `${q(s.task)} bị dời ${s.days} ngày rồi 🤔 Chắc nó to quá? Chia thành bước nhỏ cho dễ bắt đầu nhé.`,
      `${q(s.task)} has been pushed for ${s.days} days 🤔 Too big? Let's split it into small steps.`,
    ],
    [
      `Mình thấy ${q(s.task)} cứ bị dời mãi (${s.days} ngày). Bước nhỏ nhất để bắt đầu là gì?`,
      `${q(s.task)} keeps getting postponed (${s.days} days). What's the tiniest first step?`,
    ],
  ] });
}

export const splitDone = (count: number, first: string, say: Phrase) =>
  say({ key: "splitDone", options: [[
    `Đã chia thành ${count} bước ✂️ Bắt đầu với “${shortText(first)}” nhé — chỉ 15–30 phút thôi!`,
    `Split into ${count} steps ✂️ Start with “${shortText(first)}” — just 15–30 minutes!`,
  ]] });

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

export const golden = (say: Phrase) =>
  say({ key: "golden", options: [
    ["✨ HIẾM! Bánh vàng cho bạn! ✨", "✨ RARE! A golden treat! ✨"],
    ["✨ Bánh vàng hiếm xuất hiện! Hôm nay may mắn ghê", "✨ A rare golden treat appeared! Lucky day"],
    ["✨ Ôi, bánh vàng! Mình chia bạn một nửa nha", "✨ Ooh, a golden treat! Half of it is yours"],
    ["✨ Trúng bánh vàng hiếm, thêm XP thưởng nè", "✨ Rare golden treat, bonus XP!"],
  ] });
export const combo = (n: number, say: Phrase) =>
  say({ key: "combo", options: [
    [`🔥 Combo ×${n}! Đang cháy quá!`, `🔥 Combo ×${n}! You're on fire!`],
    [`🔥 ×${n} liền tay!`, `🔥 ×${n} in a row!`],
    [`🔥 Combo ×${n}! Đà đang lên rồi`, `🔥 Combo ×${n}! You've got momentum`],
    [`🔥 ${n} việc liên tiếp, nóng tay quá!`, `🔥 ${n} in a row, you're on a roll!`],
    [`🔥 Combo ×${n}, mình theo không kịp luôn!`, `🔥 Combo ×${n}, I can barely keep up!`],
  ] });
export const cleaned = (dirtLeft: number, say: Phrase) => (dirtLeft === 0 ? say({ key: "cleaned.clean", options: [["🛁 Mình sạch bong rồi!", "🛁 Squeaky clean again!"]] }) : say({ key: "cleaned", options: [["🛁 Sạch hơn chút rồi…", "🛁 A bit cleaner…"]] }));
export const levelUp = (s: StageIndex, say: Phrase) =>
  say({ key: "levelUp", options: [
    [`⬆️ Mình lớn lên thành ${stageName(s)}!`, `⬆️ I grew up: ${stageName(s)}!`],
    [`⬆️ Mình vừa lớn thêm một chút. Giai đoạn mới: ${stageName(s)}!`, `⬆️ I just grew a little. New stage: ${stageName(s)}!`],
    [`⬆️ Nhìn mình nè: ${stageName(s)} rồi! Cảm ơn bạn đã chăm mình`, `⬆️ Look at me now: ${stageName(s)}! Thanks for looking after me`],
    [`⬆️ Lên cấp! Giờ mình là ${stageName(s)}`, `⬆️ Level up! Stage: ${stageName(s)}`],
  ] });
export const unlocked = (items: Accessory[]) => L("🎁 Mở khoá: ", "🎁 Unlocked: ") + items.map((a) => `${accessoryEmoji(a)} ${accessoryName(a)}`).join(", ");
export const speciesUnlocked = (emoji: string, name: string) =>
  L(`🥚 Bạn mới mở khoá một bạn mới: ${emoji} ${name}! Đổi trong Cài đặt nhé.`, `🥚 New friend unlocked: ${emoji} ${name}! Switch in Settings.`);
export const streak = (n: number, say: Phrase) =>
  say({ key: "streak", options: [
    [`🔥 Chuỗi ${n} ngày — giữ nhé!`, `🔥 ${n}-day streak — keep it going!`],
    [`🔥 ${n} ngày liền rồi, mình nhớ từng ngày đó!`, `🔥 ${n} days in a row, and I remember every one!`],
    [`🔥 Chuỗi ${n} ngày, đều đặn ghê`, `🔥 A ${n}-day streak, so steady`],
    [`🔥 Ngày thứ ${n} liên tiếp. Hôm nay mình đi tiếp nhé?`, `🔥 Day ${n} in a row. Shall we keep going today?`],
    [`🔥 ${n} ngày không đứt quãng, bạn kiên trì thật`, `🔥 ${n} days without a break, you really stick with it`],
    [`🔥 ${n} ngày rồi! Mình vui vì được đồng hành cùng bạn`, `🔥 ${n} days! I'm glad to be on this with you`],
  ] });
export const dirty = (dirt: number, say: Phrase) =>
  say({ key: "dirty", options: [[`🛁 Mình hơi lấm lem (lỡ ${dirt} ngày). Xong 1 việc là mình được tắm nè!`, `🛁 I'm a bit grubby (${n(dirt, "missed day")}). Finish one task and I get a bath!`]] });

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

export function hungry(satiety: number, next: TodoTask | null, say: Phrase): string {
  const n = next ? L(` Xong ${q(next)} cho mình ăn với 🥺`, ` Finish ${q(next)} and feed me 🥺`) : "";
  const line =
    satiety < 10
      ? say({ key: "hungry.starving", options: [
          ["Đói lả rồi… 😵‍💫", "Starving… 😵‍💫"],
          ["Mình đói muốn xỉu luôn… 😵", "So hungry I could faint… 😵"],
          ["Bụng rỗng tuếch rồi… 🫠", "Totally empty tummy… 🫠"],
        ] })
      : say({ key: "hungry", options: [
          ["Bụng mình réo rồi nè 🍙", "My tummy is rumbling 🍙"],
          ["Mình hơi đói rồi 🍪", "I'm getting a bit hungry 🍪"],
          ["Bụng mình kêu ọc ọc nè 🥨", "My tummy is grumbling 🥨"],
          ["Có ai cho mình ăn không ta? 🍜", "Anyone got a snack for me? 🍜"],
          ["Mình thèm một bữa ngon quá 🍱", "I'm craving something tasty 🍱"],
          ["Đói đói rồi, nhưng mình vẫn ổn 🙂", "A little peckish, but I'm okay 🙂"],
        ] });
  return line + n;
}

export const grumble = (next: TodoTask, say: Phrase) =>
  say({ key: "grumble", options: [
    [`Haizzz… 😮‍💨 ${q(next)} vẫn đang chờ bạn đó.`, `Sigh… 😮‍💨 ${q(next)} is still waiting for you.`],
    [`*giậm chân* Mình giữ ${q(next)} cho bạn lâu lắm rồi nè 😤`, `*taps foot* I've been saving ${q(next)} for you 😤`],
    [`Hừm… ${q(next)} vẫn nằm đó chờ bạn kìa 🥱`, `Hmm… ${q(next)} is still sitting there waiting 🥱`],
    [`*phụng phịu* Mình nhớ ${q(next)} quá đi 😗`, `*pouts* I really miss ${q(next)} 😗`],
    [`Mình ngồi cạnh ${q(next)} chờ bạn nãy giờ nè 🪑`, `I've been sitting next to ${q(next)}, waiting for you 🪑`],
    [`*thở dài* Một chút ${q(next)} thôi cũng được mà 😮‍💨`, `*sighs* Even a little bit of ${q(next)} would do 😮‍💨`],
  ] });

export const parade = (next: TodoTask, say: Phrase) =>
  say({ key: "parade", options: [
    [`Mình sẽ diễu hành tới khi bạn làm ${q(next)} thì thôi! 📢`, `I'm marching until you do ${q(next)}! 📢`],
    [`Một, hai! Một, hai! Biển ghi: ${q(next)} 🪧`, `Left, right! Left, right! The sign says: ${q(next)} 🪧`],
    [`Đoàn diễu hành vì ${q(next)} xin đi qua nè 🥁`, `The parade for ${q(next)} is coming through 🥁`],
    [`Mình cầm biển ${q(next)} đi vòng vòng tới khi bạn bắt đầu 🎺`, `I'll carry the ${q(next)} sign around until you start 🎺`],
    [`Tùng tùng! Hôm nay là ngày của ${q(next)} 🎉`, `Ba-dum! Today is ${q(next)} day 🎉`],
    [`Mình đi đều bước cổ vũ ${q(next)} đây 📣`, `Marching in step to cheer on ${q(next)} 📣`],
  ] });

export function block(app: string, next: TodoTask | null, say: Phrase): string {
  const n = next ? L(` Mình cùng làm ${q(next)} nhé?`, ` Shall we do ${q(next)} together?`) : "";
  return (
    say({ key: "block", options: [
      [`(╯°□°)╯︵ ┻━┻ ${app} lâu quá rồi đó!`, `(╯°□°)╯︵ ┻━┻ That's a lot of ${app}!`],
      [`*nhảy ra che màn hình* ${app} nghỉ chút nha 🙈`, `*jumps in front of the screen* Time out for ${app} 🙈`],
      [`Ối, mình đứng chắn ${app} rồi. Xin lỗi nha 😇`, `Oops, I'm standing in front of ${app}. Sorry 😇`],
      [`Tạm dừng ${app} một chút, mình ở đây nè 🛑`, `Pausing ${app} for a bit, I'm right here 🛑`],
      [`(｀・ω・´) Mình giữ ${app} giúp bạn một lát`, `(｀・ω・´) I'll hold ${app} for you for a bit`],
    ] }) + n
  );
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
export const voiceGrumble = (say: Phrase) =>
  say({ key: "voice.grumble", options: [
    ["Mình bắt đầu một việc nhỏ nhé?", "Shall we start something small?"],
    ["Mình ở đây khi bạn sẵn sàng.", "I'm here when you're ready."],
    ["Mình làm cùng nhau một chút nhé?", "Want to do a little together?"],
    ["Một bước nhỏ thôi cũng được mà.", "Even one small step is fine."],
  ] });
export const voiceAngry = (t: TodoTask, say: Phrase) => {
  const title = shortText(taskTitle(t), 30);
  return say({ key: "voice.angry", options: [
    [`Mình làm ${title} nhé? Mình ở đây với bạn.`, `How about ${title}? I'll keep you company.`],
    [`Thử ${title} vài phút nhé? Mình ngồi đây với bạn.`, `Try ${title} for a few minutes? I'm right here.`],
    [`Mình cùng bắt đầu ${title} nha.`, `Let's start ${title} together.`],
    [`Bước nhỏ đầu tiên của ${title} là gì nhỉ?`, `What's the first small step of ${title}?`],
  ] });
};
export const voiceBlock = (app: string, say: Phrase) =>
  say({ key: "voice.block", options: [
    [`Để ${app} lát nữa nhé?`, `Shall we leave ${app} for later?`],
    [`${app} chờ được mà, mình làm việc trước nhé?`, `${app} can wait, shall we do a task first?`],
    [`Mình tạm cất ${app} đi một lát nha.`, `Let's put ${app} away for a little while.`],
  ] });
export const voiceHungry = (say: Phrase) => say({ key: "voice.hungry", options: [["Mình đói quá.", "I'm so hungry."]] });
export const voiceCheer = (say: Phrase) =>
  say({ key: "voice.cheer", options: [
    ["Tuyệt vời!", "Awesome!"],
    ["Hoan hô!", "Hooray!"],
    ["Giỏi quá!", "Well done!"],
    ["Hay lắm luôn!", "That's amazing!"],
    ["Tuyệt quá đi!", "So great!"],
    ["Đỉnh thật!", "Brilliant!"],
  ] });
export const voiceSummary = (minutes: number) => L(`Hôm nay có ${minutes} phút xao nhãng. Mai mình làm lại nhé.`, `${minutes} minutes of detours today. Tomorrow is a fresh start.`);

/** Short, evidence-based productivity tips the pet drops occasionally. */
export const tip = (say: Phrase) =>
  say({ key: "tip", options: [
    ["Mẹo: làm việc khó nhất trước (Eat the frog 🐸) — năng lượng đầu ngày là tốt nhất.", "Tip: do the hardest task first (eat the frog 🐸) — early energy is your best."],
    ["Mẹo: việc to quá? Chia thành bước 15–30 phút rồi thêm vào Todoist.", "Tip: task too big? Split it into 15–30 minute steps in Todoist."],
    ["Mẹo: gắn giờ cụ thể (“14h làm X”) giúp bạn dễ bắt tay vào việc hơn hẳn.", "Tip: give tasks a concrete time (“2pm: do X”) — it makes starting much easier."],
    ["Mẹo: cuối ngày dành 5 phút chọn sẵn 3 việc cho mai — sáng mai vào việc ngay.", "Tip: spend 5 minutes at day's end picking tomorrow's 3 tasks."],
    ["Mẹo: mỗi lần bị gián đoạn cần khá lâu để tập trung lại — tắt thông báo khi tập trung nhé.", "Tip: every interruption costs a long refocus — mute notifications while focusing."],
    ["Mẹo: uống nước & đứng dậy vươn vai sau mỗi phiên tập trung 💧", "Tip: drink water and stretch after each focus session 💧"],
  ] });

// v0.5 Game: trips and the Monday fresh start (chest and craft lines live with their rules in chests.ts and craft.ts).

export const tripOffer = (back: Date, say: Phrase) =>
  say({ key: "tripOffer", options: [[
    `Xong hết kế hoạch hôm nay rồi! 🎉 Cho mình đi chơi một chuyến nhé? ${timeString(back)} mình về 🎒`,
    `Today's plan is all done! 🎉 Can I go on a little trip? Back at ${timeString(back)} 🎒`,
  ]] });
export const tripGo = () => L("Đi đi!", "Go!");
export const tripStay = () => L("Ở lại nha", "Stay");
export const tripStayed = (say: Phrase) => say({ key: "tripStayed", options: [["Vậy mình ở lại chơi với bạn 🥰", "Then I'll stay right here with you 🥰"]] });

export const tripStart = (place: string, back: Date, say: Phrase) =>
  say({ key: "tripStart", options: [[
    `Mình đi ${place} đây! 🎒 ${timeString(back)} mình về. Cần mình thì bấm vào tấm biển nhé.`,
    `Off to ${place}! 🎒 Back at ${timeString(back)}. Click my sign if you need me.`,
  ]] });

export function tripBack(r: TripReturn, say: Phrase): string {
  const place = placeName(r.place);
  if (r.souvenir) {
    const gift = `${emojiOf(r.souvenir)} ${itemName(r.souvenir)}`;
    return say({ key: "tripBack.souvenir", options: [[
      `Mình về rồi nè! 🥰 Quà từ ${place} cho bạn: ${gift}. Có bưu thiếp trong nhật ký đó 💌`,
      `I'm back from ${place}! 🥰 Here's your souvenir: ${gift}. There's a postcard waiting in the diary 💌`,
    ]] });
  }
  if (r.xp > 0) {
    return say({ key: "tripBack.stories", options: [[
      `Mình đi ${place} về rồi! 🥰 Quà ở đó mình có rồi, nên mang về toàn chuyện vui: +${r.xp} XP 💌`,
      `I'm back from ${place}! 🥰 I already had its souvenir, so I brought back stories instead: +${r.xp} XP 💌`,
    ]] });
  }
  return say({ key: "tripBack.early", options: [["Mình về sớm nè! Chưa đi được xa, nhưng mà nhớ bạn quá 🥰", "Back already! I didn't get far, but I missed you 🥰"]] });
}

export const postcard = (place: string, text: string) => L(`💌 Bưu thiếp từ ${place}: ${text}`, `💌 A postcard from ${place}: ${text}`);

/** The first greeting of a week: a fresh start, with last week's wins when there were any. Never a telling-off. */
export function newWeek(last: WeekStats | null, say: Phrase): string {
  const recap = weekRecap(last);
  return recap
    ? say({ key: "newWeek.recap", options: [[`🌱 Tuần mới, khởi đầu mới! Tuần trước: ${recap}.`, `🌱 New week, fresh start! Last week: ${recap}.`]] })
    : say({ key: "newWeek", options: [["🌱 Tuần mới, khởi đầu mới! Tuần này mới tinh, mình cùng bắt đầu nhẹ nhàng nhé.", "🌱 New week, fresh start! A brand-new week; let's ease in together."]] });
}

// v0.7 "Always fresh": the update notice, its buttons, the install and the first start of a new version. Warm and brief:
// news, never a nag, and a failure is "we", not "you did something wrong".

export const updateAvailable = (version: string) => L(`Mình có bản mới ${version} nè ✨`, `There's a new version of me: ${version} ✨`);

/** "What's new" with the release's first highlights, for the quieter second line of a bubble; null when there are none. */
export function whatsNew(points: readonly string[]): string | null {
  return points.length === 0 ? null : `${L("Có gì mới:", "What's new:")}\n${points.map((p) => `• ${p}`).join("\n")}`;
}

export const updateNow = () => L("Cập nhật ngay", "Update now");
export const downloadPage = () => L("Trang tải về", "Download page");
export const updateLater = () => L("Để sau", "Later");
export const updateFailed = () => L("Mình không tự cập nhật được. Bạn tải bản mới ở trang tải về nhé?", "I couldn't update myself. Grab it from the download page?");
export const updatePageFailed = () => L("Mình chưa mở được trang tải về. Bạn thử lại sau một lát nhé 🌿", "I couldn't open the download page just now. Please try again in a little while 🌿");
/** The tray's "Check for updates…" is taking a moment: so it never looks dead. */
export const lookingForUpdate = () => L("Để mình xem nào… 🔎", "Let me look… 🔎");
export const upToDate = () => L("Bạn đang dùng bản mới nhất 👍", "You're on the newest version 👍");
export const updateCheckFailed = () => L("Mình chưa kiểm tra được bản mới lúc này. Bạn thử lại sau một lát nhé 🌿", "I couldn't check for updates just now. Please try again in a little while 🌿");
/** The first start of a newer version: said once, with the saved highlights as the second line. */
export const updated = (version: string) => L(`Mình vừa lên bản ${version}! ✨`, `Now I'm on ${version}! ✨`);
