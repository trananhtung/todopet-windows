// A small line-icon set for the Settings and Diary windows (20×20, drawn with currentColor).
import type { ReactElement } from "react";

const PATHS = {
  paw: (
    <>
      <path d="M10 10.6c2.3 0 4.2 1.9 4.2 3.8 0 1.4-1.1 2.1-2.3 2.1-.8 0-1.2-.4-1.9-.4s-1.1.4-1.9.4c-1.2 0-2.3-.7-2.3-2.1 0-1.9 1.9-3.8 4.2-3.8z" />
      <ellipse cx="4.6" cy="9" rx="1.5" ry="1.8" />
      <ellipse cx="8" cy="5.3" rx="1.5" ry="1.9" />
      <ellipse cx="12" cy="5.3" rx="1.5" ry="1.9" />
      <ellipse cx="15.4" cy="9" rx="1.5" ry="1.8" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M6.9 10.3l2.1 2.1 4.2-4.5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2.75" y="6.25" width="14.5" height="10.25" rx="2" />
      <path d="M7.25 6.25V5a1.5 1.5 0 0 1 1.5-1.5h2.5a1.5 1.5 0 0 1 1.5 1.5v1.25M2.75 10.75h14.5" />
    </>
  ),
  timer: (
    <>
      <circle cx="10" cy="11" r="6.25" />
      <path d="M10 11V7.75M8 2.75h4M15.2 5.6l1.05-1.05" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 10s2.75-5 7.5-5 7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5z" />
      <circle cx="10" cy="10" r="2.25" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.25" width="14" height="12.75" rx="2" />
      <path d="M3 8.25h14M7 2.75v3M13 2.75v3" />
    </>
  ),
  hourglass: (
    <>
      <path d="M5.75 3h8.5M5.75 17h8.5" />
      <path d="M6.75 3v1.75c0 2.1 3.25 3.4 3.25 5.25s-3.25 3.15-3.25 5.25V17M13.25 3v1.75c0 2.1-3.25 3.4-3.25 5.25s3.25 3.15 3.25 5.25V17" />
    </>
  ),
  sliders: (
    <>
      <path d="M3.25 6h6.5M14 6h2.75M3.25 14h2.75M10.25 14h6.5" />
      <circle cx="11.9" cy="6" r="2.1" />
      <circle cx="8.1" cy="14" r="2.1" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9.25v4.5M10 6.6v.05" />
    </>
  ),
  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6.5A1.5 1.5 0 0 0 5.5 13H7" />
    </>
  ),
  refresh: <path d="M16.25 10a6.25 6.25 0 1 1-1.85-4.45M16.5 3.25v3.5H13" />,
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8" />,
  lock: (
    <>
      <rect x="4.5" y="8.75" width="11" height="8.25" rx="2" />
      <path d="M7 8.75V6.5a3 3 0 0 1 6 0v2.25" />
    </>
  ),
  external: <path d="M11.5 3.5h5v5M16.5 3.5l-7 7M14.5 12v3a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5h3" />,
  key: (
    <>
      <circle cx="6.75" cy="13.25" r="3.25" />
      <path d="M9.05 10.95L16 4M13.5 6.5l2 2M11.75 8.25l1.5 1.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 15.5V4.75A1.75 1.75 0 0 1 5.75 3H16v11H5.75A1.75 1.75 0 0 0 4 15.75 1.75 1.75 0 0 0 5.75 17.5H16" />
      <path d="M7.5 6.5h5" />
    </>
  ),
  warning: (
    <>
      <path d="M8.7 3.6a1.5 1.5 0 0 1 2.6 0l6 10.4a1.5 1.5 0 0 1-1.3 2.25H4a1.5 1.5 0 0 1-1.3-2.25z" />
      <path d="M10 8v3.5M10 13.9v.05" />
    </>
  ),
  shield: (
    <>
      <path d="M10 2.75l6 2.25v4.5c0 3.6-2.5 6.4-6 7.75-3.5-1.35-6-4.15-6-7.75V5z" />
      <path d="M7.4 10l1.9 1.9 3.4-3.6" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
