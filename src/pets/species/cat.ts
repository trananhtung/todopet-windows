// Cat: a silver tabby with an "M" on its forehead, side stripes, whiskers and a curling striped tail.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, triEar, tube } from "../shapes";
import { p, path, r, st } from "../svg";

const EAR = moodTable(1, 0.95, 0.6, 0.3, 0.7);
/** Tail angle in degrees: + raises it, − lowers it. */
const TAIL = moodTable(10, 0, -9, 6, 16);
const TAIL_D = "M0 0C-17 2 -31 -6 -31 -22C-31 -33 -23 -39 -15.5 -35";

export const cat: SpeciesDef = {
  info: {
    id: "cat",
    name: { en: "Cat", vi: "Mèo" },
    emoji: "🐱",
    gait: "bounce",
    sound: { en: "meow", vi: "meo meo" },
  },
  base: makeBase({ top: "#F4F5F9", bottom: "#AEB7C8", mark: "#76819A", belly: "#FFFFFF", accent: "#FF9FB2", inner: "#FFB8C6" }),
  w: 78,
  h: 68,
  face: { eyeY: 0.54, eyeDX: 0.19, mouthY: 0.165 },
  reach: [28, 9],
  headroom: (c) => c.bh * 0.3 * c.mv(EAR) + 3,
  body: (c) => blob(c, { tw: 0.38 }),
  back(c) {
    const { cx, top, by, bw, bh, t } = c;
    const lash = c.mood === "angry" ? Math.sin(t * 7) * 12 : Math.sin(t * 2.2) * 5;
    const ang = c.mv(TAIL) + lash * c.motion;
    const bx = cx - bw * 0.36, byy = by - bh * 0.14;
    let out =
      `<g transform="translate(${r(bx)} ${r(byy)}) rotate(${r(ang)})">` +
      tube(TAIL_D, 7.7, c.pal.arm, c.pal.line) +
      path(TAIL_D, `${st(c.pal.mark, 7.7)} stroke-dasharray="3 6.5" stroke-dashoffset="-9" stroke-linecap="butt"`) +
      `</g>`;
    const lift = c.mv(EAR);
    for (const side of [-1, 1]) {
      out += triEar(
        c,
        [cx + side * bw * 0.05, top + bh * 0.12],
        [cx + side * bw * (0.3 + (1 - lift) * 0.34), top - bh * 0.3 * lift + (1 - lift) * 9],
        [cx + side * bw * 0.42, top + bh * 0.3],
        c.pal.top,
        c.pal.inner,
      );
    }
    return out;
  },
  markings(c) {
    const { cx, top, by, bw, bh, fx, my } = c;
    const m = st(c.pal.mark, 3.3);
    // Forehead "M".
    let d = `M${p(cx - 8, top + 2)}L${p(cx - 6.6, top + 10)}M${p(cx, top)}L${p(cx, top + 12)}M${p(cx + 8, top + 2)}L${p(cx + 6.6, top + 10)}`;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = top + bh * (0.5 + i * 0.14);
        d += `M${p(cx + side * bw * 0.53, y)}Q${p(cx + side * bw * 0.44, y + 1)} ${p(cx + side * bw * 0.36, y + 3.3)}`;
      }
    }
    const belly = `fill="${c.pal.belly}"`;
    return (
      path(d, m) +
      `<ellipse cx="${r(cx)}" cy="${r(by - bh * 0.1)}" rx="${r(bw * 0.24)}" ry="${r(bh * 0.2)}" ${belly}/>` +
      `<ellipse cx="${r(fx - 4.4)}" cy="${r(my + 0.6)}" rx="6.6" ry="5" ${belly}/>` +
      `<ellipse cx="${r(fx + 4.4)}" cy="${r(my + 0.6)}" rx="6.6" ry="5" ${belly}/>`
    );
  },
  front(c) {
    const { fx, my, bw } = c;
    let whiskers = "";
    for (const side of [-1, 1]) {
      const x0 = fx + side * bw * 0.22;
      whiskers += `M${p(x0, my - 1.5)}L${p(x0 + side * 12, my - 4.4)}M${p(x0, my + 2)}L${p(x0 + side * 12.5, my + 2.6)}`;
    }
    return (
      path(`M${p(fx - 2.9, my - 4.6)}L${p(fx + 2.9, my - 4.6)}L${p(fx, my - 1.5)}Z`, `fill="${c.pal.accent}" stroke="${c.pal.line}" stroke-width="1"`) +
      path(whiskers, `${st(c.pal.line, 1.2)} stroke-opacity="0.55"`)
    );
  },
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.95 },
    bow: { x: c.cx + c.bw * 0.27, y: c.top + 7 },
    // Under the mouth, curving up toward the cheeks so it never covers the face.
    neck: { y: c.my + 1, w: c.bw, sag: c.bh * 0.28 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
