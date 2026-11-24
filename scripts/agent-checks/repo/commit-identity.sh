#!/bin/bash
# ทุก commit ต้องเป็นบัญชี Blanknaja
# ไม่ส่ง argument: ตรวจ commit ที่กำลังจะสร้าง (pre-commit)
# ส่งช่วง เช่น <base>..<head>: ตรวจทุก commit ในช่วงนั้น (CI)
# ไม่พิมพ์ชื่อหรืออีเมลที่ผิดออกมา เพราะ log ของ CI ใน repo public ใครก็อ่านได้
want='Blanknaja <43431099+Blanknaja@users.noreply.github.com>'

if [ -z "$1" ]; then
  for var in GIT_AUTHOR_IDENT GIT_COMMITTER_IDENT; do
    ident=$(git var "$var" | sed -E 's/ [0-9]+ [+-][0-9]{4}$//')
    if [ "$ident" != "$want" ]; then
      echo "Blocked: $var ไม่ใช่บัญชี Blanknaja ตั้งด้วย git config user.name / user.email ใน repo นี้" >&2
      exit 2
    fi
  done
  exit 0
fi

# commit ที่สร้างผ่านหน้าเว็บ GitHub มี committer เป็น GitHub
bad=$(git log --format='%h%x09%an <%ae>%x09%cn <%ce>' "$1" |
  awk -F'\t' -v w="$want" '$2 != w || ($3 != w && $3 != "GitHub <noreply@github.com>") { print $1 }')
if [ -n "$bad" ]; then
  echo "Blocked: commit เหล่านี้ไม่ใช่บัญชี Blanknaja:" $bad >&2
  exit 2
fi
exit 0
