// The Settings window: sidebar of sections, one page at a time, every change saved as you make it.
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { Backend, SecretsStatus } from "../backend/types";
import { L, langFromLocale, setLang } from "../core/l10n";
import { type LifeState, lifeFromJson } from "../core/life";
import { type Prefs, prefsFromJson } from "../core/prefs";
import { Icon, type IconName } from "../ui/icons";
import { localeTag, resolveLang } from "../ui/lang";
import { PetStill } from "../ui/PetArt";
import { useBackend, useBus, useWindowFocus } from "../ui/useBackend";
import { type SettingsApi, SettingsContext } from "./context";
import { SECTION_IDS, type SectionId, sectionFromHash } from "./model";
import { PrefsSaver, type SaveState } from "./saver";
import { AboutSection } from "./sections/About";
import { BehaviorSection } from "./sections/Behavior";
import { CalendarSection } from "./sections/Calendar";
import { DistractionsSection } from "./sections/Distractions";
import { PetSection } from "./sections/Pet";
import { PostponedSection } from "./sections/Postponed";
import { FocusSection, WorkdaySection } from "./sections/Schedule";
import { TodoistSection } from "./sections/Todoist";

interface Loaded {
  prefs: Prefs;
  life: LifeState;
  secrets: SecretsStatus;
  locale: string;
}

const NO_SECRETS: SecretsStatus = { todoist: false, anthropic: false };

async function loadAll(backend: Backend): Promise<Loaded> {
  const [rawPrefs, rawLife, secrets, locale] = await Promise.all([
    backend.storage.load<unknown>("prefs").catch(() => null),
    backend.storage.load<unknown>("life").catch(() => null),
    backend.secrets.status().catch(() => NO_SECRETS),
    backend.system.systemLocale().catch(() => "en-US"),
  ]);
  return { prefs: prefsFromJson(rawPrefs), life: lifeFromJson(rawLife), secrets, locale };
}

export function App() {
  const { backend, error } = useBackend();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!backend) return;
    let alive = true;
    void loadAll(backend).then((d) => alive && setLoaded(d));
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
  if (!backend || !loaded) return <div className="boot" aria-busy="true" />;
  return <Settings backend={backend} initial={loaded} />;
}

const NAV: Record<SectionId, { icon: IconName; label: () => string }> = {
  pet: { icon: "paw", label: () => L("Thú cưng", "Pet") },
  todoist: { icon: "checkCircle", label: () => "Todoist" },
  workday: { icon: "briefcase", label: () => L("Ngày làm việc", "Work day") },
  focus: { icon: "timer", label: () => L("Tập trung", "Focus") },
  distractions: { icon: "eye", label: () => L("Xao nhãng", "Distractions") },
  calendar: { icon: "calendar", label: () => L("Lịch", "Calendar") },
  postponed: { icon: "hourglass", label: () => L("Việc bị hoãn", "Postponed tasks") },
  behavior: { icon: "sliders", label: () => L("Tính cách", "Behavior") },
  about: { icon: "info", label: () => L("Giới thiệu", "About") },
};

