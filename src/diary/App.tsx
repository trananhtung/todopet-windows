// The Diary window: what the pet did each day and why. Read-only; written by the Brain in the overlay.
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Backend } from "../backend/types";
import { nextDayKey, timeString } from "../core/dates";
import { type DiaryEntry, asText, kindIcon, parseEntries, summarize, summaryLine } from "../core/diary";
import { L, setLang } from "../core/l10n";
import { type Prefs, prefsFromJson } from "../core/prefs";
import { Icon } from "../ui/icons";
import { localeTag, resolveLang } from "../ui/lang";
import { PetStill } from "../ui/PetArt";
import { useBackend, useBus, useWindowFocus } from "../ui/useBackend";
import { copyText } from "./clipboard";
import { FILTER_IDS, type FilterId, countByFilter, dayLabel, filterEntries, filterLabel, kindName, longDate, todayKey, withToday } from "./model";

interface Boot {
  prefs: Prefs;
  locale: string;
}

const REFRESH_MS = 30_000;

export function App() {
  const { backend, error } = useBackend();
  const [boot, setBoot] = useState<Boot | null>(null);
  useEffect(() => {
    if (!backend) return;
    let alive = true;
    void Promise.all([backend.storage.load<unknown>("prefs").catch(() => null), backend.system.systemLocale().catch(() => "en-US")]).then(
      ([raw, locale]) => alive && setBoot({ prefs: prefsFromJson(raw), locale }),
    );
    return () => {
      alive = false;
    };
  }, [backend]);

  if (error) {
    return (
      <div className="boot-error" role="alert">
        <Icon name="warning" size={20} />
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
  if (!backend || !boot) return <div className="boot" aria-busy="true" />;
  return <Diary backend={backend} boot={boot} />;
}

function Diary({ backend, boot }: { backend: Backend; boot: Boot }) {
  const [prefs, setPrefs] = useState(boot.prefs);
  const lang = resolveLang(prefs.lang, boot.locale);
  setLang(lang);

  const [today, setToday] = useState(() => todayKey());
  const [days, setDays] = useState<string[]>(() => [todayKey()]);
  const [day, setDay] = useState(() => todayKey());
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [active, setActive] = useState<ReadonlySet<FilterId>>(() => new Set());
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    document.documentElement.lang = localeTag(lang);
    document.title = L("Nhật ký TodoPet", "TodoPet Diary");
  }, [lang]);

  const load = useCallback(
    async (which: string) => {
      const ticket = ++request.current;
      const now = todayKey();
      const [list, lines] = await Promise.all([backend.diary.days().catch(() => [] as string[]), backend.diary.read(which).catch(() => [] as string[])]);
      if (ticket !== request.current) return;
      setToday(now);
      setDays(withToday(list, now));
      setEntries(parseEntries(lines).sort((a, b) => a.at - b.at));
    },
    [backend],
  );

  const reloadPrefs = useCallback(async () => {
    const raw = await backend.storage.load<unknown>("prefs").catch(() => null);
    if (raw !== null) setPrefs(prefsFromJson(raw));
  }, [backend]);

  useEffect(() => {
    void load(day);
  }, [day, load]);

  // Today's page keeps itself current; older days don't change.
  useEffect(() => {
    if (day !== today) return;
    const id = setInterval(() => void load(day), REFRESH_MS);
    return () => clearInterval(id);
  }, [day, today, load]);

  useBus(backend, (e) => {
    if (e.type === "diary-changed") void load(day);
    else if (e.type === "prefs-changed") void reloadPrefs();
  });
  useWindowFocus(() => {
    void load(day);
    void reloadPrefs();
  });

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 2200);
    return () => clearTimeout(id);
  }, [copied]);

  const pick = (d: string, focus = false) => {
    if (d !== day) {
      setEntries(null);
      setActive(new Set());
      setCopied(null);
      setDay(d);
    }
    if (focus) document.getElementById(`day-${d}`)?.focus();
  };

  const onDaysKey = (e: KeyboardEvent) => {
    const i = days.indexOf(day);
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? days.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    pick(days[Math.max(0, Math.min(days.length - 1, next))], true);
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(day), reloadPrefs(), new Promise((r) => setTimeout(r, 400))]);
    setRefreshing(false);
  };

  const copy = async () => {
    if (!entries) return;
    setCopied((await copyText(asText(day, entries))) ? "ok" : "error");
  };

  const toggle = (id: FilterId) =>
    setActive((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const counts = useMemo(() => countByFilter(entries ?? []), [entries]);
  const shown = useMemo(() => filterEntries(entries ?? [], active), [entries, active]);
  const head = dayLabel(day, today, lang);

  return (
    <div className="shell diary-shell">
      <aside className="sidebar">
        <div className="brand">
          <PetStill species={prefs.species} size={36} idPrefix="brand" pose={{ mood: "happy", t: 0.6 }} className="brand-pet" />
          <div className="brand-text">
            <span className="brand-name">TodoPet</span>
            <span className="brand-sub">{L("Nhật ký", "Diary")}</span>
          </div>
        </div>
        <div className="days" role="tablist" aria-orientation="vertical" aria-label={L("Các ngày", "Days")} onKeyDown={onDaysKey}>
          {days.map((d) => {
            const label = dayLabel(d, today, lang);
            return (
              <button
                key={d}
                id={`day-${d}`}
                type="button"
                role="tab"
                className={`nav-item day-item${d === today ? " is-today" : ""}`}
                aria-selected={d === day}
                aria-controls="diary-panel"
                tabIndex={d === day ? 0 : -1}
                onClick={() => pick(d)}
              >
                <span className="day-title">{label.title}</span>
                <span className="day-date">{label.date}</span>
              </button>
            );
          })}
        </div>
        <p className="days-note">{L("Lưu trên máy này 14 ngày", "Kept on this PC for 14 days")}</p>
      </aside>

      <main className="content" id="diary-panel" role="tabpanel" aria-labelledby={`day-${day}`}>
        <div className="page" key={day}>
          <header className="diary-head">
            <div className="diary-head-text">
              <h1>{head.title}</h1>
              <p className="diary-date">{longDate(day, lang, day === today || nextDayKey(day) === today)}</p>
            </div>
            <div className="diary-actions">
              <button className="btn" type="button" onClick={() => void refresh()} disabled={refreshing}>
                <Icon name="refresh" size={16} className={refreshing ? "spin" : undefined} />
                {L("Làm mới", "Refresh")}
              </button>
              <button
                className={`btn primary copy-btn${copied === "ok" ? " done" : ""}`}
                type="button"
                onClick={() => void copy()}
                disabled={!entries || entries.length === 0}
                title={L("Chép cả ngày dạng văn bản, để dán vào Claude", "Copy the whole day as text, ready to paste into Claude")}
              >
                <Icon name={copied === "ok" ? "check" : "copy"} size={16} />
                {copied === "ok" ? L("Đã chép", "Copied") : L("Chép", "Copy")}
              </button>
            </div>
          </header>
          <p className="sr-only" role="status">
            {copied === "ok" ? L("Đã chép nhật ký vào bộ nhớ tạm.", "The diary was copied to the clipboard.") : ""}
          </p>
          {copied === "error" && (
            <p className="notice error diary-notice" role="alert">
              <Icon name="warning" size={15} />
              {L("Không chép được vào bộ nhớ tạm.", "Couldn't copy to the clipboard.")}
            </p>
          )}

          {!prefs.keepLog && <LogOffBanner backend={backend} />}

          {entries === null ? (
            <div className="diary-loading" aria-busy="true" />
          ) : entries.length === 0 ? (
            <EmptyDay isToday={day === today} species={prefs.species} />
          ) : (
            <>
              <div className="summary card">
                <Icon name="book" size={18} />
                <p>{summaryLine(summarize(entries))}</p>
              </div>

              <div className="filters" role="group" aria-label={L("Lọc theo loại", "Filter by kind")}>
                <button type="button" className="filter-chip" aria-pressed={active.size === 0} onClick={() => setActive(new Set())}>
                  {L("Tất cả", "All")}
                  <span className="count">{entries.length}</span>
                </button>
                {FILTER_IDS.filter((id) => counts[id] > 0 || active.has(id)).map((id) => (
                  <button key={id} type="button" className="filter-chip" aria-pressed={active.has(id)} onClick={() => toggle(id)}>
                    {filterLabel(id)}
                    <span className="count">{counts[id]}</span>
                  </button>
                ))}
              </div>

              {shown.length === 0 ? (
                <div className="no-match">
                  <p>{L("Không có mục nào thuộc loại này.", "Nothing of this kind on this day.")}</p>
                  <button className="btn small" type="button" onClick={() => setActive(new Set())}>
                    {L("Hiện tất cả", "Show everything")}
                  </button>
                </div>
              ) : (
                <ol className="timeline" aria-label={L("Các mục nhật ký", "Diary entries")}>
                  {shown.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="entry" data-kind={e.kind}>
                      <time className="entry-time" dateTime={new Date(e.at).toISOString()}>
                        {timeString(new Date(e.at))}
                      </time>
                      <span className="entry-icon" aria-hidden="true">
                        {kindIcon[e.kind] ?? "•"}
                      </span>
                      <p className="entry-text">
                        <span className="sr-only">{kindName(e.kind)}: </span>
                        {e.text}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyDay({ isToday, species }: { isToday: boolean; species: Prefs["species"] }) {
  return (
    <div className="empty">
      <PetStill species={species} size={112} idPrefix="empty" pose={{ mood: "sleeping", t: 1.2 }} className="empty-pet" />
      <h2>{isToday ? L("Hôm nay chưa có gì", "Nothing written yet today") : L("Ngày này trống trơn", "Nothing written that day")}</h2>
      <p>
        {L(
          "Nhật ký ghi lại mỗi lời nhắc và lý do, bạn đã phản hồi thế nào, những lời nhắc được giữ lại khi bạn bận, cuộc họp, phiên tập trung, tâm trạng và những lúc xao nhãng.",
          "The diary notes every reminder and why it fired, what you did with it, reminders held back while you were busy, meetings, focus sessions, moods and distractions.",
        )}
      </p>
      <p className="empty-small">
        <Icon name="shield" size={15} />
        {L("Chỉ lưu trên máy này, trong 14 ngày.", "It stays on this PC for 14 days.")}
      </p>
    </div>
  );
}

function LogOffBanner({ backend }: { backend: Backend }) {
  return (
    <div className="log-off" role="status">
      <Icon name="info" size={17} />
      <p>{L("Nhật ký đang tắt: không có gì mới được ghi.", "The diary is turned off: nothing new is being written.")}</p>
      <button className="btn small" type="button" onClick={() => void backend.system.openWindow("settings")}>
        {L("Mở Cài đặt", "Open Settings")}
      </button>
    </div>
  );
}
