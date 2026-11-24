#!/bin/bash
# ตัวกลางของ hook ทุกค่าย (Claude Code, Codex, Hermes): รับ JSON ทาง stdin แล้วส่งคำสั่งให้ตัวตรวจทุกตัว
cd "$(dirname "$0")/../.." || exit 2
command=$(jq -r '.tool_input.command // empty') || exit 2
[ -n "$command" ] || exit 0
for check in scripts/agent-checks/command/*.sh; do
  "$check" "$command" || exit 2
done
exit 0
