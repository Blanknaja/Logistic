-- แจ้งเตือน (docs/requirements/notification.md)
-- read_at ว่างคือ `ยังไม่อ่าน` event_key กันเหตุการณ์เดียวกันสร้างแจ้งเตือนซ้ำให้ผู้รับคนเดิม (NTF-016)

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  href TEXT NOT NULL,
  event_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (account_id, event_key)
);

CREATE INDEX notifications_account_time ON notifications (account_id, created_at);
CREATE INDEX notifications_unread ON notifications (account_id) WHERE read_at IS NULL;
