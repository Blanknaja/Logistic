#!/bin/bash
# ตรวจคำสั่งก่อน agent รัน: โปรเจคนี้ใช้บัญชี GitHub Blanknaja เท่านั้น
# ใช้: github-account.sh "<command>"  ผ่าน exit 0, บล็อก exit 2
cmd="$1"
fail() { echo "Blocked: $1" >&2; exit 2; }

# คำต้องห้าม เช่นชื่อบัญชีอื่น เก็บนอก repo เพราะ repo นี้ public
words="$(git rev-parse --git-common-dir 2>/dev/null)/info/private-words"
if [ -s "$words" ] && printf '%s' "$cmd" | grep -qiwF -f <(grep -v '^[[:space:]]*$' "$words"); then
  fail "คำสั่งนี้มีชื่อหรือข้อมูลที่ห้ามใช้ในโปรเจคนี้ ใช้บัญชี Blanknaja เท่านั้น"
fi

# การเปลี่ยนบัญชี gh มีผลกับทุกโปรเจคในเครื่อง
if printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_.-])gh[[:space:]]+auth[[:space:]]+(switch|login|logout|refresh)'; then
  fail "ห้ามเปลี่ยนหรือ login บัญชี gh ในโปรเจคนี้ เพราะมีผลกับทุกโปรเจคในเครื่อง"
fi

# ตัดรูปแบบที่ถูกต้องออก แล้วดูว่ายังเหลือ gh ที่ไม่ได้ใช้ token ของ Blanknaja ไหม
rest=$(printf '%s' "$cmd" | sed -E \
  -e 's/gh[[:space:]]+auth[[:space:]]+token[[:space:]]+(--user|-u)[= ]Blanknaja//g' \
  -e 's/GH_TOKEN="?\$\(\)"?[[:space:]]+gh([[:space:]]|$)/GHOK\1/g')
if printf '%s' "$rest" | grep -qE '(^|[;&|]|&&)[[:space:]]*export[[:space:]]+GH_TOKEN="?\$\(\)"?[[:space:]]*(;|&&|$)'; then
  exit 0  # export GH_TOKEN ของ Blanknaja ไว้แล้ว คำสั่ง gh ที่ตามมาใช้บัญชีนี้
fi
if printf '%s' "$rest" | grep -qE '(^|[;&|(`!{[:space:]/])gh([[:space:]]|$)'; then
  fail 'คำสั่ง gh ต้องใช้บัญชี Blanknaja: ขึ้นต้นด้วย GH_TOKEN="$(gh auth token --user Blanknaja)" gh ...'
fi
exit 0
