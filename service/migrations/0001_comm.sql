-- 커뮤니티 저장소(Cloudflare D1). 기획서: 상공회의소 해커톤/커뮤니티_기획서_2026-11-19.md
-- 접속 주소(ip)는 원래 값이 아니라 해시만 저장. 비밀번호도 해시(PBKDF2)만 저장.
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,            -- qna 질문 | story 경험담 | share 점검 결과 공유 | tip 정보·팁 | free 자유
  topic TEXT,                     -- 말머리(자유 게시판은 NULL)
  nick TEXT NOT NULL,
  job TEXT,                       -- 근무 형태(선택)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  share TEXT,                     -- 판정 결과 공유: [{"level":"위험","title":"..."}] JSON (등급·항목명만)
  pw TEXT NOT NULL,               -- 'salt:hash'
  ip TEXT NOT NULL,               -- 접속 주소 해시
  created INTEGER NOT NULL,       -- 밀리초
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,  -- 신고 3회면 1
  sample INTEGER NOT NULL DEFAULT 0   -- 시연용 예시 글
);
CREATE INDEX IF NOT EXISTS posts_board ON posts(board, hidden, created DESC);
CREATE INDEX IF NOT EXISTS posts_ip ON posts(ip, created DESC);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  nick TEXT NOT NULL,
  body TEXT NOT NULL,
  pw TEXT NOT NULL,
  ip TEXT NOT NULL,
  created INTEGER NOT NULL,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  sample INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created);
CREATE INDEX IF NOT EXISTS comments_ip ON comments(ip, created DESC);

-- 공감: 같은 접속 주소는 한 글에 1번
CREATE TABLE IF NOT EXISTS likes (post_id INTEGER NOT NULL, ip TEXT NOT NULL, PRIMARY KEY (post_id, ip));
-- 신고: 같은 접속 주소는 한 대상에 1번 (kind: post | comment)
CREATE TABLE IF NOT EXISTS reports (kind TEXT NOT NULL, target INTEGER NOT NULL, ip TEXT NOT NULL, PRIMARY KEY (kind, target, ip));
