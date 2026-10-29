import "../ui/theme.css";
import "./overlay.css";
import "./pet-life.css";
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
  // Dev hooks: overlay.html?demo&antic=parade|block|grumble plays a stunt right away; ?demo&trip sends the pet on
  // today's trip (its sign stands in for it).
  const params = new URLSearchParams(location.search);
  const antic = params.get("antic");
  if (demo && (antic === "parade" || antic === "block" || antic === "grumble")) setTimeout(() => brain.demoAntic(antic), 1500);
  if (demo && params.has("trip")) setTimeout(() => brain.goOnTrip(), 1500);
}

void boot();
