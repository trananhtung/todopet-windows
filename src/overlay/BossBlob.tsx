// The Procrastination Blob, drawn the way the pets are: flat fills, a soft outline, a little face. (It was an emoji in a
// circle among hand-drawn vector pets, which showed.) Alive it is a smug violet jelly that breathes; beaten it is a
// flattened grey one, dizzy, with stars. The colors are the picture's own, so it reads the same in light and dark.
// No ids inside, so any number of copies can share a page. Decorative: the HP bar and the words say everything.

/** A jelly blob sitting on the ground, smug, with cheeks. */
function Alive() {
  return (
    <g data-blob="alive" className="blob-alive">
      <ellipse cx="24" cy="41.5" rx="14" ry="2.2" fill="#000" opacity="0.1" />
      <path
        d="M7.5 34.5C6 22.5 13.5 10.5 24 10.5S42 22.5 40.5 34.5c-.4 3.4-3.1 5.5-6.6 5.5H14.1c-3.5 0-6.2-2.1-6.6-5.5Z"
        fill="#B59AEA"
        stroke="#6B4FB0"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M13.5 22.5c1.4-4.6 5.2-7.2 9-7.6" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="17.6" cy="29.2" rx="2.1" ry="3" fill="#33245E" />
      <ellipse cx="30.4" cy="29.2" rx="2.1" ry="3" fill="#33245E" />
      <circle cx="18.3" cy="28" r="0.8" fill="#fff" />
      <circle cx="31.1" cy="28" r="0.8" fill="#fff" />
      <ellipse cx="13" cy="33.4" rx="2.6" ry="1.6" fill="#FF9FB8" opacity="0.7" />
      <ellipse cx="35" cy="33.4" rx="2.6" ry="1.6" fill="#FF9FB8" opacity="0.7" />
      <path d="M20.6 34.4c1.9 1.9 4.9 1.9 6.8 0" fill="none" stroke="#33245E" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

/** Beaten: squashed flat, grey, crossed-out eyes, and stars going round. */
function Beaten() {
  const star = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}L${cx + r * 0.3} ${cy - r * 0.3}L${cx + r} ${cy}L${cx + r * 0.3} ${cy + r * 0.3}L${cx} ${cy + r}L${cx - r * 0.3} ${cy + r * 0.3}L${cx - r} ${cy}L${cx - r * 0.3} ${cy - r * 0.3}Z`;
  return (
    <g data-blob="beaten" className="blob-beaten">
      <ellipse cx="24" cy="41.5" rx="16" ry="2" fill="#000" opacity="0.1" />
      <path
        d="M5.5 37.5C5.6 31.5 13 26 24 26s18.4 5.5 18.5 11.5c0 2.6-2.3 4-5.2 4H10.7c-2.9 0-5.2-1.4-5.2-4Z"
        fill="#CFCBE0"
        stroke="#857FA6"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.5 32.2c2-2 4.6-3.1 7.4-3.4" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.2 33.2l4.2 3.6M19.4 33.2l-4.2 3.6M28.6 33.2l4.2 3.6M32.8 33.2l-4.2 3.6" stroke="#4E4872" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="24" cy="38.4" rx="2" ry="1.3" fill="#4E4872" />
      <path d={star(12, 15, 3.4)} fill="#F4C542" stroke="#C99A12" strokeWidth="0.8" strokeLinejoin="round" />
      <path d={star(24, 9.5, 4.2)} fill="#F4C542" stroke="#C99A12" strokeWidth="0.8" strokeLinejoin="round" />
      <path d={star(36, 15, 3.4)} fill="#F4C542" stroke="#C99A12" strokeWidth="0.8" strokeLinejoin="round" />
    </g>
  );
}

export function BossBlob({ beaten, size = 40 }: { beaten: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false" className={`boss-art${beaten ? " beaten" : ""}`}>
      {beaten ? <Beaten /> : <Alive />}
    </svg>
  );
}
