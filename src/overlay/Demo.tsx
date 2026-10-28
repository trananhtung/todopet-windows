import { useEffect, useState, useSyncExternalStore } from "react";
import type { DemoBackend } from "../backend/demo";
import type { Backend } from "../backend/types";
import type { Brain } from "../core/brain";
import { L } from "../core/l10n";
import { meetsUnlock } from "../core/life";
import { SPECIES_IDS, type SpeciesId } from "../core/types";
import { speciesInfo } from "../pets";

/** A fake Windows desktop and taskbar, so the overlay can be tried in a plain browser. */
export function DemoDesktop() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="demo-desktop" aria-hidden>
      <div className="demo-window">
        <p>Q4 planning notes</p>
        <p>— Ship the weekly report before lunch.</p>
        <p>— Call client ABC about the renewal.</p>
        <p>— Reply to the budget email (it's been waiting a while…).</p>
      </div>
      <div className="demo-taskbar">
        <span>🪟</span>
        <span>🔎</span>
        <span className="on">📝</span>
        <span>🌐</span>
        <span>📁</span>
        <span>✉️</span>
        <span className="clock">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <br />
          {now.toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

const isDemoBackend = (b: Backend): b is DemoBackend => "demo" in b;

/** Demo controls: fake what Windows would report and trigger the pet's stunts right away. */
export function DemoPanel({ brain, backend }: { brain: Brain; backend: Backend }) {
  const s = useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [open, setOpen] = useState(true);
  const fake = isDemoBackend(backend) ? backend.demo : null;

  return (
    <div className="demo-panel" data-hit="">
      <h3>
        {L("Bảng demo", "Demo controls")}
        <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "–" : "+"}
        </button>
      </h3>
      {open && (
        <>
          <div className="grid">
            <button className="btn" onClick={() => s.next && void brain.complete(s.next)} disabled={!s.next}>
              ✓ {L("Xong 1 việc", "Finish a task")}
            </button>
            <button className="btn" onClick={() => brain.demoCelebrate()}>
              🎉 {L("Ăn mừng", "Celebrate")}
            </button>
            {fake && (
              <>
                <button
                  className="btn"
                  onClick={() => fake.setForeground({ name: "Google Chrome", exe: "chrome.exe", title: "Funny cats - YouTube - Google Chrome" }, "https://www.youtube.com/watch?v=cats")}
                >
                  📺 YouTube
                </button>
                <button className="btn" onClick={() => fake.setForeground(null)}>
                  💼 {L("Làm việc", "Work app")}
                </button>
              </>
            )}
            <button className="btn" onClick={() => brain.demoAntic("parade")}>
              📢 {L("Diễu hành", "Parade")}
            </button>
            <button className="btn" onClick={() => brain.demoAntic("block")}>
              ┻━┻ {L("Lật bàn", "Table flip")}
            </button>
            <button className="btn" onClick={() => brain.demoAntic("grumble")}>
              😤 {L("Càu nhàu", "Grumble")}
            </button>
            <button className="btn" onClick={() => (s.focus ? brain.stopFocus() : brain.startFocus(null, 1))}>
              🍅 {s.focus ? L("Dừng", "Stop") : L("Tập trung 1'", "Focus 1'")}
            </button>
            {fake && (
              <button className="btn" onClick={() => fake.setIdle(s.mood === "sleeping" ? 0 : 700)}>
                😴 {s.mood === "sleeping" ? L("Thức dậy", "Wake up") : L("Rời máy", "Step away")}
              </button>
            )}
            <button className="btn" onClick={() => brain.tick()}>
              ⏱ {L("Chạy luật", "Run rules")}
            </button>
          </div>
          <label className="sr-only" htmlFor="demo-species">
            {L("Loài", "Species")}
          </label>
          <select
            id="demo-species"
            className="field"
            value={s.prefs.species}
            onChange={(e) => void brain.setSpecies(e.target.value as SpeciesId)}
          >
            {SPECIES_IDS.map((id) => {
              const info = speciesInfo(id);
              const locked = !meetsUnlock(info.unlock, s.life);
              return (
                <option key={id} value={id}>
                  {info.emoji} {info.name.en}
                  {locked ? " 🔒" : ""}
                </option>
              );
            })}
          </select>
        </>
      )}
    </div>
  );
}
