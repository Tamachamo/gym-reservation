-- 会員アカウントテーブル
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '個人',
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 体育館予約テーブル
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                        -- 会員予約の場合は users.id、ゲスト予約は NULL
  reservation_date TEXT NOT NULL,         -- YYYY-MM-DD
  start_time TEXT NOT NULL,               -- HH:MM (30分刻み)
  end_time TEXT NOT NULL,                 -- HH:MM (30分刻み)
  applicant_name TEXT NOT NULL,           -- 申請者氏名
  organization TEXT NOT NULL DEFAULT '個人', -- 団体名（個人）
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  fee INTEGER NOT NULL,                   -- 計算された利用料金（円）
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email);
