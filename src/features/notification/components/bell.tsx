"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import { latestNotificationsAction } from "@/features/notification/actions";
import {
  badgeText,
  bellLabel,
  NO_NOTIFICATIONS,
  NOTIFICATIONS_LOAD_FAILED,
  type BellList,
  type NotificationItem,
  type Pulse,
} from "@/features/notification/server/notifications";
import { settle } from "@/shared/ui/timeout";
import { MarkAllRead } from "./mark-all-read";
import { NotificationItems } from "./notification-items";
import styles from "./notification.module.css";
import { usePulse } from "./use-pulse";

const noSubscribe = () => () => {};

export const newNotificationsText = (count: number) => `มีแจ้งเตือนใหม่ ${count} รายการ`;

type Panel = { state: "closed" } | { state: "loading" } | { state: "failed" } | { state: "ready"; items: NotificationItem[] };

/** โหลดรายการใต้กระดิ่งหนึ่งครั้ง null เมื่อโหลดไม่สำเร็จหรือไม่มาภายใน 10 วินาที (NTF-002 NTF-017) */
export async function loadBellList(load: () => Promise<BellList | null>): Promise<BellList | null> {
  const result = await settle(load());
  return result && !("failed" in result) ? result : null;
}

/**
 * กระดิ่งในแถบด้านบน (NTF-001 NTF-002 NTF-014) start คือจำนวนตอนเรนเดอร์หน้า null เมื่อนับไม่สำเร็จ
 * ก่อน JavaScript ทำงานเป็นลิงก์ไปหน้าแจ้งเตือน จึงใช้ได้แม้สคริปต์ของหน้าไม่ทำงาน
 */
export function Bell({ start }: { start: Pulse | null }) {
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const pathname = usePathname();
  const [known, setKnown] = useState({ start, pulse: start });
  const [panel, setPanel] = useState<{ view: Panel; pathname: string }>({ view: { state: "closed" }, pathname });
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // หน้าถูกเรนเดอร์ใหม่จากเซิร์ฟเวอร์ เช่นหลังกด "อ่านทั้งหมดแล้ว" ใช้จำนวนใหม่นั้น
  if (known.start !== start) setKnown({ start, pulse: start ?? known.pulse });
  if (panel.pathname !== pathname) setPanel({ view: { state: "closed" }, pathname });
  const pulse = known.pulse;
  const view = panel.pathname === pathname ? panel.view : { state: "closed" as const };
  const open = view.state !== "closed";
  const unread = pulse?.unread ?? 0;

  const load = useCallback(async () => {
    const list = await loadBellList(latestNotificationsAction);
    setPanel((current) => (current.view.state === "closed" ? current : { ...current, view: list ? { state: "ready", items: list.items } : { state: "failed" } }));
    if (list) setKnown((current) => ({ ...current, pulse: { unread: list.unread, latestId: list.latestId, newCount: 0 } }));
  }, []);

  usePulse(pulse?.latestId ?? 0, (next) => {
    if (pulse && next.newCount > 0) setAnnouncement(newNotificationsText(next.newCount));
    if (open && (next.newCount > 0 || next.unread !== pulse?.unread)) void load();
    setKnown((current) => ({ ...current, pulse: next }));
  });

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPanel((current) => ({ ...current, view: { state: "closed" } }));
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const badge = badgeText(unread);

  if (!hydrated) {
    return (
      <Link href="/notifications" className="header-icon-button" aria-label={bellLabel(unread)}>
        <BellIcon />
        {badge}
      </Link>
    );
  }

  const close = () => setPanel({ view: { state: "closed" }, pathname });

  function toggle() {
    if (open) return close();
    setPanel({ view: { state: "loading" }, pathname });
    void load();
  }

  function retry() {
    setPanel({ view: { state: "loading" }, pathname });
    void load();
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !open) return;
    close();
    button.current?.focus();
  }

  function closeOnLink(event: MouseEvent) {
    if ((event.target as Element).closest("a")) close();
  }

  return (
    <div className={styles.bell} ref={root} onKeyDown={closeOnEscape}>
      <button
        ref={button}
        type="button"
        className="header-icon-button"
        aria-label={bellLabel(unread)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <BellIcon />
        {badge}
      </button>
      <span role="status" className="visually-hidden">
        {announcement}
      </span>
      <section id={panelId} className={styles.panel} hidden={!open} aria-label="แจ้งเตือนล่าสุด" onClick={closeOnLink}>
        {view.state === "loading" && (
          <p role="status" className={styles.note}>
            กำลังโหลด
          </p>
        )}
        {view.state === "failed" && (
          <div role="alert" className={styles.note}>
            <p>{NOTIFICATIONS_LOAD_FAILED}</p>
            <button type="button" className="button button-secondary" onClick={retry}>
              ลองใหม่
            </button>
          </div>
        )}
        {view.state === "ready" && (view.items.length === 0 ? <p className={styles.note}>{NO_NOTIFICATIONS}</p> : <NotificationItems items={view.items} />)}
        {view.state === "ready" && (
          <div className={styles.panelActions}>
            <MarkAllRead disabled={unread === 0} onDone={() => void load()} />
            <Link href="/notifications" className="link-action">
              ดูทั้งหมด
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a7 7 0 0 0-7 7v4.6l-1.7 3A1 1 0 0 0 4.2 18H9a3 3 0 0 0 6 0h4.8a1 1 0 0 0 .9-1.4l-1.7-3V9a7 7 0 0 0-7-7Zm0 2a5 5 0 0 1 5 5v5.1l1.1 1.9H5.9L7 14.1V9a5 5 0 0 1 5-5Z"
      />
    </svg>
  );
}
