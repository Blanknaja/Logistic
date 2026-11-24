#!/bin/bash
# ตรวจคำสั่งก่อน agent รัน: ห้ามข้ามหรือปิด git hook ที่บังคับกฎของโปรเจค
cmd="$1"
if printf '%s' "$cmd" | grep -qE -- '--no-verify|core\.hooksPath'; then
  echo "Blocked: ห้ามข้าม git hook (--no-verify) หรือแก้ core.hooksPath ถ้า hook บล็อก ให้แก้ที่ต้นเหตุ" >&2
  exit 2
fi
exit 0
