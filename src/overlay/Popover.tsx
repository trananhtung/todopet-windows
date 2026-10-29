import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { placePopover } from "./placement";

/**
 * A small menu or confirmation anchored to a button. It is portaled to <body> with `position: fixed`,
 * so the board's scroll area can never clip it, and flips above the button when there is no room below.
 * Escape closes only the popover (not the board) and returns focus to the button; so do a click
 * outside, scrolling, and resizing.
 */
export function Popover({
  anchor,
  onClose,
  children,
  role,
  label,
  className,
}: {
  anchor: RefObject<HTMLElement | null>;
  /** `restoreFocus` is true when the user dismissed it from the keyboard. */
  onClose: (restoreFocus: boolean) => void;
  children: ReactNode;
  role: "menu" | "alertdialog" | "dialog";
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      const a = anchor.current;
      if (!el || !a) return;
      const r = a.getBoundingClientRect();
      // Stay inside the overlay's stage (above the taskbar; the demo draws a fake one at the bottom).
      const stage = document.querySelector(".stage")?.getBoundingClientRect();
      const bounds = { width: stage?.right ?? window.innerWidth, height: stage?.bottom ?? window.innerHeight };
      setPos(placePopover({ left: r.left, top: r.top, width: r.width, height: r.height }, { width: el.offsetWidth, height: el.offsetHeight }, bounds));
    };
    place();
  }, [anchor]);

  // Move focus in once placed: the first menu item, or the element marked data-autofocus.
  useEffect(() => {
    if (!pos) return;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>("button");
    first?.focus({ preventScroll: true });
    // Only on first placement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos !== null]);

  useEffect(() => {
    const inside = (t: EventTarget | null) => t instanceof Node && (ref.current?.contains(t) || anchor.current?.contains(t));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close.current(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current(true);
      } else if (e.key === "Tab" && ref.current?.contains(document.activeElement)) {
        e.preventDefault();
        if (role === "menu") {
          // Tab out of a menu closes it and continues from its button.
          close.current(true);
          return;
        }
        // A dialog keeps focus inside until it is answered: its fields and buttons, not the disabled ones.
        const items = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) close.current(false);
    };
    const onResize = () => close.current(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onResize);
    };
  }, [anchor, role]);

  // Arrow keys move between menu items.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (role !== "menu" || (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End")) return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };

  return createPortal(
    <div
      ref={ref}
      data-hit=""
      className={`popover${className ? ` ${className}` : ""}`}
      data-side={pos?.up ? "top" : "bottom"}
      role={role}
      aria-label={label}
      aria-modal={role === "alertdialog" ? true : undefined}
      onKeyDown={onKeyDown}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
