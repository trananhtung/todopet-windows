// Expeditions (v0.5): once today's plan is done the pet may go on a trip and comes back with a souvenir and a
// postcard. Pure rules; the brain offers the trip, keeps the pet away and brings it back.
import { countWeek } from "./chapters";
import { dayKey } from "./dates";
import { L } from "./l10n";
import type { LifeState } from "./life";

export const SOUVENIR_IDS = [
  "hoian",
  "dalat",
  "halong",
  "sapa",
  "bentre",
  "hanoi",
  "saigon",
  "hue",
  "phuquoc",
  "kyoto",
  "seoul",
  "bangkok",
  "paris",
  "bali",
  "reykjavik",
  "swiss",
] as const;
export type SouvenirId = (typeof SOUVENIR_IDS)[number];

interface Text {
  vi: string;
  en: string;
}

export interface Souvenir {
  id: SouvenirId;
  emoji: string;
  /** Where the pet went, as it reads inside a sentence ("Hội An", "the Swiss Alps"). */
  place: Text;
  /** What it brought back, for the shelf ("Hội An lantern"). */
  item: Text;
  /** The postcard it writes in the diary. */
  postcard: Text;
}

const s = (id: SouvenirId, emoji: string, place: [string, string], item: [string, string], postcard: [string, string]): Souvenir => ({
  id,
  emoji,
  place: { vi: place[0], en: place[1] },
  item: { vi: item[0], en: item[1] },
  postcard: { vi: postcard[0], en: postcard[1] },
});

