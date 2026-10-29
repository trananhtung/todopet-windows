import "../ui/theme.css";
import "./overlay.css";
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
  // Dev hook: overlay.html?demo&antic=parade|block|grumble plays a stunt right away.
  const antic = new URLSearchParams(location.search).get("antic");
  if (demo && (antic === "parade" || antic === "block" || antic === "grumble")) setTimeout(() => brain.demoAntic(antic), 1500);
}

void boot();
