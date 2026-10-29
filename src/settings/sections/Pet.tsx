import { type CSSProperties, useId, useRef } from "react";
import { decorName, homeDecor } from "../../core/craft";
import { L } from "../../core/l10n";
import { meetsUnlock } from "../../core/life";
import { DECOR_IDS, type Lang } from "../../core/types";
import { renderDecor, SPECIES, speciesInfo } from "../../pets";
import { Icon } from "../../ui/icons";
import { PetLive, PetStill } from "../../ui/PetArt";
import { useSettings } from "../context";
import { Group, Page, Row, SwitchRow } from "../controls";
import { PET_SCALE, unlockProgress } from "../model";

const PREVIEW_SIZE = 104;

export function PetSection() {
  const { prefs, update, flush, lang, systemLang } = useSettings();
  const stage = useRef<HTMLDivElement>(null);
  const info = speciesInfo(prefs.species);
  const name = prefs.petName.trim() || "Mochi";
  const systemName = systemLang === "vi" ? "Tiếng Việt" : "English";
  const size = Math.round(PREVIEW_SIZE * prefs.petScale);

  return (
    <Page id="pet" title={L("Thú cưng", "Pet")} intro={L("Chọn người bạn ngồi trên thanh tác vụ cùng bạn.", "Choose who keeps you company on the taskbar.")}>
      <div className="preview card" ref={stage}>
        <div className="preview-stage">
          {/* The art's feet touch y = 150 of 160: pull it down so the pet stands on the taskbar. */}
          <div className="preview-pet" style={{ marginBottom: -Math.round(size / 16) }}>
            <PetLive species={prefs.species} size={size} idPrefix="preview" trackRef={stage} />
          </div>
        </div>
        <div className="preview-meta">
          <p className="preview-name">{name}</p>
          <p className="preview-kind">
            <span aria-hidden="true">{info.emoji}</span> {info.name[lang]}
          </p>
          <p className="preview-hint muted">{L("Rê chuột vào để chào nhé", "Hover to say hi")}</p>
        </div>
        <div className="preview-taskbar" aria-hidden="true">
          <span />
          <span />
          <span className="on" />
          <span />
          <span />
        </div>
      </div>

      <Group title={L("Tên, cỡ và ngôn ngữ", "Name, size and language")}>
        <Row label={L("Tên", "Name")} help={L("Tối đa 24 ký tự.", "Up to 24 characters.")}>
          {({ id, describedBy }) => (
            <input
              id={id}
              className="field name-field"
              type="text"
              value={prefs.petName}
              maxLength={24}
              placeholder="Mochi"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={describedBy}
              onChange={(e) => update({ petName: e.target.value }, true)}
              onBlur={flush}
            />
          )}
        </Row>
        <Row label={L("Kích thước", "Size")} help={L("Bé nhỏ hay to tròn trên thanh tác vụ.", "How big the pet is on the taskbar.")}>
          {({ id, describedBy }) => (
            <span className="range">
              <input
                id={id}
                type="range"
                min={PET_SCALE.min}
                max={PET_SCALE.max}
                step={PET_SCALE.step}
                value={prefs.petScale}
                style={{ "--fill": `${((prefs.petScale - PET_SCALE.min) / (PET_SCALE.max - PET_SCALE.min)) * 100}%` } as CSSProperties}
                aria-describedby={describedBy}
                aria-valuetext={`${Math.round(prefs.petScale * 100)}%`}
                onChange={(e) => update({ petScale: Number(e.target.value) }, true)}
                onPointerUp={flush}
                onKeyUp={flush}
              />
              <output htmlFor={id} className="range-value">
                {Math.round(prefs.petScale * 100)}%
              </output>
            </span>
          )}
        </Row>
        <Row label={L("Ngôn ngữ", "Language")} help={L("Lời thoại, bảng việc và các cửa sổ.", "Speech bubbles, the board and every window.")}>
          {({ id, describedBy }) => (
            <select
              id={id}
              className="field select"
              value={prefs.lang ?? ""}
              aria-describedby={describedBy}
              onChange={(e) => update({ lang: e.target.value === "" ? null : (e.target.value as Lang) })}
            >
              <option value="">{L(`Theo Windows (${systemName})`, `Same as Windows (${systemName})`)}</option>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          )}
        </Row>
      </Group>

      <Group title={L("Góc nhà", "Home corner")}>
        <SwitchRow k="showHome" label={L("Bày góc nhà trên thanh tác vụ", "Show home on the taskbar")} help={<HomeHelp />} />
      </Group>

      <SpeciesPicker />
    </Page>
  );
}

