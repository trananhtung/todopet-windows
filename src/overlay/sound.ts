// Soft chimes synthesized with WebAudio (no sound files to ship), and spoken lines with Windows voices.
import type { Chime } from "../core/brain";
import type { Lang } from "../core/types";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, gain: number, type: OscillatorType = "sine", slideTo?: number): void {
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(a.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export function playChime(c: Chime): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (c) {
    case "chatter":
      tone(a, 620, t, 0.09, 0.05, "sine", 900);
      break;
    case "important":
      tone(a, 1046, t, 0.35, 0.07, "sine");
      tone(a, 1568, t + 0.12, 0.45, 0.06, "sine");
      break;
    case "celebrate":
      [523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.08, 0.3, 0.06, "triangle"));
      break;
    case "big":
      [523, 659, 784, 1046].forEach((f, i) => tone(a, f, t + i * 0.09, 0.45, 0.07, "triangle"));
      tone(a, 2093, t + 0.4, 0.6, 0.025, "sine");
      break;
    case "grumble":
      tone(a, 130, t, 0.32, 0.06, "sawtooth", 90);
      break;
  }
}

/** Says a short line with an installed Windows voice for the language (offline), slightly higher-pitched. */
export function speak(text: string, lang: Lang): void {
  if (typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  // Only voices installed on this PC: an online voice would send the text to a server.
  const voice = voices.find((v) => v.localService && v.lang.toLowerCase().startsWith(lang)) ?? null;
  if (!voice) return;
  u.voice = voice;
  u.lang = lang === "vi" ? "vi-VN" : "en-US";
  u.pitch = 1.35;
  u.rate = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
