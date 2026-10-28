// UI language. Everything the user sees goes through L(vi, en), like the macOS app.
import type { Lang } from "./types";

let current: Lang = "en";

/** "vi" for any Vietnamese locale ("vi", "vi-VN"), otherwise "en". */
export function langFromLocale(locale: string | null | undefined): Lang {
  return (locale ?? "").toLowerCase().startsWith("vi") ? "vi" : "en";
}

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Bilingual string: L("Xin chào", "Hello"). */
export function L(vi: string, en: string): string {
  return current === "vi" ? vi : en;
}

/**
 * "1 task" / "3 tasks" in English; Vietnamese has no plural ("1 việc", "3 việc").
 * `one`/`other` are English nouns (no number); `vi` the Vietnamese noun.
 */
export function plural(n: number, vi: string, one: string, other: string): string {
  return L(`${n} ${vi}`, `${n} ${n === 1 ? one : other}`);
}

/** Picks one random bilingual variant from [[vi, en], …]. */
export function pick(pairs: readonly (readonly [string, string])[], random: () => number = Math.random): string {
  if (pairs.length === 0) return "";
  const i = Math.min(Math.floor(random() * pairs.length), pairs.length - 1);
  return L(pairs[i][0], pairs[i][1]);
}
