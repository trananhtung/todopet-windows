// Fox: big fluffy white-tipped tail, tall dark-tipped ears, white cheek mask with fluffy tufts, dark socks.
import { moodTable, type SpeciesDef } from "../kit";
import { makeBase } from "../palette";
import { blob, nose, triEar } from "../shapes";
import { ell, fs, p, path, r } from "../svg";

const EAR = moodTable(1, 0.95, 0.55, 0.35, 0.5);
/** Tail angle in degrees: + tucks it up behind the back, − lowers it. */
const TAIL = moodTable(8, 0, -7, 4, 14);
const TAIL_D = "M3 -7C-5 -14 -8 -31 -21 -47C-39 -42 -45 -13 -25 0C-15 6 -5 7 3 5Z";

export const fox: SpeciesDef = {
  info: {
    id: "fox",
    name: { en: "Fox", vi: "Cáo" },
    emoji: "🦊",
    gait: "scurry",
    sound: { en: "yip yip", vi: "ăng ẳng" },
  },
  base: makeBase({ top: "#FFAE6A", bottom: "#EE7536", belly: "#FFF8EF", mark: "#5B3022", accent: "#2B1B14", inner: "#FFE2CC" }),
  w: 76,
  h: 64,
  face: { eyeY: 0.5, eyeDX: 0.19, mouthY: 0.2 },
  feet: { color: "mark" },
  arms: { scale: 0.95 },
  reach: [33, 12],
  headroom: (c) => c.bh * 0.36 * c.mv(EAR) + 3,
  body: (c) => blob(c, { tw: 0.36, sh: 0.24 }),
  back(c) {
    const { cx, top, by, bw, bh, t, id } = c;
    const happy = c.mood === "happy" || c.mood === "celebrating";
    const wag = Math.sin(t * (happy ? 9 : 2.6)) * (happy ? 7 : 4) * c.motion;
    const clip = `${id}-ft`;
    let out =
      `<g transform="translate(${r(cx - bw * 0.33)} ${r(by - bh * 0.18)}) rotate(${r(c.mv(TAIL) + wag)})">` +
      `<clipPath id="${clip}"><path d="${TAIL_D}"/></clipPath>` +
      path(TAIL_D, `fill="${c.pal.top}"`) +
      `<ellipse cx="-27" cy="-43" rx="15" ry="12" fill="${c.pal.belly}" clip-path="url(#${clip})"/>` +
      path("M-13 -12Q-19 -8 -27 -11M-16 -25Q-22 -20 -30 -22", `fill="none" stroke="${c.pal.bottom}" stroke-width="1.6"`) +
      path(TAIL_D, `fill="none" stroke="${c.pal.line}" stroke-width="2.4"`) +
      `</g>`;
    const lift = c.mv(EAR);
    for (const side of [-1, 1]) {
      const b1: [number, number] = [cx + side * bw * 0.04, top + bh * 0.14];
      const tip: [number, number] = [cx + side * bw * (0.33 + (1 - lift) * 0.3), top - bh * 0.36 * lift + (1 - lift) * 9];
      const b2: [number, number] = [cx + side * bw * 0.43, top + bh * 0.3];
      out += triEar(c, b1, tip, b2, c.pal.top, c.pal.inner, 0.46);
      const k = 0.6;
      out += path(
        `M${p(tip[0] + (b1[0] - tip[0]) * (1 - k), tip[1] + (b1[1] - tip[1]) * (1 - k))}L${p(tip[0], tip[1])}L${p(tip[0] + (b2[0] - tip[0]) * (1 - k), tip[1] + (b2[1] - tip[1]) * (1 - k))}Z`,
        fs(c.pal.mark, c.pal.line, 1.6),
      );
    }
    return out;
  },
  markings(c) {
    const { cx, by, bw, bh, fx, my } = c;
    const belly = `fill="${c.pal.belly}"`;
    return (
      ell(fx - bw * 0.2, my - 2, bw * 0.22, bh * 0.17, belly) +
      ell(fx + bw * 0.2, my - 2, bw * 0.22, bh * 0.17, belly) +
      ell(cx, by - bh * 0.04, bw * 0.25, bh * 0.2, belly)
    );
  },
  over(c) {
    // Cheek ruff: white tufts poking out of the silhouette.
    const { cx, bw, ey, bh } = c;
    let out = "";
    for (const side of [-1, 1]) {
      const x = cx + side * bw * 0.48, y = ey + bh * 0.02;
      out += path(
        `M${p(x - side * 3, y - 6.5)}Q${p(x + side * 4, y - 4)} ${p(x + side * 7.5, y - 1.5)}Q${p(x + side * 3, y + 0.5)} ${p(x + side * 1, y + 1.5)}` +
          `Q${p(x + side * 5, y + 3.5)} ${p(x + side * 6.5, y + 6.5)}Q${p(x, y + 7.5)} ${p(x - side * 4, y + 5)}Z`,
        fs(c.pal.belly, c.pal.line, 2),
      );
    }
    return out;
  },
  front: (c) => nose(c.fx, c.my - 4.2, 7.4, 4.8, c.pal.accent, c.pal.line),
  anchors: (c) => ({
    head: { x: c.cx, y: c.top + 3, s: 0.92 },
    bow: { x: c.cx + c.bw * 0.27, y: c.top + 8 },
    neck: { y: c.by - c.bh * 0.38, w: c.bw, sag: c.bh * 0.14 },
    band: { y: c.top + c.bh * 0.3, arch: c.bh * 0.22 },
  }),
};
