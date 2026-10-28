// How the pet avoids breaking your concentration (CalmRules in Calm.swift). Based on interruption research:
// - Interrupting at a natural pause lowers frustration and resumption time (Adamczyk & Bailey 2004; Iqbal & Bailey 2008).
// - Fewer, batched notifications improve attention and well-being (Fitz et al. 2019).
// - Motion at the edge of vision grabs attention, so the pet keeps still while you type (Bartram et al. 2003).
// - Calm technology: stay in the periphery, move to the center only when it matters (Weiser & Brown 1996).

/** Typing within this many seconds means you're in the middle of something. */
export const TYPING_WINDOW = 8;
/** Steady typing for this long counts as "being in the zone"; non-urgent bubbles wait. */
export const FLOW_MINUTES = 10;
/** Two minutes without a keystroke ends the zone. */
export const FLOW_ENDS_AFTER = 120;

/** You're actively working: typing recently, at the computer, and not in a distracting app or site. */
export function engaged(secondsSinceKey: number, idleSeconds: number, distracted: boolean): boolean {
  return secondsSinceKey < 45 && idleSeconds < 60 && !distracted;
}

/** When engaged work started (null when you're not engaged), with hysteresis so short pauses don't reset it. */
export function engagedSince(current: Date | null, isEngaged: boolean, secondsSinceKey: number, now: Date): Date | null {
  if (isEngaged) return current ?? now;
  return secondsSinceKey > FLOW_ENDS_AFTER ? null : current;
}

export function inFlow(since: Date | null, now: Date, minutes = FLOW_MINUTES): boolean {
  return since !== null && now.getTime() - since.getTime() >= minutes * 60_000;
}

/** A natural pause: you stopped typing for a moment, or just switched apps. */
export function atBreakpoint(secondsSinceKey: number, secondsSinceAppSwitch: number): boolean {
  return secondsSinceKey >= TYPING_WINDOW || secondsSinceAppSwitch < 10;
}

/** Unsolicited bubbles are spaced out: at most one per `minGap` minutes. */
export function withinBudget(lastBubbleAt: Date, now: Date, minGap: number): boolean {
  return now.getTime() - lastBubbleAt.getTime() >= minGap * 60_000;
}
