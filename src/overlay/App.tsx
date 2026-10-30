import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Backend } from "../backend/types";
import type { Brain, BrainState, CelebrationEvent } from "../core/brain";
import { currentEvent } from "../core/calendar";
import { sameNameTags } from "../core/friends";
import { getLang, L } from "../core/l10n";
import { stageOf } from "../core/life";
import type { TodoTask } from "../core/models";
import type { DecorId, Mood } from "../core/types";
import { defaultPose, renderPet, speciesInfo } from "../pets";
import { Board } from "./Board";
import { BubbleView } from "./Bubble";
import { DemoDesktop, DemoPanel } from "./Demo";
import { Effects } from "./Effects";
import { HomeCorner, homeCornerWidth, homeItems, TripSign } from "./Home";
import { FrameLoop, frameInterval } from "./cadence";
import { INTERACT, PetLife, type InteractOutput } from "./interact";
import { PetMotion } from "./motion";
import { Visitor } from "./Visitor";
import { placeBoard, type BoardPlacement, type Rect } from "./placement";
import { playChime, speak } from "./sound";

/** SVG design space: feet touch the ground at y = 150 of 160. */
const FEET = 150 / 160;
const BASE_SIZE = 150;
/** The pet's head starts about 12% down its SVG box. */
const HEAD = 0.12;
/** Seconds a mood change takes to cross-fade. */
const BLEND_SEC = 0.8;
/** A cursor this close to the pet's middle (× its size) wakes the frame loop, so its eyes follow even on battery saver. */
const WAKE_NEAR = 1.5;
/** How often click-through is re-checked under a still cursor (a bubble appearing, the board closing). */
const HIT_TEST_MS = 100;
/** A key pressed this recently (s) counts as typing: no fidgets, yawns or clumsy moments (as the brain's calm). */
const TYPING_SEC = 20;

export interface BoardRequest {
  /** Bumped every time the board is asked to open, so the same request can repeat. */
  seq: number;
  focusAdd: boolean;
  split: TodoTask | null;
  /** Opened with Enter/Space on the pet: the board takes keyboard focus. */
  fromKeyboard: boolean;
  /** Text for the add field ("Team sync: "), when something else (the after-meeting bubble) opened the board for it. */
  prefill: string | null;
  /** Opens on the Wrap up sheet (the end-of-day bubble, the board's Wrap up button, the demo). */
  wrapUp: boolean;
  /** Scrolls to this task and gives it the focus (the meeting bubble's "Open"). */
  focusTaskId: string | null;
  /** Opens ready to move tasks off an overbooked day: estimates on the rows, a one-tap "tomorrow" on each. */
  lighten: boolean;
  /** Opens on the Friends sheet (a click on a visiting friend's pet). */
  friends?: boolean;
}

/** What opens the board besides the add field and a prefill (see `BrainEffects.openBoard`). */
interface BoardOptions {
  split?: TodoTask | null;
  fromKeyboard?: boolean;
  prefill?: string | null;
  wrapUp?: boolean;
  focusTaskId?: string;
  lighten?: boolean;
  friends?: boolean;
}

const isHidden = (s: BrainState) => s.hiddenUntil !== null || (s.fullscreen && s.prefs.hideInFullscreen);
/** The focus timer or the "in the zone" headphones sit above the pet's head. */
const hasBadge = (s: BrainState) => !!s.focus || s.flow;

