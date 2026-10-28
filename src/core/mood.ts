// Turns "how is my day going" into a 0–100 happiness score and a mood (MoodEngine.swift). Pure.
import { L } from "./l10n";

const n = (count: number, noun: string, nouns = `${noun}s`) => `${count} ${count === 1 ? noun : nouns}`;
import type { Mood } from "./types";

export function moodEmoji(m: Mood): string {
  return { happy: "😊", normal: "🙂", annoyed: "😒", angry: "😤", sleeping: "😴", focus: "🎯", celebrating: "🥳" }[m];
}

export function moodLabel(m: Mood): string {
  switch (m) {
    case "happy":
      return L("đang vui", "happy");
    case "normal":
      return L("bình thường", "chill");
    case "annoyed":
      return L("đang nhăn nhó", "annoyed");
    case "angry":
      return L("nổi cáu rồi", "grumpy");
    case "sleeping":
      return L("đang ngủ", "sleeping");
    case "focus":
      return L("đang canh bạn tập trung", "guarding your focus");
    case "celebrating":
      return L("đang ăn mừng", "celebrating");
  }
}

export interface MoodInputs {
  hasToken: boolean;
  workday: boolean;
  inWorkHours: boolean;
  night: boolean;
  /** < 0 means the planning deadline hasn't passed yet. */
  hoursAfterPlanDeadline: number;
  target: number;
  planned: number;
  completed: number;
  remaining: number;
  overdue: number;
  late: number;
  minutesSinceProgress: number;
  minutesSinceCelebration: number;
  distractedMinutes: number;
  distractionApp: string;
  idleMinutes: number;
  focusing: boolean;
  celebratingNow: boolean;
  inMeeting: boolean;
  stuck: number;
  satiety: number;
  dirt: number;
}

export const defaultMoodInputs = (): MoodInputs => ({
  hasToken: true,
  workday: true,
  inWorkHours: true,
  night: false,
  hoursAfterPlanDeadline: -1,
  target: 3,
  planned: 0,
  completed: 0,
  remaining: 0,
  overdue: 0,
  late: 0,
  minutesSinceProgress: 0,
  minutesSinceCelebration: Infinity,
  distractedMinutes: 0,
  distractionApp: "",
  idleMinutes: 0,
  focusing: false,
  celebratingNow: false,
  inMeeting: false,
  stuck: 0,
  satiety: 70,
  dirt: 0,
});

export interface MoodReason {
  delta: number;
  text: string;
}

export interface MoodResult {
  score: number;
  mood: Mood;
  /** Biggest effect first. */
  reasons: MoodReason[];
}

export function evaluateMood(i: MoodInputs): MoodResult {
  const reasons: MoodReason[] = [];
  let s = 60;
  const add = (d: number, text: string) => {
    if (Math.abs(d) < 1) return;
    s += d;
    reasons.push({ delta: Math.round(d), text });
  };

  if (i.completed > 0) {
    add(Math.min(i.completed, 5) * 8, L(`đã xong ${i.completed} việc hôm nay`, `${n(i.completed, "task")} done today`));
  }
  if (i.completed > 0 && i.remaining === 0 && i.overdue === 0 && i.planned >= i.target) {
    add(30, L("xong hết kế hoạch hôm nay", "today's plan is complete"));
  }
  if (i.minutesSinceCelebration < 30) {
    add(15 * (1 - i.minutesSinceCelebration / 30), L("vừa hoàn thành một việc", "just finished something"));
  }
  if (i.overdue > 0) {
    add(-Math.min(i.overdue, 5) * 7, L(`${i.overdue} việc quá hạn`, n(i.overdue, "overdue task")));
  }
  if (i.late > 0) {
    add(-Math.min(i.late, 3) * 4, L(`${i.late} việc đã trễ giờ`, `${n(i.late, "task")} past ${i.late === 1 ? "its" : "their"} time`));
  }
  if (i.satiety < 30) {
    add(-(30 - i.satiety) / 2, L(`đang đói (no ${Math.trunc(i.satiety)}%)`, `hungry (${Math.trunc(i.satiety)}% full)`));
  }
  if (i.dirt > 0) {
    add(-i.dirt * 5, L(`bẩn vì ${i.dirt} ngày lười`, `dirty after ${n(i.dirt, "lazy day")}`));
  }
  if (i.stuck > 0) {
    add(-Math.min(i.stuck, 3) * 3, L(`${i.stuck} việc bị dời mãi`, `${n(i.stuck, "task")} ${i.stuck === 1 ? "keeps" : "keep"} getting postponed`));
  }
  if (i.workday && i.inWorkHours && !i.inMeeting) {
    if (i.hoursAfterPlanDeadline >= 0 && i.planned < i.target) {
      const gap = i.target - i.planned;
      add(
        -(12 + gap * 6 + Math.min(20, i.hoursAfterPlanDeadline * 8)),
        L(`mới lên kế hoạch ${i.planned}/${i.target} việc`, `only ${i.planned}/${i.target} tasks planned`),
      );
    }
    if (i.remaining + i.overdue > 0 && i.minutesSinceProgress > 90) {
      const hours = (i.minutesSinceProgress / 60).toFixed(1);
      add(
        -Math.min(30, ((i.minutesSinceProgress - 90) / 60) * 10),
        L(`${hours} giờ chưa có tiến triển`, `no progress for ${hours}h`),
      );
    }
    if (i.distractedMinutes >= 2) {
      add(
        -Math.min(35, 15 + i.distractedMinutes * 2),
        L(`đang xao nhãng với ${i.distractionApp}`, `distracted by ${i.distractionApp}`),
      );
    }
  }
  if (i.focusing) add(10, L("đang tập trung", "focusing"));

  // Outside work hours the pet relaxes; it only remembers the bad stuff a little.
  if (!(i.workday && i.inWorkHours) && s < 55) s = 55;
  s = Math.min(100, Math.max(0, s));

  let mood: Mood;
  if (i.celebratingNow) mood = "celebrating";
  else if (!i.hasToken) mood = "normal";
  else if (i.focusing) mood = "focus";
  else if (i.night || i.idleMinutes > 10) mood = "sleeping";
  else if (s >= 75) mood = "happy";
  else if (s >= 50) mood = "normal";
  else if (s >= 30) mood = "annoyed";
  else mood = "angry";

  return { score: s, mood, reasons: reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}
