import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Backend } from "../backend/types";
import type { Brain, BrainState } from "../core/brain";
import { getLang, L } from "../core/l10n";
import { stageOf } from "../core/life";
import type { TodoTask } from "../core/models";
import type { Mood } from "../core/types";
import { defaultPose, renderPet, speciesInfo } from "../pets";
import { Board } from "./Board";
import { BubbleView } from "./Bubble";
import { DemoDesktop, DemoPanel } from "./Demo";
import { Effects } from "./Effects";
import { PetMotion } from "./motion";
import { placeBoard, type BoardPlacement, type Rect } from "./placement";
import { playChime, speak } from "./sound";

/** SVG design space: feet touch the ground at y = 150 of 160. */
const FEET = 150 / 160;
const BASE_SIZE = 150;
/** The pet's head starts about 12% down its SVG box. */
const HEAD = 0.12;
/** Frame budgets: ~30 fps normally, ~10 fps while asleep, calm or hidden. */
const FAST = 1 / 32;
const SLOW = 1 / 10;
/** How often click-through is re-checked under a still cursor (a bubble appearing, the board closing). */
const HIT_TEST_MS = 100;

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
}

/** What opens the board besides the add field and a prefill (see `BrainEffects.openBoard`). */
interface BoardOptions {
  split?: TodoTask | null;
  fromKeyboard?: boolean;
  prefill?: string | null;
  wrapUp?: boolean;
  focusTaskId?: string;
  lighten?: boolean;
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
  }, [board]);

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
      hitTest();
    });
    const id = setInterval(hitTest, HIT_TEST_MS);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [backend, applyClickThrough]);

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

  // The frame loop: motion, pose and rendering at ~30 fps (~10 fps while asleep, calm or hidden).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const startX = stage.clientWidth * (0.55 + Math.random() * 0.3);
    motionRef.current = new PetMotion(startX, stage.clientHeight);
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let prevMood: Mood = brain.getSnapshot().mood;
    let shownMood: Mood = prevMood;
    let blendStart = -10;
    let lastSvg = "";

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const st = brain.getSnapshot();
      const motion = motionRef.current!;
      const hiddenNow = isHidden(st);
      const antic = st.antic?.kind.type ?? null;
      const slow = !motion.s.held && antic === null && (hiddenNow || st.mood === "sleeping" || st.calmMotion);
      const dt = (now - last) / 1000;
      if (dt < (slow ? SLOW : FAST)) return;
      last = now;
      t += dt;

      // Read layout first, then write: no forced reflow in the middle of the frame.
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const bubble = bubbleRef.current;
      const bw = bubble?.offsetWidth ?? 0;
      const bh = bubble?.offsetHeight ?? 0;
      const sign = signRef.current;
      const sw = sign?.offsetWidth ?? 0;
      const sh = sign?.offsetHeight ?? 0;

      const size = BASE_SIZE * st.prefs.petScale;
      const info = speciesInfo(st.prefs.species);
      motion.step(dt, {
        width: W,
        height: H,
        size,
        mood: st.mood,
        gait: info.gait,
        calm: st.calmMotion,
        // The pet waits beside its open board instead of wandering under it.
        hovered: hovered.current || boardOpen.current,
        cursor: cursor.current,
        chase: st.prefs.chaseWhenAngry,
        focusing: !!st.focus && !st.focus.isBreak,
        antic,
      });
      if (antic === "parade" && motion.s.paradeDone) brain.endAntic();
      if (antic === "grumble" && st.antic && Date.now() - st.antic.start > 6000) brain.endAntic();

      if (st.mood !== shownMood) {
        prevMood = shownMood;
        shownMood = st.mood;
        blendStart = t;
      }
      const m = motion.s;
      const boxTop = m.y - size * FEET * m.scale;
      const visualTop = boxTop + size * HEAD * m.scale;
      // Bubbles go above the focus badge when there is one.
      const headTop = hasBadge(st) ? boxTop - 8 * m.scale : visualTop;
      anchor.current = { x: m.x, top: visualTop, feetY: m.y, size };

      if (!hiddenNow) {
        const cel = st.celebration;
        const celT = cel ? (Date.now() - cel.start) / 1000 : 99;
        const look = cursor.current;
        const headY = m.y - size * 0.55;
        const pose = defaultPose({
          mood: st.mood,
          t,
          facing: m.facing,
          walking: m.walking,
          walkPhase: m.walkPhase,
          lookX: look ? Math.max(-1, Math.min(1, (look.x - m.x) / 320)) : 0,
          lookY: look ? Math.max(-1, Math.min(1, (look.y - headY) / 320)) : 0,
          hovered: hovered.current && !m.held,
          held: m.held,
          prevMood,
          blend: Math.min(1, (t - blendStart) / 0.8),
          calm: st.calmMotion,
          stage: stageOf(st.life.xp),
          hungry: st.life.satiety < 30,
          dirt: st.life.dirt,
          wearing: st.life.wearing,
          celebration: cel && celT < 6 ? cel.kind : "jump",
          golden: !!cel && cel.golden && celT < 6,
          food: cel && celT < 1.2 ? cel.food : null,
          foodT: celT,
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
      const flip = flipRef.current;
      if (flip) {
        // The speech bubble sits above the pet, so the shout goes under its feet: both stay readable.
        flip.style.left = `${m.x}px`;
        flip.style.top = `${Math.min(m.y + 24, H - 48)}px`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [brain]);

  /** Ends a press on the pet. A press that did not move is a click (pointer up only, never a cancel). */
  const endPress = useCallback(
    (asClick: boolean) => {
      const d = dragging.current;
      dragging.current = null;
      petRef.current?.classList.remove("dragging");
      if (!d) return;
      if (d.moved) {
        motionRef.current?.release();
        // Dropped somewhere else with the board open: follow the pet once it has landed.
        if (boardOpen.current) setTimeout(() => setPlacement(computePlacement()), 450);
        return;
      }
      if (!asClick) return;
      brain.petClicked();
      if (boardOpen.current) closeBoard();
      else openBoard(false);
    },
    [brain, closeBoard, openBoard, computePlacement],
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
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    cursor.current = { x: e.clientX, y: e.clientY };
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5) {
      d.moved = true;
      motionRef.current?.grab(d.startX, d.startY);
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
  // While the board is open, the urgent ones that ask or announce something show inside it (a banner); the rest wait.
  const showBubble = s.bubble && !board && (!hidden || s.bubble.urgent) && !brain.bubbleStale(s.bubble);

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
        <div
          className={`pet${hidden ? " hidden" : ""}`}
          ref={petRef}
          data-hit=""
          role="button"
          tabIndex={hidden ? -1 : 0}
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
        <Effects celebration={s.celebration} anchor={anchor} />
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
