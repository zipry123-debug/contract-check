-- 하루 사용량 기록(2026-11-21): KV는 같은 키 1초 1회·무료 하루 쓰기 1,000회 제한이 있어 동시 사용 시 오류 → D1로 옮김
-- k: 'all:날짜' / 'ip:날짜:해시' / 'ask-all:날짜' / 'ask-ip:날짜:해시' (접속 주소는 서버 비밀 값을 섞은 해시만), n: 횟수, exp: 삭제 시각(ms, 48시간 뒤)
CREATE TABLE IF NOT EXISTS usage (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL);