export const SOUVENIRS: readonly Souvenir[] = [
  s(
    "hoian",
    "🏮",
    ["Hội An", "Hội An"],
    ["Đèn lồng Hội An", "Hội An lantern"],
    [
      "Phố cổ Hội An lên đèn lung linh lắm! Mình thả một chiếc hoa đăng trên sông Hoài và ước cho bạn một tuần thật vui. Mang về cho bạn một chiếc đèn lồng nè 🏮",
      "Hội An's old town glows at night! I floated a paper lantern down the Hoài River and wished you a happy week. Brought you a lantern 🏮",
    ],
  ),
  s(
    "dalat",
    "🍓",
    ["Đà Lạt", "Đà Lạt"],
    ["Dâu tây Đà Lạt", "Đà Lạt strawberries"],
    [
      "Đà Lạt se lạnh, sương bảng lảng trên đồi thông. Mình tự tay hái dâu ngoài vườn, quả đỏ nhất là phần bạn đó 🍓",
      "Đà Lạt was misty and cool, with pine hills all around. I picked strawberries myself, and the reddest ones are yours 🍓",
    ],
  ),
  s(
    "halong",
    "🐚",
    ["vịnh Hạ Long", "Hạ Long Bay"],
    ["Vỏ ốc Hạ Long", "Hạ Long shell"],
    [
      "Mình đi thuyền giữa vịnh Hạ Long, hàng nghìn đảo đá nhô lên như trong tranh. Nhặt cho bạn một vỏ ốc, áp vào tai là nghe tiếng biển 🐚",
      "I sailed through Hạ Long Bay, past thousands of limestone islands. Found you a shell: hold it to your ear and you'll hear the sea 🐚",
    ],
  ),
  s(
    "sapa",
    "🏔️",
    ["Sa Pa", "Sa Pa"],
    ["Bưu thiếp Sa Pa", "Sa Pa postcard"],
    [
      "Ruộng bậc thang Sa Pa vàng óng, mây bay ngang tầm mắt luôn. Gửi bạn tấm bưu thiếp có đỉnh Fansipan nè 🏔️",
      "Sa Pa's rice terraces were golden, and the clouds floated at eye level. Here's a postcard of Fansipan for you 🏔️",
    ],
  ),
  s(
    "bentre",
    "🥥",
    ["Bến Tre", "Bến Tre"],
    ["Kẹo dừa Bến Tre", "Bến Tre coconut candy"],
    [
      "Mình ngồi xuồng len qua rặng dừa Bến Tre, ghé xem các cô nấu kẹo dừa. Kẹo còn ấm nè, bạn ăn thử đi 🥥",
      "I rode a little boat through Bến Tre's coconut groves and watched them make coconut candy. It's still warm, try one 🥥",
    ],
  ),
  s(
    "hanoi",
    "☕",
    ["Hà Nội", "Hà Nội"],
    ["Cà phê trứng Hà Nội", "Hà Nội egg coffee"],
    [
      "Hà Nội mùa này mát lắm. Mình ngồi quán nhỏ nhìn ra Hồ Gươm, nhâm nhi cà phê trứng béo ngậy, và để dành cho bạn một ly ☕",
      "Hà Nội was breezy. I sat by Hoàn Kiếm Lake sipping a creamy egg coffee, and saved you a cup ☕",
    ],
  ),
  s(
    "saigon",
    "🥖",
    ["Sài Gòn", "Sài Gòn"],
    ["Bánh mì Sài Gòn", "Sài Gòn bánh mì"],
    [
      "Sài Gòn nhộn nhịp ghê! Lượn một vòng xong mình ghé xe bánh mì đầu hẻm. Ổ này giòn rụm, phần bạn đó 🥖",
      "Sài Gòn was buzzing! After a spin around town I stopped at a street-corner cart. This bánh mì is extra crunchy, all yours 🥖",
    ],
  ),
  s(
    "hue",
    "🍬",
    ["Huế", "Huế"],
    ["Mè xửng Huế", "Huế sesame candy"],
    [
      "Mình nghe ca Huế trên sông Hương, rồi ghé chợ Đông Ba mua mè xửng. Ngọt, dẻo, chỉ dính răng xíu xiu thôi 🍬",
      "I listened to Huế folk songs on the Perfume River, then bought sesame candy at Đông Ba market. Sweet, chewy, only a tiny bit sticky 🍬",
    ],
  ),
  s(
    "phuquoc",
    "🦪",
    ["Phú Quốc", "Phú Quốc"],
    ["Ngọc trai Phú Quốc", "Phú Quốc pearl"],
    [
      "Biển Phú Quốc xanh trong vắt, mình ngồi trên cát ngắm hoàng hôn đỏ rực. Tặng bạn một viên ngọc trai nhỏ xíu nè 🦪",
      "Phú Quốc's sea was crystal clear, and I watched a fiery sunset from the sand. A tiny pearl for you 🦪",
    ],
  ),
  s(
    "kyoto",
    "🪭",
    ["Kyoto", "Kyoto"],
    ["Quạt giấy Kyoto", "Kyoto fan"],
    [
      "Kyoto đẹp như tranh! Mình đi dưới hàng nghìn cổng torii đỏ ở Fushimi Inari. Mua cho bạn một chiếc quạt giấy để phe phẩy nè 🪭",
      "Kyoto looked like a painting! I walked under a thousand red torii gates at Fushimi Inari. Got you a paper fan 🪭",
    ],
  ),
  s(
    "seoul",
    "🥞",
    ["Seoul", "Seoul"],
    ["Bánh hotteok Seoul", "Seoul hotteok"],
    [
      "Seoul se lạnh, mình mua bánh hotteok nóng hổi ở chợ, nhân đường quế chảy ra thơm lừng. Thổi nguội rồi hẵng ăn nha 🥞",
      "Seoul was chilly, so I grabbed a hot hotteok at the market, oozing cinnamon sugar. Blow on it first 🥞",
    ],
  ),
  s(
    "bangkok",
    "🥭",
    ["Bangkok", "Bangkok"],
    ["Xoài Bangkok", "Bangkok mango"],
    [
      "Bangkok nóng hừng hực! Mình đi chợ nổi và ăn xôi xoài mát lạnh. Mang về cho bạn trái xoài ngọt nhất 🥭",
      "Bangkok was steamy! I visited a floating market and had mango sticky rice. Brought you the sweetest mango 🥭",
    ],
  ),
  s(
    "paris",
    "🥐",
    ["Paris", "Paris"],
    ["Bánh sừng bò Paris", "Paris croissant"],
    [
      "Bonjour từ Paris! Mình ngồi quán cà phê vỉa hè ngắm tháp Eiffel. Bánh sừng bò mới ra lò, giòn tan luôn 🥐",
      "Bonjour from Paris! I sat at a sidewalk café with a view of the Eiffel Tower. Fresh croissant, still flaky 🥐",
    ],
  ),
  s(
    "bali",
    "🌺",
    ["Bali", "Bali"],
    ["Hoa sứ Bali", "Bali frangipani"],
    [
      "Bali yên bình lắm: mình dạo ruộng bậc thang rồi ra biển nghe sóng. Cài cho bạn một bông hoa sứ thơm ngát nè 🌺",
      "Bali was so peaceful: rice terraces, then waves at the beach. Here's a frangipani to tuck behind your ear 🌺",
    ],
  ),
  s(
    "reykjavik",
    "🌌",
    ["Reykjavík", "Reykjavík"],
    ["Thiệp cực quang Reykjavík", "Reykjavík aurora card"],
    [
      "Reykjavík lạnh buốt mà đáng lắm: cực quang xanh lá nhảy múa khắp trời! Mình vẽ lại thành tấm thiệp tặng bạn 🌌",
      "Reykjavík was freezing but so worth it: the northern lights danced green across the sky! I made you a card of them 🌌",
    ],
  ),
  s(
    "swiss",
    "🧀",
    ["Thuỵ Sĩ", "the Swiss Alps"],
    ["Phô mai Thuỵ Sĩ", "Swiss cheese"],
    [
      "Mình leo đồi ở Thuỵ Sĩ, đâu đâu cũng nghe chuông bò kêu leng keng. Mang về cho bạn một miếng phô mai nhiều lỗ 🧀",
      "I hiked in the Swiss Alps, with cowbells jingling everywhere. Brought you a wedge of holey cheese 🧀",
    ],
  ),
];

