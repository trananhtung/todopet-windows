import { useEffect, useState, useSyncExternalStore } from "react";
import type { DemoBackend } from "../backend/demo";
import type { Backend } from "../backend/types";
import type { Brain } from "../core/brain";
import { dayKey } from "../core/dates";
import { getLang, L } from "../core/l10n";
import { meetsUnlock } from "../core/life";
import { SPECIES_IDS, type SpeciesId } from "../core/types";
import { speciesInfo } from "../pets";

/** A fake Windows desktop and taskbar, so the overlay can be tried in a plain browser. */
export function DemoDesktop({ brain }: { brain: Brain }) {
  // The taskbar's clock is the demo's (it moves with "Next morning" and "Friday"), and follows every beat of the pet.
  useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const now = new Date(brain.clockNow());
  return (
    <div className="demo-desktop" aria-hidden>
      <div className="demo-window">
        <p>{L("Ghi chú kế hoạch quý 4", "Q4 planning notes")}</p>
        <p>{L("— Gửi báo cáo tuần trước bữa trưa.", "— Ship the weekly report before lunch.")}</p>
        <p>{L("— Gọi khách hàng ABC về việc gia hạn.", "— Call client ABC about the renewal.")}</p>
        <p>{L("— Trả lời email ngân sách (để lâu lắm rồi…).", "— Reply to the budget email (it's been waiting a while…).")}</p>
      </div>
      <div className="demo-taskbar">
        <span>🪟</span>
        <span>🔎</span>
        <span className="on">📝</span>
        <span>🌐</span>
        <span>📁</span>
        <span>✉️</span>
        <span className="clock">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <br />
          {now.toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

const isDemoBackend = (b: Backend): b is DemoBackend => "demo" in b;

/** Demo controls: fake what Windows would report and trigger the pet's stunts right away. */
const YOUTUBE = { name: "Google Chrome", exe: "chrome.exe", title: "Funny cats - YouTube - Google Chrome" };
const YOUTUBE_URL = "https://www.youtube.com/watch?v=cats";
const FIGMA = { name: "Figma", exe: "figma.exe", title: "Landing page - Figma" };
const DOCS = { name: "Google Chrome", exe: "chrome.exe", title: "Q4 plan - Google Docs - Google Chrome" };
const DOCS_URL = "https://docs.google.com/document/d/q4-plan/edit#heading=h.1";

/** The coming Friday at 16:30 (today, when today is Friday): a good moment to wrap up the week. */
function friday(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  d.setHours(16, 30, 0, 0);
  return d.getTime();
}

export function DemoPanel({ brain, backend }: { brain: Brain; backend: Backend }) {
  const s = useSyncExternalStore(brain.subscribe, brain.getSnapshot);
  const [open, setOpen] = useState(true);
  const [heavy, setHeavy] = useState(false);
  // The demo's clock can be moved (the next morning, a Friday); `friday` is whether it is on the Friday that shows "Monday".
  const [, setMoved] = useState(0);
  const [onFriday, setOnFriday] = useState(false);
  const fake = isDemoBackend(backend) ? backend.demo : null;
  // One trip a day: once today's is over the button says so (an early call-back frees the day again).
  const tripDone = !s.trip && s.life.tripDay === dayKey(new Date(brain.clockNow()));
  /** Moves the clock and lets the pet notice: the day changes, the tasks you moved come back, the morning greeting. */
  const jumpTo = (ms: number | null, weekends: boolean) => {
    if (!fake) return;
    brain.setDemoWeekends(weekends);
    fake.setClock(ms);
    setMoved((n) => n + 1);
    brain.tick();
    // The day settles and the tasks sync first; the greeting comes with the next beat.
    setTimeout(() => brain.tick(), 1500);
    setTimeout(() => brain.tick(), 4000);
  };
  // Pretend you've been on YouTube for 3 minutes, so the mood drop and the reminder show at once.
  const watchYouTube = () => {
    fake?.setForeground(YOUTUBE, YOUTUBE_URL);
    brain.demoDistract("youtube.com");
  };

  return (
    <div className="demo-panel" data-hit="">
      <h3>
        {L("Bảng demo", "Demo controls")}
        <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "–" : "+"}
        </button>
      </h3>
      {open && (
        <>
          <div className="grid">
            <button className="btn" onClick={() => s.next && void brain.complete(s.next)} disabled={!s.next}>
              ✓ {L("Xong 1 việc", "Finish a task")}
            </button>
            <button className="btn" onClick={() => brain.demoCelebrate()}>
              🎉 {L("Ăn mừng", "Celebrate")}
            </button>
            {fake && (
              <>
                <button className="btn" title={L("Giả vờ bạn đã xem YouTube 3 phút", "Pretend you've been on YouTube for 3 minutes")} onClick={watchYouTube}>
                  📺 YouTube
                </button>
                <button className="btn" onClick={() => fake.setForeground(null)}>
                  💼 {L("Làm việc", "Work app")}
                </button>
              </>
            )}
            {fake && (
              <button className="btn" title={L("Giả vờ mở Figma (để thử “Bắt đầu khi mở…”)", "Pretend Figma comes to the front (to try “Start when I open…”)")} onClick={() => fake.setForeground(FIGMA)}>
                🎨 Figma
              </button>
            )}
            {fake && (
              <button className="btn" title={L("Giả vờ đang mở một trang Google Docs (để thấy nút Mở lại)", "Pretend a Google Docs page is in front (to see Reopen)")} onClick={() => fake.setForeground(DOCS, DOCS_URL)}>
                🌐 Docs
              </button>
            )}
            <button className="btn" title={L("Giả vờ bạn vừa rời máy 8 phút và quay lại: thẻ “bạn đang làm gì”", "Pretend you were away for 8 minutes and are back: the resume card")} onClick={() => brain.demoComeBack()}>
              ↩ {L("Quay lại", "Come back")}
            </button>
            <button className="btn" title={L("Cuộc họp sắp bắt đầu, kèm việc liên quan", "A meeting starting soon, with its related tasks")} onClick={() => brain.demoMeetingSoon()}>
              📅 {L("Sắp họp", "Meeting soon")}
            </button>
            <button className="btn" title={L("Cuộc họp vừa kết thúc, họp tiếp sau 12 phút", "A meeting just ended; the next one is in 12 minutes")} onClick={() => brain.demoMeetingEnds()}>
              📅 {L("Họp xong", "Meeting ends")}
            </button>
            <button className="btn" title={L("Mở bảng “Tổng kết ngày” (cuối ngày) ở bất kỳ giờ nào", "Open the end-of-day “Wrap up” sheet, at any hour")} onClick={() => brain.demoWrapUp()}>
              🌙 {L("Tổng kết", "Wrap up")}
            </button>
            <button className="btn" title={L("Lời nhắc cuối ngày (mở bảng Tổng kết), bỏ qua khoảng cách giữa các bong bóng", "The end-of-day review bubble (it opens Wrap up), past the gap between bubbles")} onClick={() => brain.demoReview()}>
              🔔 {L("Cuối ngày", "Day's end")}
            </button>
            {fake && (
              <button
                className="btn"
                title={L("Sang sáng hôm sau: việc đã dời sang mai thành việc hôm nay, kèm lời chào, con ếch và ghi chú", "Wake up the next morning: what you moved to tomorrow is today's task, with the greeting, the frog and the note")}
                onClick={() => jumpTo(brain.nextMorning(), onFriday)}
              >
                ☀️ {L("Sáng mai", "Next morning")}
              </button>
            )}
            {fake && (
              <button
                className="btn"
                aria-pressed={onFriday}
                title={
                  onFriday
                    ? L("Về lại hôm nay (cuối tuần lại là ngày làm việc)", "Back to today (weekends are workdays again)")
                    : L("Thứ Sáu 16:30, cuối tuần là ngày nghỉ: “Mai” thành “Thứ Hai”", "Friday 16:30, with weekends off: “tomorrow” becomes “Monday”")
                }
                onClick={() => {
                  setOnFriday(!onFriday);
                  jumpTo(onFriday ? null : friday(fake.now()), !onFriday);
                }}
              >
                📆 {onFriday ? L("Hôm nay", "Back to today") : L("Thứ Sáu", "Friday")}
              </button>
            )}
            {fake?.clockMoved() && !onFriday && (
              <button
                className="btn"
                title={L("Trả đồng hồ demo về giờ thật", "Put the demo's clock back to the real time")}
                onClick={() => {
                  jumpTo(null, false);
                  setOnFriday(false);
                }}
              >
                ↺ {L("Giờ thật", "Real time")}
              </button>
            )}
            {fake && (
              <button
                className="btn"
                aria-pressed={heavy}
                title={heavy ? L("Trả hôm nay về bình thường", "Put today back to normal") : L("Cho các việc hôm nay chạy dài hơn quỹ thời gian: cảnh báo quá tải", "Give today's tasks long durations, more than the time left: the overbooked warning")}
                onClick={() => {
                  fake.setHeavyDay(!heavy);
                  setHeavy(!heavy);
                  void brain.demoOverbooked(!heavy);
                }}
              >
                ⚖️ {heavy ? L("Ngày thường", "Normal day") : L("Quá tải", "Overbooked")}
              </button>
            )}
            <button className="btn" onClick={() => brain.demoAntic("parade")}>
              📢 {L("Diễu hành", "Parade")}
            </button>
            <button
              className="btn"
              onClick={() => {
                watchYouTube();
                brain.demoAntic("block");
              }}
            >
              ┻━┻ {L("Lật bàn", "Table flip")}
            </button>
            <button className="btn" onClick={() => brain.demoAntic("grumble")}>
              😤 {L("Càu nhàu", "Grumble")}
            </button>
            <button className="btn" onClick={() => (s.focus ? brain.stopFocus() : brain.startFocus(null, 1))}>
              🍅 {s.focus ? L("Dừng", "Stop") : L("Tập trung 1'", "Focus 1'")}
            </button>
            {fake && (
              <button
                className="btn"
                onClick={() => {
                  // Asleep because the day is wrapped up: wake it the way the board does.
                  if (s.doneUntil !== null) brain.resumeDay();
                  else fake.setIdle(s.mood === "sleeping" ? 0 : 700);
                }}
              >
                😴 {s.mood === "sleeping" ? L("Thức dậy", "Wake up") : L("Rời máy", "Step away")}
              </button>
            )}
            <button className="btn" title={L("Giả vờ hôm qua chưa xong việc nào, rồi sang ngày mới", "Pretend nothing got done yesterday, then wake up to it")} onClick={() => brain.demoMissDay()}>
              🍪 {L("Lỡ một ngày", "Miss a day")}
            </button>
            <button
              className="btn"
              title={tripDone ? L("Hôm nay pet đi chơi rồi, mai đi tiếp nha", "The pet already went today: one trip a day") : L("Pet đi chơi (mỗi ngày một chuyến)", "Send the pet on today's trip (one a day)")}
              disabled={tripDone}
              onClick={() => (s.trip ? brain.callBack() : brain.goOnTrip())}
            >
              🎒 {s.trip ? L("Gọi về", "Call back") : tripDone ? L("Hôm nay đi rồi", "Trip done today") : L("Đi phiêu lưu", "Go on a trip")}
            </button>
            <button className="btn" title={L("Thêm 2 người bạn mẫu (thẻ làm từ dữ liệu mẫu), có chuỗi bạn và quái vật tuần này", "Add 2 sample friends (cards made from sample data), with buddy streaks and this week's boss")} onClick={() => void brain.demoAddFriends()}>
              👥 {L("Thêm 2 bạn", "Add 2 friends")}
            </button>
            <button
              className="btn"
              disabled={s.friends.length === 0}
              title={s.friends.length === 0 ? L("Thêm bạn trước đã", "Add friends first") : L("Pet của một người bạn ghé chơi ngay bây giờ", "A friend's pet drops by right now")}
              onClick={() => brain.demoVisit()}
            >
              👋 {L("Bạn ghé chơi", "Friend drops by")}
            </button>
            <button className="btn" onClick={() => brain.tick()}>
              ⏱ {L("Chạy luật", "Run rules")}
            </button>
            {s.hiddenUntil !== null && (
              <button className="btn" onClick={() => brain.hide(null)}>
                🙈 {L("Hiện pet", "Show pet")}
              </button>
            )}
          </div>
          <label className="sr-only" htmlFor="demo-species">
            {L("Loài", "Species")}
          </label>
          <select
            id="demo-species"
            className="field"
            value={s.prefs.species}
            onChange={(e) => void brain.setSpecies(e.target.value as SpeciesId)}
          >
            {SPECIES_IDS.map((id) => {
              const info = speciesInfo(id);
              const locked = !meetsUnlock(info.unlock, s.life);
              return (
                <option key={id} value={id}>
                  {info.emoji} {info.name[getLang()]}
                  {locked ? " 🔒" : ""}
                </option>
              );
            })}
          </select>
        </>
      )}
    </div>
  );
}
