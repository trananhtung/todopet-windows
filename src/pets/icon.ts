// The app icon: Mochi's happy face on a warm rounded square, drawn bold so it still reads at 16 px.

const SIZE = 1024;

/** Mochi's body outline (same construction as the in-app body, scaled up). */
function body(cx: number, top: number, bottom: number, w: number, h: number): string {
  const l = cx - w / 2, r = cx + w / 2;
  return (
    `M${cx} ${top}C${cx + w * 0.4} ${top} ${r} ${top + h * 0.22} ${r} ${bottom - h * 0.38}` +
    `C${r} ${bottom - h * 0.04} ${cx + w * 0.36} ${bottom} ${cx} ${bottom}` +
    `C${cx - w * 0.36} ${bottom} ${l} ${bottom - h * 0.04} ${l} ${bottom - h * 0.38}` +
    `C${l} ${top + h * 0.22} ${cx - w * 0.4} ${top} ${cx} ${top}Z`
  );
}

/** 1024×1024 SVG app icon. Thick outlines and no small details, for crisp 16–256 px renders. */
export function appIconSvg(): string {
  const cx = 512, top = 318, bottom = 902, w = 800, h = bottom - top;
  const line = "#7A4A30";
  const ink = "#2B1B14";
  const ey = top + h * 0.46;
  const ex = 150;
  const my = ey + 118;
  const ears = [-1, 1]
    .map((s) => {
      const b1 = [cx + s * 70, top + 70], tip = [cx + s * 262, top - 150], b2 = [cx + s * 350, top + 210];
      const k = 0.56, c = [(b1[0] + tip[0] + b2[0]) / 3, (b1[1] + tip[1] + b2[1]) / 3];
      const inner = [b1, tip, b2].map((q) => `${c[0] + (q[0] - c[0]) * k} ${c[1] + (q[1] - c[1]) * k + 26}`);
      return (
        `<path d="M${b1[0]} ${b1[1]}L${tip[0]} ${tip[1]}L${b2[0]} ${b2[1]}Z" fill="#FFE9D2" stroke="${line}" stroke-width="40" stroke-linejoin="round"/>` +
        `<path d="M${inner[0]}L${inner[1]}L${inner[2]}Z" fill="#FF9FB2" stroke="#FF9FB2" stroke-width="16" stroke-linejoin="round"/>`
      );
    })
    .join("");
  const eyes = [-1, 1]
    .map((s) => `<path d="M${cx + s * ex - 66} ${ey + 22}Q${cx + s * ex} ${ey - 72} ${cx + s * ex + 66} ${ey + 22}" fill="none" stroke="${ink}" stroke-width="50" stroke-linecap="round"/>`)
    .join("");
  const cheeks = [-1, 1].map((s) => `<ellipse cx="${cx + s * 262}" cy="${ey + 92}" rx="74" ry="44" fill="#FF6F96" fill-opacity="0.6"/>`).join("");
  const mouth = `M${cx - 96} ${my - 8}Q${cx} ${my + 190} ${cx + 96} ${my - 8}Z`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
    `<defs>` +
    `<linearGradient id="ic-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD9A6"/><stop offset="1" stop-color="#FF9A5C"/></linearGradient>` +
    `<linearGradient id="ic-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4E6"/><stop offset="1" stop-color="#F7C79C"/></linearGradient>` +
    `<clipPath id="ic-mouth"><path d="${mouth}"/></clipPath>` +
    `</defs>` +
    `<rect x="32" y="32" width="960" height="960" rx="216" fill="url(#ic-bg)"/>` +
    `<ellipse cx="${cx}" cy="${bottom + 14}" rx="330" ry="34" fill="#8A3A12" fill-opacity="0.22"/>` +
    ears +
    `<path d="${body(cx, top, bottom, w, h)}" fill="url(#ic-body)" stroke="${line}" stroke-width="44" stroke-linejoin="round"/>` +
    `<ellipse cx="${cx - 150}" cy="${top + 100}" rx="110" ry="48" fill="#fff" fill-opacity="0.6"/>` +
    cheeks +
    eyes +
    `<path d="${mouth}" fill="#5A2A1E"/>` +
    `<ellipse cx="${cx}" cy="${my + 112}" rx="62" ry="46" fill="#FF7A8A" clip-path="url(#ic-mouth)"/>` +
    `<path d="${mouth}" fill="none" stroke="${line}" stroke-width="30" stroke-linejoin="round"/>` +
    `</svg>`
  );
}
