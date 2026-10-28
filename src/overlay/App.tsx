import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Backend } from "../backend/types";
import type { Brain } from "../core/brain";
import { getLang } from "../core/l10n";
import { stageOf } from "../core/life";
import type { TodoTask } from "../core/models";
import type { Mood } from "../core/types";
import { defaultPose, renderPet, speciesInfo } from "../pets";
import { Board } from "./Board";
import { BubbleView } from "./Bubble";
import { DemoDesktop, DemoPanel } from "./Demo";
import { Effects } from "./Effects";
import { PetMotion } from "./motion";
import { playChime, speak } from "./sound";

/** SVG design space: feet touch the ground at y = 150 of 160. */
const FEET = 150 / 160;
const BASE_SIZE = 150;

export interface BoardRequest {
  /** Bumped every time the board is asked to open, so the same request can repeat. */
  seq: number;
  focusAdd: boolean;
  split: TodoTask | null;
}

export function App({ brain, backend, demo, fakeDesktop }: { brain: Brain; backend: Backend; demo: boolean; fakeDesktop: boolean }) {
  const s = useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [board, setBoard] = useState<BoardRequest | null>(null);
  const [boardAnchor, setBoardAnchor] = useState<{ x: number; top: number } | null>(null);
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
  const anchor = useRef({ x: 0, top: 0, feetY: 0, size: BASE_SIZE });

  const species = speciesInfo(s.prefs.species);
  brain.speciesSound = species.sound[getLang()];

  const openBoard = useCallback(
    (focusAdd: boolean, split: TodoTask | null = null) => {
      const a = anchor.current;
      setBoardAnchor({ x: a.x, top: a.top });
      setBoard((b) => ({ seq: (b?.seq ?? 0) + 1, focusAdd, split }));
      void backend.system.focusOverlay();
      void backend.system.setClickThrough(false);
      clickThrough.current = false;
    },
    [backend],
  );
  const closeBoard = useCallback(() => setBoard(null), []);

  // Sounds, speech and view requests from the brain.
  useEffect(() => {
    brain.effects = {
      chime: playChime,
      speak,
      openBoard: (focusAdd) => openBoard(focusAdd),
      openSplit: (task) => openBoard(false, task),
    };
  }, [brain, openBoard]);

  // Click-through: the overlay only takes the mouse while the cursor is over the pet, a bubble or the board.
  useEffect(() => {
    const unsub = backend.system.onCursor((c) => {
      cursor.current = c;
      const el = document.elementFromPoint(c.x, c.y);
      hovered.current = !!el?.closest(".pet");
      const hit = dragging.current !== null || !!el?.closest("[data-hit]");
      if (hit === !clickThrough.current) return;
      clickThrough.current = !hit;
      void backend.system.setClickThrough(!hit);
    });
    return unsub;
  }, [backend]);

  // Closing the board: Escape, or the overlay losing focus (a click on another app).
  useEffect(() => {
    if (!board) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBoard();
    const onBlur = () => !fakeDesktop && closeBoard();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [board, closeBoard, fakeDesktop]);

  // Tray tooltip ticks every second during focus.
  useEffect(() => {
    if (!s.focus) return;
    const id = setInterval(() => brain.updateTray(), 1000);
    return () => clearInterval(id);
  }, [brain, s.focus]);

  // The frame loop: motion, pose and rendering at ~30 fps.
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
      const dt = (now - last) / 1000;
      if (dt < 1 / 32) return;
      last = now;
      t += dt;
      const st = brain.getSnapshot();
      const motion = motionRef.current!;
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const size = BASE_SIZE * st.prefs.petScale;
      const info = speciesInfo(st.prefs.species);
      const antic = st.antic?.kind.type ?? null;
      motion.step(dt, {
        width: W,
        height: H,
        size,
        mood: st.mood,
        gait: info.gait,
        calm: st.calmMotion,
        hovered: hovered.current,
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
      const left = m.x - size / 2;
      const top = m.y - size * FEET * m.scale;
      if (petRef.current) {
        petRef.current.style.width = `${size}px`;
        petRef.current.style.height = `${size}px`;
        petRef.current.style.transform = `translate(${left}px, ${top + size * FEET * (m.scale - 1)}px) scale(${m.scale})`;
        petRef.current.style.transformOrigin = `50% ${FEET * 100}%`;
      }
      const visualTop = m.y - size * FEET * m.scale + size * 0.12 * m.scale;
      anchor.current = { x: m.x, top: visualTop, feetY: m.y, size };

      const bubble = bubbleRef.current;
      if (bubble) {
        const bw = bubble.offsetWidth;
        const bh = bubble.offsetHeight;
        const bx = Math.min(Math.max(m.x - bw / 2, 8), W - bw - 8);
        const by = Math.max(8, visualTop - bh - 14);
        bubble.style.left = `${bx}px`;
        bubble.style.top = `${by}px`;
        bubble.style.setProperty("--tail-x", `${Math.min(Math.max(m.x - bx, 18), bw - 18)}px`);
      }
      const sign = signRef.current;
      if (sign) {
        const sw = sign.offsetWidth;
        const sx = m.facing > 0 ? m.x - size * 0.45 - sw : m.x + size * 0.45;
        sign.style.left = `${sx}px`;
        sign.style.top = `${m.y - sign.offsetHeight - 26}px`;
      }
      const flip = flipRef.current;
      if (flip) {
        flip.style.left = `${m.x}px`;
        flip.style.top = `${visualTop - 54}px`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [brain]);

  // Dragging and clicking the pet.
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
  const onPointerUp = () => {
    const d = dragging.current;
    dragging.current = null;
    petRef.current?.classList.remove("dragging");
    if (!d) return;
    if (d.moved) {
      motionRef.current?.release();
      return;
    }
    brain.petClicked();
    if (board) closeBoard();
    else openBoard(false);
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openBoard(false);
  };

  const hidden = s.hiddenUntil !== null || (s.fullscreen && s.prefs.hideInFullscreen);
  const showBubble = s.bubble && !board && (!hidden || s.bubble.urgent);
  const lang = getLang();

  return (
    <>
      {fakeDesktop && <DemoDesktop />}
      <div
        className="stage"
        ref={stageRef}
        style={fakeDesktop ? { bottom: 48 } : undefined}
        onPointerDown={(e) => {
          if (board && e.target === e.currentTarget) closeBoard();
        }}
      >
        {s.antic?.kind.type === "parade" && (
          <div className="sign" ref={signRef}>
            <small>{lang === "vi" ? "Làm ngay việc này" : "Do this now"}</small>
            {s.antic.kind.title}
          </div>
        )}
        {s.antic?.kind.type === "block" && (
          <div className="table-flip" ref={flipRef}>
            (╯°□°)╯︵ ┻━┻
          </div>
        )}
        <div
          className={`pet${hidden ? " hidden" : ""}`}
          ref={petRef}
          data-hit=""
          role="button"
          aria-label={s.prefs.petName}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={onContextMenu}
          onPointerEnter={() => (hovered.current = true)}
          onPointerLeave={() => (hovered.current = false)}
        >
          <div ref={svgRef} />
          <PetBadge brain={brain} />
        </div>
        <Effects celebration={s.celebration} anchor={anchor} />
        {showBubble && s.bubble && <BubbleView key={s.bubble.id} ref={bubbleRef} bubble={s.bubble} brain={brain} />}
        {board && boardAnchor && (
          <Board
            key={`board`}
            brain={brain}
            backend={backend}
            request={board}
            anchor={boardAnchor}
            stageRef={stageRef}
            onClose={closeBoard}
            onOpenSplit={(t) => openBoard(false, t)}
          />
        )}
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
    const left = Math.max(0, Math.round((s.focus.end - Date.now()) / 1000));
    return (
      <span className="pet-badge">
        {s.focus.isBreak ? "☕" : "🍅"} {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
      </span>
    );
  }
  if (s.flow) return <span className="pet-badge flow">🎧</span>;
  return null;
}
