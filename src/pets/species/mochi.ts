// Mochi: the original round, cat-eared rice cake from the macOS app, ported 1:1 (×1.1).
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase, type Base } from "../palette";
import { blob, triEar } from "../shapes";

const P = (top: string, bottom: string, line: string, cheek: string, cheekA: number): Base =>
  makeBase({ top, bottom, line, cheek, cheekA, accent: "#FF9FB2", inner: "#FFAFC0", belly: top });

const happy = P("#FFE9CC", "#FFBA8A", "#8A4B2A", "#FF6F96", 0.55);
const normal = P("#FFF0DE", "#F4C69C", "#7A4A30", "#FF8FA3", 0.4);

const EAR = moodTable(1, 0.92, 0.7, 0.5, 0.55);

export const mochi: SpeciesDef = {
  info: {
    id: "mochi",
    name: { en: "Mochi", vi: "Mochi" },
    emoji: "🍡",
    gait: "bounce",
    sound: { en: "mochi!", vi: "mochi!" },
  },
  base: normal,
  moods: {
    happy,
    celebrating: happy,
    normal,
    focus: normal,
    annoyed: P("#EFE6DC", "#C4B09E", "#5E4A3E", "#C98F8F", 0.2),
    angry: P("#FFB49C", "#EA5A45", "#6E1D12", "#B02A1E", 0),
    sleeping: P("#EAE7F8", "#B9B2DE", "#4D4775", "#FF9FB8", 0.28),
  },
  w: 80,
  h: 66,
  face: { eyeY: 0.53, eyeDX: 0.185 },
  reach: [9, 9],
  headroom: (c) => c.bh * 0.22 * c.mv(EAR) + 3,
  body: (c) => blob(c),
  back(c) {
    const { cx, top, bw, bh, t } = c;
    const lift = c.mv(EAR);
    let out = "";
    for (const side of [-1, 1]) {
      const twitch = c.mood === "happy" && side > 0 && Math.sin(t * 1.3) > 0.95 ? -3.3 : 0;
      out += triEar(
        c,
        [cx + side * bw * 0.08, top + bh * 0.12],
        [cx + side * bw * (0.3 + (1 - lift) * 0.32), top - bh * 0.22 * lift + (1 - lift) * 8.8 + twitch],
        [cx + side * bw * 0.42, top + bh * 0.32],
        c.pal.top,
        c.pal.inner,
      );
    }
    return out;
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 1 },
    bow: { x: c.cx + c.bw * 0.3, y: c.top + 6 },
    // Under the mouth, curving up toward the cheeks so it never covers the face.
    neck: { y: c.my + 1, w: c.bw, sag: c.bh * 0.28 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
