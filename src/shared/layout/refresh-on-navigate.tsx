"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** layout ไม่วาดใหม่เมื่อกดลิงก์ไปหน้าอื่นใต้ layout เดียวกัน ตัวเลขในเมนู เช่น "รอจัดของ" จึงต้องขอใหม่เอง (ORD-004) */
export function RefreshOnNavigate() {
  const pathname = usePathname();
  const router = useRouter();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.refresh();
  }, [pathname, router]);
  return null;
}