export const isSouvenirId = (x: unknown): x is SouvenirId => typeof x === "string" && (SOUVENIR_IDS as readonly string[]).includes(x);
export const souvenir = (id: SouvenirId): Souvenir => SOUVENIRS.find((x) => x.id === id) ?? SOUVENIRS[0];
export const placeName = (id: SouvenirId): string => L(souvenir(id).place.vi, souvenir(id).place.en);
export const itemName = (id: SouvenirId): string => L(souvenir(id).item.vi, souvenir(id).item.en);
export const postcardText = (id: SouvenirId): string => L(souvenir(id).postcard.vi, souvenir(id).postcard.en);
export const emojiOf = (id: SouvenirId): string => souvenir(id).emoji;

const MIN = 60_000;
/** A trip lasts 2 hours, or until work ends. */
export const TRIP_MS = 120 * MIN;
/** A souvenir needs at least this long away. */
export const SOUVENIR_AFTER_MS = 30 * MIN;
/** No trip offer in the last hour of work. */
export const OFFER_LEAD_MS = 60 * MIN;
/** What a trip gives when its place's souvenir is already on the shelf. */
export const TRIP_XP = 20;

export interface Trip {
  /** Epoch ms. */
  start: number;
  /** When the sign says the pet is back (epoch ms). */
  back: number;
  place: SouvenirId;
}

export interface TripOfferInput {
  now: number;
  /** Today's end of work (epoch ms). */
  workEnd: number;
  inWork: boolean;
  completed: number;
  target: number;
  /** Tasks still planned for today. */
  left: number;
  /** The day of the last trip. */
  tripDay: string;
  away: boolean;
}

/** Today's plan is done (target reached, nothing left), in work hours, an hour or more before work ends, no trip yet today. */
export function canOfferTrip(x: TripOfferInput): boolean {
  return (
    x.inWork && !x.away && x.target > 0 && x.completed >= x.target && x.left === 0 && x.now <= x.workEnd - OFFER_LEAD_MS && x.tripDay !== dayKey(new Date(x.now))
  );
}

/** When a trip starting `now` ends: 2 hours later, or when work ends (the full 2 hours when work is already over). */
export function backTime(now: number, workEnd: number): number {
  return workEnd >= now + SOUVENIR_AFTER_MS ? Math.min(now + TRIP_MS, workEnd) : now + TRIP_MS;
}

type TripLife = Pick<LifeState, "trip" | "tripDay" | "souvenirs" | "xp" | "week" | "lastWeek" | "weekGreeted">;

/** Sets off somewhere it has no souvenir from yet (`pick` chooses), back in 2 hours or when work ends. */
export function startTrip(s: TripLife, now: number, workEnd: number, pick: number): Trip {
  const fresh = SOUVENIR_IDS.filter((id) => !s.souvenirs.includes(id));
  const pool = fresh.length > 0 ? fresh : SOUVENIR_IDS;
  const place = pool[Math.min(Math.floor(pick * pool.length), pool.length - 1)];
  const trip: Trip = { start: now, back: backTime(now, workEnd), place };
  s.trip = trip;
  s.tripDay = dayKey(new Date(now));
  return trip;
}

export interface TripReturn {
  place: SouvenirId;
  /** Minutes away, up to the planned return. */
  minutes: number;
  /** The new souvenir on the shelf, or null (a short trip, or one already there). */
  souvenir: SouvenirId | null;
  xp: number;
}

/**
 * Comes home. After 30+ minutes away it brings its place's souvenir (or +20 XP when that one is on the shelf
 * already) and the trip counts for the week; a shorter trip brings nothing. Null when it wasn't away.
 */
export function endTrip(s: TripLife, now: number): TripReturn | null {
  const t = s.trip;
  if (!t) return null;
  s.trip = null;
  const away = Math.max(0, Math.min(now, t.back) - t.start);
  const r: TripReturn = { place: t.place, minutes: Math.round(away / MIN), souvenir: null, xp: 0 };
  if (away < SOUVENIR_AFTER_MS) return r;
  if (s.souvenirs.includes(t.place)) {
    r.xp = TRIP_XP;
    s.xp += TRIP_XP;
  } else {
    r.souvenir = t.place;
    s.souvenirs.push(t.place);
  }
  countWeek(s, dayKey(new Date(t.start)), "trips");
  return r;
}

/** A saved trip, or null when it doesn't look like one. */
export function tripFromJson(x: unknown): Trip | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const ok = typeof r.start === "number" && typeof r.back === "number" && Number.isFinite(r.start) && Number.isFinite(r.back) && r.back >= r.start && isSouvenirId(r.place);
  return ok ? { start: r.start as number, back: r.back as number, place: r.place as SouvenirId } : null;
}
