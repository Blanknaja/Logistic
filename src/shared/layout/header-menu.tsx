"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

const noSubscribe = () => () => {};

/**
 * ปุ่มเมนูของแถบด้านบนบนจอเล็กกว่า 900 จุด จอ 900 ขึ้นไป CSS แสดงลิงก์เรียงเป็นแถวและซ่อนปุ่ม
 * ก่อน JavaScript ทำงานเป็น details จึงเปิดเมนูได้แม้ JavaScript ไม่โหลด
 */
export function HeaderMenu({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const pathname = usePathname();
  const [state, setState] = useState({ open: false, pathname });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  if (state.pathname !== pathname) setState({ open: false, pathname });
  const open = state.open && state.pathname === pathname;
  const setOpen = (next: boolean) => setState({ open: next, pathname });

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setState((current) => ({ ...current, open: false }));
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  if (!hydrated) {
    return (
      <details className="header-menu">
        <summary className="header-icon-button header-menu-button">
          <MenuIcon />
          <span className="visually-hidden">เมนู</span>
        </summary>
        <div className="header-menu-panel">{children}</div>
      </details>
    );
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !open) return;
    setOpen(false);
    button.current?.focus();
  }

  function closeOnLink(event: MouseEvent) {
    if ((event.target as Element).closest("a")) setOpen(false);
  }

  return (
    <div className="header-menu" ref={root} onKeyDown={closeOnEscape}>
      <button
        ref={button}
        type="button"
        className="header-icon-button header-menu-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <MenuIcon />
        <span className="visually-hidden">เมนู</span>
      </button>
      <div id={panelId} className="header-menu-panel" hidden={!open} onClick={closeOnLink}>
        {children}
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
    </svg>
  );
}