/** What the home corner is, and the decorations it shows now. */
function HomeHelp() {
  const { prefs, life } = useSettings();
  const shown = homeDecor(prefs.homeItems, life.decor);
  return (
    <>
      {L(
        `Tối đa 3 món đồ pet tự đan trong lúc bạn tập trung (đã có ${life.decor.length}/${DECOR_IDS.length}), bày cạnh pet. Chọn món trên bảng việc → Tủ đồ → Góc nhà.`,
        `Up to 3 of the decorations your pet knits while you focus (${life.decor.length} of ${DECOR_IDS.length} so far), set out beside it. Pick them on the board → Wardrobe → Home.`,
      )}
      {shown.length > 0 && (
        <span className={`home-mini${prefs.showHome ? "" : " off"}`}>
          {shown.map((d) => (
            <span key={d} className="home-mini-item" title={decorName(d)} dangerouslySetInnerHTML={{ __html: renderDecor(d, { size: 30, idPrefix: `set-home-${d}` }) }} />
          ))}
        </span>
      )}
    </>
  );
}

function SpeciesPicker() {
  const { prefs, update, life, lang } = useSettings();
  const group = useId();
  const unlocked = SPECIES.filter((s) => !s.unlock || meetsUnlock(s.unlock, life)).length;
  return (
    <section className="group" aria-labelledby={`${group}-title`}>
      <div className="group-title-row">
        <h2 className="group-title" id={`${group}-title`}>
          {L("Loài", "Species")}
        </h2>
        <span className="group-aside">{L(`${unlocked}/${SPECIES.length} đã mở`, `${unlocked} of ${SPECIES.length} unlocked`)}</span>
      </div>
      <div className="species-grid" role="radiogroup" aria-labelledby={`${group}-title`}>
        {SPECIES.map((s) => {
          const locked = !!s.unlock && !meetsUnlock(s.unlock, life);
          const checked = prefs.species === s.id;
          const progress = s.unlock ? unlockProgress(s.unlock, life) : null;
          const reqId = `${group}-${s.id}-req`;
          return (
            <label key={s.id} className={`species${checked ? " on" : ""}${locked ? " locked" : ""}`}>
              <input
                type="radio"
                className="sr-only"
                name={group}
                value={s.id}
                checked={checked}
                disabled={locked && !checked}
                aria-describedby={locked ? reqId : undefined}
                onChange={() => update({ species: s.id })}
              />
              <span className="species-art">
                <PetStill species={s.id} size={64} idPrefix={`sp-${s.id}`} pose={{ mood: "happy", t: 0.6 }} />
                {locked && (
                  <span className="species-lock" aria-hidden="true">
                    <Icon name="lock" size={13} />
                  </span>
                )}
                {checked && (
                  <span className="species-check" aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                )}
              </span>
              <span className="species-name">
                <span aria-hidden="true">{s.emoji}</span> {s.name[lang]}
              </span>
              {locked && s.unlock && progress && (
                <span className="species-req" id={reqId}>
                  <span>{s.unlock.label[lang]}</span>
                  <span className="species-progress">
                    <span className="track" aria-hidden="true">
                      <span className="bar" style={{ width: `${(progress.have / progress.need) * 100}%` }} />
                    </span>
                    <span className="count">
                      <span aria-hidden="true">
                        {progress.have}/{progress.need}
                      </span>
                      <span className="sr-only">{L(`, đã có ${progress.have} trên ${progress.need}`, `, ${progress.have} of ${progress.need} so far`)}</span>
                    </span>
                  </span>
                </span>
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}