const PAGES: Record<SectionId, () => ReactNode> = {
  pet: () => <PetSection />,
  todoist: () => <TodoistSection />,
  workday: () => <WorkdaySection />,
  focus: () => <FocusSection />,
  distractions: () => <DistractionsSection />,
  calendar: () => <CalendarSection />,
  postponed: () => <PostponedSection />,
  behavior: () => <BehaviorSection />,
  about: () => <AboutSection />,
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Settings({ backend, initial }: { backend: Backend; initial: Loaded }) {
  const [prefs, setPrefs] = useState(initial.prefs);
  const [life, setLife] = useState(initial.life);
  const [secrets, setSecrets] = useState(initial.secrets);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [section, setSection] = useState<SectionId>(() => sectionFromHash(window.location.hash));
  const latest = useRef(prefs);
  const content = useRef<HTMLElement>(null);

  const [saver] = useState(
    () =>
      new PrefsSaver(initial.prefs, {
        save: (p) => backend.storage.save("prefs", p),
        emit: (e) => backend.bus.emit(e),
        onState: setSaveState,
      }),
  );

  // Never lose the last keystrokes when the window closes.
  useEffect(() => {
    const flush = () => void saver.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [saver]);

  const lang = resolveLang(prefs.lang, initial.locale);
  setLang(lang);
  useEffect(() => {
    document.documentElement.lang = localeTag(lang);
    document.title = L("Cài đặt TodoPet", "TodoPet Settings");
  }, [lang]);

  const update = useCallback(
    (patch: Partial<Prefs>, debounce = false) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setPrefs(next);
      saver.push(next, debounce);
    },
    [saver],
  );

  const reloadPrefs = useCallback(async () => {
    if (saver.busy) return;
    const raw = await backend.storage.load<unknown>("prefs").catch(() => null);
    if (raw === null || saver.busy) return;
    const loaded = prefsFromJson(raw, latest.current.firstLaunch);
    // Our own save coming back (stored text may have stray spaces that loading trims): keep what's on screen.
    if (sameJson(loaded, prefsFromJson(saver.lastSaved, latest.current.firstLaunch))) return;
    saver.reset(loaded);
    latest.current = loaded;
    setPrefs(loaded);
  }, [backend, saver]);

  const reloadLife = useCallback(async () => {
    const raw = await backend.storage.load<unknown>("life").catch(() => null);
    setLife((old) => {
      const next = lifeFromJson(raw);
      return sameJson(old, next) ? old : next;
    });
  }, [backend]);

  const refreshSecrets = useCallback(async () => {
    const s = await backend.secrets.status().catch(() => null);
    if (s) setSecrets((old) => (sameJson(old, s) ? old : s));
  }, [backend]);

  useBus(backend, (e) => {
    if (e.type === "prefs-changed" || e.type === "species-changed") void reloadPrefs();
    else if (e.type === "life-changed") void reloadLife();
    else if (e.type === "secrets-changed") void refreshSecrets();
  });
  useWindowFocus(() => {
    void reloadPrefs();
    void reloadLife();
    void refreshSecrets();
  });

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (id: SectionId, focusTab = false) => {
    setSection(id);
    history.replaceState(null, "", `#${id}`);
    content.current?.scrollTo({ top: 0 });
    if (focusTab) document.getElementById(`tab-${id}`)?.focus();
  };

  const onNavKey = (e: KeyboardEvent) => {
    const i = SECTION_IDS.indexOf(section);
    const to =
      e.key === "ArrowDown" ? (i + 1) % SECTION_IDS.length
      : e.key === "ArrowUp" ? (i - 1 + SECTION_IDS.length) % SECTION_IDS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? SECTION_IDS.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    go(SECTION_IDS[to], true);
  };

  const api: SettingsApi = {
    backend,
    prefs,
    update,
    flush: () => void saver.flush(),
    life,
    secrets,
    refreshSecrets,
    lang,
    systemLang: langFromLocale(initial.locale),
  };

  return (
    <SettingsContext value={api}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <PetStill species={prefs.species} size={36} idPrefix="brand" pose={{ mood: "happy", t: 0.6 }} className="brand-pet" />
            <div className="brand-text">
              <span className="brand-name">TodoPet</span>
              <span className="brand-sub">{L("Cài đặt", "Settings")}</span>
            </div>
          </div>
          <nav className="nav" role="tablist" aria-orientation="vertical" aria-label={L("Mục cài đặt", "Settings sections")} onKeyDown={onNavKey}>
            {SECTION_IDS.map((id) => {
              const label = NAV[id].label();
              return (
                <button
                  key={id}
                  id={`tab-${id}`}
                  type="button"
                  role="tab"
                  className="nav-item"
                  aria-selected={id === section}
                  aria-controls="settings-panel"
                  tabIndex={id === section ? 0 : -1}
                  title={label}
                  onClick={() => go(id)}
                >
                  <Icon name={NAV[id].icon} size={18} />
                  <span className="nav-label">{label}</span>
                </button>
              );
            })}
          </nav>
          <SaveStatus state={saveState} />
        </aside>
        <main className="content" id="settings-panel" role="tabpanel" aria-labelledby={`tab-${section}`} ref={content}>
          {PAGES[section]()}
        </main>
      </div>
    </SettingsContext>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "error") {
    return (
      <p className="save-status error" role="alert">
        <Icon name="warning" size={15} />
        <span className="save-text">{L("Không lưu được", "Couldn't save")}</span>
      </p>
    );
  }
  const busy = state === "pending" || state === "saving";
  return (
    <p className={`save-status${busy ? " busy" : ""}${state === "saved" ? " saved" : ""}`}>
      <Icon name={busy ? "refresh" : "check"} size={15} />
      <span className="save-text">
        {busy ? L("Đang lưu…", "Saving…") : state === "saved" ? L("Đã lưu", "Saved") : L("Tự động lưu", "Saves automatically")}
      </span>
    </p>
  );
}
