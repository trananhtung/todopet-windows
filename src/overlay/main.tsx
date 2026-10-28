import "../ui/theme.css";
import "./overlay.css";
import { createRoot } from "react-dom/client";
import { getBackend, isDemo, isTauri } from "../backend";
import { Brain } from "../core/brain";
import { App } from "./App";

async function boot() {
  const backend = await getBackend();
  const demo = isDemo();
  const brain = await Brain.create(backend, { demo });
  createRoot(document.getElementById("root")!).render(<App brain={brain} backend={backend} demo={demo} fakeDesktop={!isTauri()} />);
  await brain.start();
  // Dev hook: overlay.html?demo&antic=parade|block|grumble plays a stunt right away.
  const antic = new URLSearchParams(location.search).get("antic");
  if (demo && (antic === "parade" || antic === "block" || antic === "grumble")) setTimeout(() => brain.demoAntic(antic), 1500);
}

void boot();
