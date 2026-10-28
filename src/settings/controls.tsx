// Building blocks for settings pages: groups of rows in a card, each row labelled and described.
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { Prefs } from "../core/prefs";
import { Icon } from "../ui/icons";
import { useSettings } from "./context";
import { NUMBER_LIMITS, type NumberKey, parseBounded } from "./model";

type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];
type TextKey = { [K in keyof Prefs]: Prefs[K] extends string ? K : never }[keyof Prefs];

export function Page({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1 id={`${id}-title`}>{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </header>
      {children}
    </div>
  );
}

export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section className={className ? `group ${className}` : "group"} aria-labelledby={title ? id : undefined}>
      {title && (
        <h2 className="group-title" id={id}>
          {title}
        </h2>
      )}
      <div className="card group-card">{children}</div>
    </section>
  );
}

/** Label and help on the left, a compact control on the right. `children` gets the control's id. */
export function Row({
  label,
  help,
  warn,
  children,
}: {
  label: string;
  help?: ReactNode;
  warn?: string | null;
  children: (ids: { id: string; labelId: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const warnId = `${id}-warn`;
  const describedBy = [help ? helpId : "", warn ? warnId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="row">
      <div className="row-text">
        <label className="row-label" htmlFor={id} id={labelId}>
          {label}
        </label>
        {help && (
          <p className="row-help" id={helpId}>
            {help}
          </p>
        )}
        {warn && (
          <p className="row-warn" id={warnId}>
            <Icon name="warning" size={14} />
            {warn}
          </p>
        )}
      </div>
      <div className="row-control">{children({ id, labelId, describedBy })}</div>
    </div>
  );
}

/** Label and help above a full-width field (text boxes, lists, links). */
export function StackRow({
  label,
  help,
  children,
  after,
}: {
  label: string;
  help?: ReactNode;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
  after?: ReactNode;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="row stack">
      <label className="row-label" htmlFor={id}>
        {label}
      </label>
      {help && (
        <p className="row-help" id={helpId}>
          {help}
        </p>
      )}
      <div className="stack-control">{children({ id, describedBy: help ? helpId : undefined })}</div>
      {after}
    </div>
  );
}

export function SwitchRow({ k, label, help, disabled }: { k: BoolKey; label: string; help?: ReactNode; disabled?: boolean }) {
  const { prefs, update } = useSettings();
  return (
    <Row label={label} help={help}>
      {({ id, describedBy }) => (
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="switch"
          checked={prefs[k]}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => update({ [k]: e.target.checked } as Partial<Prefs>)}
        />
      )}
    </Row>
  );
}

/** A number box that lets you type freely, stores the clamped value, and tidies itself on blur. */
export function NumberField({
  id,
  value,
  min,
  max,
  unit,
  describedBy,
  onCommit,
  onBlur,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  describedBy?: string;
  onCommit(n: number): void;
  onBlur?(): void;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  return (
    <span className="num">
      <input
        id={id}
        className="field num-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text}
        aria-describedby={describedBy}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseBounded(e.target.value, min, max);
          if (n !== null && n !== value) onCommit(n);
        }}
        onBlur={() => {
          focused.current = false;
          const n = parseBounded(text, min, max) ?? value;
          setText(String(n));
          if (n !== value) onCommit(n);
          onBlur?.();
        }}
      />
      {unit && (
        <span className="num-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </span>
  );
}

export function NumberRow({
  k,
  label,
  help,
  unit,
  warn,
}: {
  k: NumberKey;
  label: string;
  help?: ReactNode;
  unit?: string;
  warn?: string | null;
}) {
  const { prefs, update, flush } = useSettings();
  const { min, max } = NUMBER_LIMITS[k];
  return (
    <Row label={label} help={help} warn={warn}>
      {({ id, describedBy }) => (
        <NumberField
          id={id}
          value={prefs[k]}
          min={min}
          max={max}
          unit={unit}
          describedBy={describedBy}
          onCommit={(n) => update({ [k]: n } as Partial<Prefs>, true)}
          onBlur={flush}
        />
      )}
    </Row>
  );
}

export function TextField({
  id,
  k,
  describedBy,
  placeholder,
  maxLength,
  mono,
  multiline,
  rows,
  noWrap,
}: {
  id: string;
  k: TextKey;
  describedBy?: string;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
  multiline?: boolean;
  rows?: number;
  /** Long lines scroll sideways instead of wrapping (one link per line). */
  noWrap?: boolean;
}) {
  const { prefs, update, flush } = useSettings();
  const common = {
    id,
    className: mono ? "field mono" : "field",
    value: prefs[k],
    placeholder,
    maxLength,
    spellCheck: false,
    autoComplete: "off",
    "aria-describedby": describedBy,
    onBlur: flush,
  };
  return multiline ? (
    <textarea {...common} rows={rows ?? 3} wrap={noWrap ? "off" : undefined} onChange={(e) => update({ [k]: e.target.value } as Partial<Prefs>, true)} />
  ) : (
    <input {...common} type="text" onChange={(e) => update({ [k]: e.target.value } as Partial<Prefs>, true)} />
  );
}

/** A row of mutually exclusive choices (radio buttons styled as a segmented control). */
export function Segmented<T extends string>({
  labelledBy,
  value,
  options,
  onChange,
  describedBy,
}: {
  labelledBy: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
  describedBy?: string;
}) {
  const name = useId();
  return (
    <div className="segmented" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {options.map((o) => (
        <label key={o.value} className={o.value === value ? "seg on" : "seg"}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/** A link that opens in the default browser through the backend (Tauri windows can't navigate away). */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const { backend } = useSettings();
  return (
    <a
      className={className ? `ext-link ${className}` : "ext-link"}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => {
        e.preventDefault();
        void backend.system.openUrl(href);
      }}
    >
      {children}
      <Icon name="external" size={13} />
    </a>
  );
}

/** Inline result of an action: a success tick, or an error read out by screen readers. */
export function Notice({ kind, children }: { kind: "ok" | "error" | "info"; children: ReactNode }) {
  return (
    <p className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon name={kind === "ok" ? "check" : kind === "error" ? "warning" : "info"} size={15} />
      <span>{children}</span>
    </p>
  );
}
