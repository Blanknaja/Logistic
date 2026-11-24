#!/bin/bash
# ทดสอบว่าตัวตรวจบล็อกและปล่อยคำสั่งถูกต้อง ผ่านตัวกลางเดียวกับที่ hook ใช้
cd "$(dirname "$0")/../.." || exit 1
fails=0
expect() {
  jq -n --arg c "$2" '{tool_input:{command:$c}}' | scripts/agent-checks/run-command-checks.sh 2>/dev/null
  got=$?
  if [ "$got" != "$1" ]; then echo "FAIL want=$1 got=$got: $2"; fails=$((fails + 1)); fi
}
T='GH_TOKEN="$(gh auth token --user Blanknaja)"'

expect 0 'git status'
expect 0 'pip install --user foo'
expect 0 'echo ghost'
expect 0 "$T gh issue list"
expect 0 'GH_TOKEN=$(gh auth token --user Blanknaja) gh repo view'
expect 0 "cd docs && $T gh pr list"
expect 0 "export $T; gh issue list"
expect 0 'git commit -m "add check"'

expect 2 'gh issue list'
expect 2 'cd docs && gh pr create'
expect 2 '/opt/homebrew/bin/gh api user'
expect 2 'GH_TOKEN="$(gh auth token)" gh issue list'
expect 2 'GH_TOKEN="$(gh auth token --user someone)" gh issue list'
expect 2 "$T; gh issue list"
expect 2 "$T gh issue list; gh pr list"
expect 2 'gh auth switch --user Blanknaja'
expect 2 "$T gh auth login"
expect 2 'git commit --no-verify -m x'
expect 2 'git config core.hooksPath /dev/null'

# commit ที่ตั้งชื่อผู้เขียนเป็นคนอื่นต้องโดนบล็อก
if GIT_AUTHOR_NAME=someone scripts/agent-checks/repo/commit-identity.sh 2>/dev/null; then
  echo "FAIL commit-identity ปล่อย author คนอื่น"; fails=$((fails + 1))
fi

[ "$fails" = 0 ] && echo "all checks behave as expected"
exit "$fails"
