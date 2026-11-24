#!/bin/bash
# repo นี้ public: ห้าม commit path ในเครื่อง และคำต้องห้ามใน .git/info/private-words
# ไม่ส่ง argument: ตรวจบรรทัดที่ stage ไว้ (pre-commit)
# ส่งช่วง เช่น <base>...<head>: ตรวจบรรทัดที่เพิ่มในช่วงนั้น (CI ซึ่งไม่มีรายการคำต้องห้าม)
fail() { echo "Blocked: $1" >&2; exit 2; }

if [ -z "$1" ]; then
  added=$(git diff --cached -U0 --no-color | grep -E '^\+' | grep -vE '^\+\+\+ ')
else
  added=$(git diff -U0 --no-color "$1" | grep -E '^\+' | grep -vE '^\+\+\+ ')
fi
[ -n "$added" ] || exit 0

if printf '%s\n' "$added" | grep -qE '/(Users|home)/[^/[:space:]]+/'; then
  fail "พบ path ในเครื่อง เช่น /Users/... ให้ใช้ path ที่อ้างจาก root ของ repo แทน"
fi

words="$(git rev-parse --git-common-dir)/info/private-words"
if [ -s "$words" ] && printf '%s\n' "$added" | grep -qiwF -f <(grep -v '^[[:space:]]*$' "$words"); then
  fail "พบคำต้องห้ามจาก .git/info/private-words เช่นชื่อบัญชีอื่นหรืออีเมลจริง ห้ามขึ้น repo public"
fi
exit 0