export function App({ brain, backend, demo, fakeDesktop }: { brain: Brain; backend: Backend; demo: boolean; fakeDesktop: boolean }) {
  const s = useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [board, setBoard] = useState<BoardRequest | null>(null);
  const [placement, setPlacement] = useState<BoardPlacement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<PetMotion | null>(null);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const hovered = useRef(false);
  const dragging = useRef<{ startX: number; startY: number; moved: boolean; id: number } | null>(null);
  const clickThrough = useRef(true);
  const boardOpen = useRef(false);
  const anchor = useRef({ x: 0, top: 0, feetY: 0, size: BASE_SIZE });
  const tripRef = useRef<HTMLButtonElement>(null);
  /** Acts, petting, drowsiness and head tilt (pure; fed by the frame loop and the pointer handlers). */
  const lifeRef = useRef<PetLife | null>(null);
  lifeRef.current ??= new PetLife();
  /**
   * The latest system sample (idle and key timers), with when it arrived (s, performance clock), and the longest idle
   * seen since the frame loop last looked: an absence that went by while the loop slept still earns its hello.
   */
  const sampleRef = useRef({ idle: 0, key: 999, at: 0, peak: 0 });
  const homeWidth = useRef(0);
  const loopRef = useRef<FrameLoop | null>(null);
  /** Something may show differently now: the frame loop draws again for a moment, even if it was asleep. */
  const wake = useCallback(() => loopRef.current?.wake(performance.now()), []);
  /** The mood on screen (the frame loop keeps it; a ponder holds the old one for half a beat). */
  const shownMoodRef = useRef<Mood>(brain.getSnapshot().mood);
  /** Each celebration's ponder, decided once (celebrations already under way at start get none). */
  const ponderRef = useRef<{ id: number | null; shift: number }>({ id: brain.getSnapshot().celebration?.id ?? null, shift: 0 });

  /**
   * How long a celebration is held back for the pet's ponder: 0.4 s when the ponder plays, 0 when it doesn't (held,
   * away, already celebrating, or a celebration seen late). Decided once per celebration, by whichever of the frame
   * loop and the confetti asks first, so the pose and the confetti always agree.
   */
  const ponderFor = useCallback((cel: CelebrationEvent): number => {
    const p = ponderRef.current;
    if (p.id === cel.id) return p.shift;
    const fresh = shownMoodRef.current !== "celebrating" && brain.clockNow() - cel.start < 1500;
    const shift = fresh ? lifeRef.current!.celebrate(performance.now() / 1000) : 0;
    ponderRef.current = { id: cel.id, shift };
    return shift;
  }, [brain]);
  /** The brain's clock for the confetti (the demo's can be moved). */
  const clockNow = useCallback(() => brain.clockNow(), [brain]);

  const species = speciesInfo(s.prefs.species);
  brain.speciesSound = species.sound[getLang()];
  const lang = getLang();

  // Screen readers and hyphenation follow the app language, not the static <html lang="en">.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const applyClickThrough = useCallback(
    (through: boolean) => {
      if (clickThrough.current === through) return;
      clickThrough.current = through;
      backend.system.setClickThrough(through).catch(() => {
        // Not applied: forget it, so the next hit test tries again.
        if (clickThrough.current === through) clickThrough.current = !through;
      });
    },
    [backend],
  );

  /** Where the board goes for the current screen size, pet position and demo panel. */
  const computePlacement = useCallback((): BoardPlacement | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const st = brain.getSnapshot();
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const size = BASE_SIZE * st.prefs.petScale;
    const margin = size * 0.4;
    const x = Math.min(Math.max(anchor.current.x || W / 2, margin), W - margin);
    const boxTop = H - size * FEET;
    const headTop = hasBadge(st) ? boxTop - 8 : boxTop + size * HEAD;
    const origin = stage.getBoundingClientRect();
    const avoid: Rect[] = [...document.querySelectorAll<HTMLElement>(".demo-panel")].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height };
    });
    return placeBoard({ stageWidth: W, stageHeight: H, petX: x, petSize: size, headTop, avoid });
  }, [brain]);

  const openBoard = useCallback(
    (focusAdd: boolean, o: BoardOptions = {}) => {
      setPlacement(computePlacement());
      setBoard((b) => ({
        seq: (b?.seq ?? 0) + 1,
        focusAdd,
        split: o.split ?? null,
        fromKeyboard: o.fromKeyboard ?? false,
        prefill: o.prefill ?? null,
        wrapUp: o.wrapUp ?? false,
        focusTaskId: o.focusTaskId ?? null,
        lighten: o.lighten ?? false,
        friends: o.friends ?? false,
      }));
      void backend.system.focusOverlay().catch(() => undefined);
      applyClickThrough(false);
    },
    [backend, computePlacement, applyClickThrough],
  );
  const closeBoard = useCallback(() => {
    setBoard(null);
    // Hand the keyboard back to whatever the user was doing.
    backend.system.releaseOverlayFocus().catch(() => {});
  }, [backend]);

  useEffect(() => {
    boardOpen.current = board !== null;
    wake();
  }, [board, wake]);

  // Anything the brain changes may show (a bubble, a mood, the pet coming back into view): draw again.
  useEffect(() => {
    const unsub = brain.subscribe(wake);
    window.addEventListener("resize", wake);
    return () => {
      unsub();
      window.removeEventListener("resize", wake);
    };
  }, [brain, wake]);

  // A stunt needs the stage (and its bubble with "Spare me"): the board makes way.
  const stunt = s.antic?.kind.type === "block" || s.antic?.kind.type === "parade";
  useEffect(() => {
    if (stunt) closeBoard();
  }, [stunt, closeBoard]);

  // Sounds, speech and view requests from the brain.
  useEffect(() => {
    brain.effects = {
      chime: playChime,
      speak,
      openBoard: (focusAdd, prefill, opts) => openBoard(focusAdd, { prefill: prefill ?? null, ...opts }),
      openSplit: (task) => openBoard(false, { split: task }),
      openWrapUp: () => openBoard(false, { wrapUp: true }),
    };
  }, [brain, openBoard]);

  // Click-through: the overlay only takes the mouse while the cursor is over the pet, a bubble or the board.
  // Re-checked on a timer too, because things appear and vanish under a cursor that is not moving.
  useEffect(() => {
    const hitTest = () => {
      const c = cursor.current;
      if (!c) return;
      const el = document.elementFromPoint(c.x, c.y);
      hovered.current = !!el?.closest(".pet");
      const hit = dragging.current !== null || !!el?.closest("[data-hit]");
      applyClickThrough(!hit);
    };
    const unsub = backend.system.onCursor((c) => {
      cursor.current = c;
      lifeRef.current?.pointer(c.x, c.y, performance.now() / 1000);
      hitTest();
      const a = anchor.current;
      const st = brain.getSnapshot();
      if (!isHidden(st) && st.trip === null && Math.hypot(c.x - a.x, c.y - (a.feetY - a.size / 2)) < a.size * WAKE_NEAR) wake();
    });
    const id = setInterval(hitTest, HIT_TEST_MS);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [backend, brain, applyClickThrough, wake]);

  // Closing the board: Escape (unless a popover took it), a click outside, or the overlay losing focus.
  useEffect(() => {
    if (!board) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const hadFocus = !!(document.activeElement && document.activeElement.closest(".board"));
      closeBoard();
      if (hadFocus) petRef.current?.focus({ preventScroll: true });
    };
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Element && !e.target.closest("[data-hit]")) closeBoard();
    };
    const onBlur = () => !fakeDesktop && closeBoard();
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [board, closeBoard, fakeDesktop]);

  // Keep the board on screen and next to the pet when the screen changes size (or the badge appears).
  const boardIsOpen = board !== null;
  const badge = hasBadge(s);
  useEffect(() => {
    if (!boardIsOpen) return;
    let raf = 0;
    const replace = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPlacement(computePlacement()));
    };
    replace();
    window.addEventListener("resize", replace);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", replace);
    };
  }, [boardIsOpen, badge, s.prefs.petScale, computePlacement]);

  // Idle and typing timers for the pet's little acts (the brain keeps its own copy).
  useEffect(
    () =>
      backend.system.onSample((x) => {
        const prev = sampleRef.current;
        sampleRef.current = { idle: x.idleSeconds, key: x.secondsSinceKey, at: performance.now() / 1000, peak: Math.max(prev.peak, x.idleSeconds) };
        // Back after a long time away: the pet says hello, even if its loop was asleep (battery saver).
        if (prev.idle >= INTERACT.awayAfter && x.idleSeconds < INTERACT.awayAfter) wake();
      }),
    [backend, wake],
  );

  // A bubble that went stale while the board hid it (or while nobody looked) never shows up late.
  useEffect(() => {
    if (s.bubble) brain.pruneBubble();
  }, [brain, s.bubble, board]);

  // Tray tooltip ticks every second during focus.
  useEffect(() => {
    if (!s.focus) return;
    const id = setInterval(() => brain.updateTray(), 1000);
    return () => clearInterval(id);
  }, [brain, s.focus]);

  // The frame loop: motion, pose and rendering at ~30 fps (~10 fps while asleep or calm). It sleeps while nobody can
  // see the pet (screen locked or off, hidden, away on a trip) and, on battery saver, whenever the pet stands still;
  // `wake()` brings it back (see cadence.ts).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const startX = stage.clientWidth * (0.55 + Math.random() * 0.3);
    motionRef.current = new PetMotion(startX, stage.clientHeight);
    let last = performance.now();
    let t = 0;
    let prevMood: Mood = brain.getSnapshot().mood;
    let shownMood: Mood = prevMood;
    shownMoodRef.current = shownMood;
    let blendStart = -10;
    let lastSvg = "";
    let ground = stage.clientHeight;
    const life = lifeRef.current!;
    let fx: InteractOutput | null = null;
    let meeting = false;
    let meetingAt = -10;
    let wokeForHello = false;

    /** Draws a frame when one is due; false puts the loop to sleep until the next wake-up. */
    const frame = (now: number, woken: boolean): boolean => {
      const st = brain.getSnapshot();
      const motion = motionRef.current!;
      const away = st.trip !== null;
      const hiddenNow = isHidden(st) || away;
      const antic = st.antic?.kind.type ?? null;
      const interval = frameInterval({
        unseen: st.screenOff,
        hidden: hiddenNow,
        saver: st.batterySaver,
        // An act or petting plays at full rate even while you type (they are short, and you asked for them).
        lively: motion.s.held || antic !== null || (fx !== null && (fx.acting || fx.petting > 0)),
        // Still on its way somewhere: walking, falling, celebrating, changing mood or with a hello to give.
        moving: motion.s.walking || motion.s.y < ground - 0.5 || st.mood === "celebrating" || t - blendStart < BLEND_SEC || !!fx?.greeting,
        calm: st.mood === "sleeping" || st.calmMotion,
        woken,
      });
      if (interval === null) return false;
      const dt = (now - last) / 1000;
      if (dt < interval) return true;
      last = now;
      // After a sleep the pet picks up where it stood, instead of jumping to a new breath and sway.
      t += Math.min(dt, 0.25);
      const nowS = now / 1000;

      // Read layout first, then write: no forced reflow in the middle of the frame.
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      ground = H;
      const bubble = bubbleRef.current;
      const bw = bubble?.offsetWidth ?? 0;
      const bh = bubble?.offsetHeight ?? 0;
      const sign = signRef.current;
      const sw = sign?.offsetWidth ?? 0;
      const sh = sign?.offsetHeight ?? 0;
      const tripSign = tripRef.current;
      const tw = tripSign?.offsetWidth ?? 0;
      const th = tripSign?.offsetHeight ?? 0;

      const size = BASE_SIZE * st.prefs.petScale;
      const info = speciesInfo(st.prefs.species);
      const focusing = !!st.focus && !st.focus.isBreak;
      // Away on a trip: the pet stays where its sign stands.
      if (!away) {
        motion.step(dt, {
          width: W,
          height: H,
          size,
          mood: st.mood,
          gait: info.gait,
          // On battery saver the pet stays put instead of wandering off.
          calm: st.calmMotion || st.batterySaver,
          // The pet waits beside its open board instead of wandering under it.
          hovered: hovered.current || boardOpen.current,
          cursor: cursor.current,
          chase: st.prefs.chaseWhenAngry,
          focusing,
          antic,
          // (and a friend's pet is visiting: the two stand together)
          acting: (!!fx && (fx.acting || fx.curious)) || st.visitor !== null,
          reserveLeft: homeWidth.current,
        });
      }
      if (antic === "parade" && motion.s.paradeDone) brain.endAntic();
      if (antic === "grumble" && st.antic && brain.clockNow() - st.antic.start > 6000) brain.endAntic();
      const m = motion.s;

      // The pet's little acts: what the user is doing (sampled ~1/s, extrapolated) and where the cursor is.
      if (nowS - meetingAt >= 1) {
        meetingAt = nowS;
        meeting = currentEvent(st.events, new Date(brain.clockNow())) !== null;
      }
      const smp = sampleRef.current;
      const since = smp.at > 0 ? Math.max(0, nowS - smp.at) : 0;
      const cel = st.celebration;
      /** Seconds the current celebration is held back for the ponder. */
      const celShift = cel ? ponderFor(cel) : 0;
      fx = life.step({
        now: nowS,
        pet: { x: m.x, y: m.y, size },
        cursor: cursor.current,
        held: m.held,
        grounded: m.y >= H - 0.5,
        walking: m.walking,
        idleSec: smp.at > 0 ? Math.max(smp.idle + since, smp.peak) : 0,
        typing: smp.at > 0 && smp.key + since < TYPING_SEC,
        focus: focusing,
        meeting,
        mood: st.mood,
        // (and on battery saver: no fidgets, yawns or clumsy moments of its own, only answers to you)
        busy: antic !== null || st.batterySaver || (st.mood === "angry" && st.prefs.chaseWhenAngry && cursor.current !== null && !focusing),
        away: hiddenNow,
      });
      smp.peak = 0;
      // Back after a long time away while the pet is asleep: wake it now rather than at the brain's next tick.
      if (fx.greeting && st.mood === "sleeping" && !wokeForHello) {
        wokeForHello = true;
        brain.recompute();
      }
      if (!fx.greeting) wokeForHello = false;

      // Half a beat of pondering before a celebration: the old mood stays on screen for it.
      const moodNow = fx.pondering && st.mood === "celebrating" ? shownMood : st.mood;
      if (moodNow !== shownMood) {
        prevMood = shownMood;
        shownMood = moodNow;
        shownMoodRef.current = moodNow;
        blendStart = t;
      }
      const boxTop = m.y - size * FEET * m.scale;
      const visualTop = boxTop + size * HEAD * m.scale;
      // Bubbles go above the focus badge when there is one, and above the trip sign while away.
      const headTop = away && tripSign ? m.y - th : hasBadge(st) ? boxTop - 8 * m.scale : visualTop;
      anchor.current = { x: m.x, top: visualTop, feetY: m.y, size };

      if (!hiddenNow) {
        const celT = cel ? (brain.clockNow() - cel.start) / 1000 - celShift : 99;
        const look = fx.lookAtUser ? null : cursor.current;
        const headY = m.y - size * 0.55;
        const pose = defaultPose({
          mood: shownMood,
          t,
          facing: m.facing,
          walking: m.walking,
          walkPhase: m.walkPhase,
          lookX: look ? Math.max(-1, Math.min(1, (look.x - m.x) / 320)) : 0,
          lookY: look ? Math.max(-1, Math.min(1, (look.y - headY) / 320)) : 0,
          // An act has its own face; the hover smile would cover a pout or a shake.
          hovered: hovered.current && !m.held && !fx.act,
          held: m.held,
          prevMood,
          blend: Math.min(1, (t - blendStart) / BLEND_SEC),
          calm: st.calmMotion,
          stage: stageOf(st.life.xp),
          hungry: st.life.satiety < 30,
          dirt: st.life.dirt,
          wearing: st.life.wearing,
          celebration: cel && celT < 6 ? cel.kind : "jump",
          golden: !!cel && cel.golden && celT < 6,
          food: cel && celT < 1.2 ? cel.food : null,
          foodT: celT,
          act: fx.act,
          petting: fx.petting,
          drowsy: fx.drowsy,
          headTilt: fx.headTilt,
          craft: st.craft,
        });
        const svg = renderPet(st.prefs.species, pose, { size, idPrefix: "pet" });
        if (svg !== lastSvg && svgRef.current) {
          svgRef.current.innerHTML = svg;
          lastSvg = svg;
        }
      }
      const pet = petRef.current;
      if (pet) {
        pet.style.width = `${size}px`;
        pet.style.height = `${size}px`;
        pet.style.transform = `translate(${m.x - size / 2}px, ${m.y - size * FEET}px) scale(${m.scale})`;
        pet.style.transformOrigin = `50% ${FEET * 100}%`;
      }
      if (bubble) {
        const bx = Math.min(Math.max(m.x - bw / 2, 8), W - bw - 8);
        const by = Math.max(8, headTop - bh - 14);
        bubble.style.left = `${bx}px`;
        bubble.style.top = `${by}px`;
        bubble.style.setProperty("--tail-x", `${Math.min(Math.max(m.x - bx, 18), bw - 18)}px`);
      }
      if (sign) {
        const sx = m.facing > 0 ? m.x - size * 0.45 - sw : m.x + size * 0.45;
        sign.style.left = `${sx}px`;
        sign.style.top = `${m.y - sh - 26}px`;
      }
      if (tripSign) {
        // Planted where the pet stood (CSS hangs it above this point), kept on screen.
        tripSign.style.left = `${Math.min(Math.max(m.x, tw / 2 + 8), W - tw / 2 - 8)}px`;
        tripSign.style.top = `${m.y}px`;
      }
      const flip = flipRef.current;
      if (flip) {
        // The speech bubble sits above the pet, so the shout goes under its feet: both stay readable.
        flip.style.left = `${m.x}px`;
        flip.style.top = `${Math.min(m.y + 24, H - 48)}px`;
      }
      return true;
    };
    const loop = new FrameLoop(frame);
    loopRef.current = loop;
    loop.wake(performance.now());
    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [brain, ponderFor]);

  /** Ends a press on the pet. A press that did not move is a click (pointer up only, never a cancel). */
  const endPress = useCallback(
    (asClick: boolean) => {
      wake();
      const d = dragging.current;
      dragging.current = null;
      petRef.current?.classList.remove("dragging");
      if (!d) return;
      if (d.moved) {
        motionRef.current?.release();
        lifeRef.current?.drop(performance.now() / 1000);
        // Dropped somewhere else with the board open: follow the pet once it has landed.
        if (boardOpen.current) setTimeout(() => setPlacement(computePlacement()), 450);
        return;
      }
      if (!asClick) return;
      // The first click toggles the board at once. Its quick follow-ups (a double click, the third click in a row
      // and on) are pokes: the pet giggles or gets dizzy and the board stays as the first click left it.
      const poke = lifeRef.current?.click(performance.now() / 1000) ?? false;
      brain.petClicked();
      if (poke) return;
      if (boardOpen.current) closeBoard();
      else openBoard(false);
    },
    [brain, closeBoard, openBoard, computePlacement, wake],
  );

  // A drag must not outlive the window losing focus (Alt+Tab mid-drag).
  useEffect(() => {
    const onBlur = () => endPress(false);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [endPress]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, startY: e.clientY, moved: false, id: e.pointerId };
    wake();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    wake();
    cursor.current = { x: e.clientX, y: e.clientY };
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5) {
      d.moved = true;
      motionRef.current?.grab(d.startX, d.startY);
      lifeRef.current?.grab(performance.now() / 1000);
      petRef.current?.classList.add("dragging");
    }
    if (d.moved) motionRef.current?.drag(e.clientX, e.clientY);
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openBoard(false);
  };
  const onPetKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    brain.petClicked();
    if (boardOpen.current) closeBoard();
    else openBoard(false, { fromKeyboard: true });
  };

  const hidden = isHidden(s);
  const away = s.trip !== null;
  // While the board is open, the urgent ones that ask or announce something show inside it (a banner); the rest wait.
  const showBubble = s.bubble && !board && (!hidden || s.bubble.urgent) && !brain.bubbleStale(s.bubble);
  // The home corner: up to 3 decorations (same list, same array, until it really changes).
  const homeKey = homeItems(s.prefs.showHome, s.prefs.homeItems, s.life.decor).join(",");
  const home = useMemo(() => (homeKey ? (homeKey.split(",") as DecorId[]) : []), [homeKey]);
  useEffect(() => {
    homeWidth.current = homeCornerWidth(home.length);
  }, [home]);

  return (
    <>
      {fakeDesktop && <DemoDesktop brain={brain} />}
      <div className="stage" ref={stageRef} style={fakeDesktop ? { bottom: 48 } : undefined}>
        {!hidden && s.antic?.kind.type === "parade" && (
          <div className="sign" ref={signRef} aria-hidden>
            <small>{L("Làm ngay việc này", "Do this now")}</small>
            {s.antic.kind.title}
          </div>
        )}
        {!hidden && s.antic?.kind.type === "block" && (
          <div className="table-flip" ref={flipRef} aria-hidden>
            (╯°□°)╯︵ ┻━┻
          </div>
        )}
        {!hidden && <HomeCorner items={home} />}
        {!hidden && s.trip && <TripSign ref={tripRef} trip={s.trip} brain={brain} />}
        {!hidden && !away && s.visitor && !board && (
          <Visitor
            key={s.visitor.id}
            brain={brain}
            visit={s.visitor}
            anchor={anchor}
            hideLabel={!!showBubble}
            petName={s.prefs.petName}
            tag={sameNameTags(s.friends)[s.visitor.friend.pk] ?? null}
            onOpen={() => {
              brain.endVisit();
              openBoard(false, { friends: true });
            }}
          />
        )}
        <div
          className={`pet${hidden || away ? " hidden" : ""}`}
          ref={petRef}
          data-hit=""
          role="button"
          tabIndex={hidden || away ? -1 : 0}
          aria-label={`${s.prefs.petName}: ${L("mở bảng việc", "open the task board")}`}
          aria-haspopup="dialog"
          aria-expanded={board !== null}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => endPress(true)}
          onPointerCancel={() => endPress(false)}
          onLostPointerCapture={() => endPress(false)}
          onKeyDown={onPetKey}
          onContextMenu={onContextMenu}
          onPointerEnter={() => (hovered.current = true)}
          onPointerLeave={() => (hovered.current = false)}
        >
          <div ref={svgRef} />
          <PetBadge brain={brain} />
        </div>
        <Effects celebration={s.celebration} reveal={s.reveal} anchor={anchor} delayFor={ponderFor} now={clockNow} />
        {showBubble && s.bubble && <BubbleView key={s.bubble.id} ref={bubbleRef} bubble={s.bubble} brain={brain} />}
        {board && placement && <Board key="board" brain={brain} backend={backend} request={board} placement={placement} onClose={closeBoard} />}
        {demo && <DemoPanel brain={brain} backend={backend} />}
      </div>
    </>
  );
}

/** 🍅 countdown during focus, 🎧 while in the zone. */
function PetBadge({ brain }: { brain: Brain }) {
  const s = useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!s.focus) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.focus]);
  if (s.focus) {
    const left = Math.max(0, Math.round((s.focus.end - brain.clockNow()) / 1000));
    return (
      <span className="pet-badge" aria-hidden>
        {s.focus.isBreak ? "☕" : "🍅"} {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
      </span>
    );
  }
  if (s.flow) return <span className="pet-badge flow" aria-hidden>🎧</span>;
  return null;
}
