// Meeting bookends (SPEC v0.4 §2): open tasks that look related to a meeting, by shared words in the titles.
import { taskTitle, type TodoTask } from "./models";

/** Shortest word that counts as a shared word. */
export const MIN_WORD_LENGTH = 4;

/**
 * Words too common in meeting or task titles to mean anything, already normalized (lower case, no diacritics).
 * Words under 4 letters never count, so short ones ("họp", "với", "về", "cho") are listed only for clarity.
 */
const STOP_WORDS = new Set([
  // English
  "meeting", "meetings", "call", "calls", "sync", "weekly", "daily", "monthly", "team", "teams", "review", "with",
  "about", "from", "into", "this", "that", "your", "ours", "their", "what", "when", "will", "have", "need", "some",
  "more", "today", "tomorrow", "week", "morning", "afternoon", "evening", "quick", "catch", "chat", "online", "zoom",
  "google", "update", "updates", "discussion",
  // Vietnamese (normalized)
  "hop", "cuoc", "buoi", "nhom", "tuan", "ngay", "hang", "voi", "ve", "cho", "cua", "cac", "nhung", "trong", "viec",
  "cong", "sang", "chieu", "trao", "nhanh",
]);

/**
 * "Họp nhóm: Đề xuất ngân sách" → ["hop", "nhom", "de", "xuat", "ngan", "sach"].
 * Lower case, diacritics removed (NFD, combining marks stripped, đ → d), split on anything that isn't a letter or digit.
 */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** The distinct words of `text` that can link two titles: 4+ characters, at least one letter, not a stop word. */
export function significantWords(text: string): Set<string> {
  return new Set(normalizeWords(text).filter((w) => w.length >= MIN_WORD_LENGTH && /\p{L}/u.test(w) && !STOP_WORDS.has(w)));
}

/**
 * Up to `limit` open tasks sharing a significant word with the meeting title: most shared words first,
 * then in the order given (so pass them ranked).
 */
export function relatedTasks(meetingTitle: string, tasks: TodoTask[], limit = 2): TodoTask[] {
  if (limit <= 0) return [];
  const wanted = significantWords(meetingTitle);
  if (wanted.size === 0) return [];
  return tasks
    .map((task, index) => {
      let shared = 0;
      for (const w of significantWords(taskTitle(task))) if (wanted.has(w)) shared++;
      return { task, index, shared };
    })
    .filter((m) => m.shared > 0 && !m.task.checked)
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .slice(0, limit)
    .map((m) => m.task);
}
