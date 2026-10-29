import "../ui/theme.css";
import "./overlay.css";
import "./pet-life.css";
import { createRoot } from "react-dom/client";
import { getBackend, isDemo, isTauri } from "../backend";
import type { DemoBackend } from "../backend/demo";
import { Brain } from "../core/brain";
import { App } from "./App";

async function boot() {
  const backend = await getBackend();
  const demo = isDemo();
  // The demo panel can move the clock (the next morning, a Friday): the brain runs on the demo backend's, not the real one.
  const clock = "demo" in backend ? (backend as DemoBackend).demo.now : undefined;
  const brain = await Brain.create(backend, { demo, ...(clock ? { now: clock } : {}) });
  createRoot(document.getElementById("root")!).render(<App brain={brain} backend={backend} demo={demo} fakeDesktop={!isTauri()} />);
  await brain.start();
  // Dev hooks: overlay.html?demo&antic=parade|block|grumble plays a stunt right away; ?demo&trip sends the pet on
  // today's trip (its sign stands in for it).
  const params = new URLSearchParams(location.search);
  const antic = params.get("antic");
  if (demo && (antic === "parade" || antic === "block" || antic === "grumble")) setTimeout(() => brain.demoAntic(antic), 1500);
  if (demo && params.has("trip")) setTimeout(() => brain.goOnTrip(), 1500);
}

void boot();
