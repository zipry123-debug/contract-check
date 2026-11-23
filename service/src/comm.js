// 커뮤니티 서버(로그인 없음, AI 사용 안 함). 저장소: D1(env.DB)
// 규칙(사용자 확정 2026-11-18·19): 닉네임+비밀번호, 1분에 글 1개·댓글 1개, 본문 2000자·댓글 500자,
// 개인정보 형식 차단(public/pii.js 공용), 신고 3회면 자동 숨김(같은 주소는 1번), 공감은 주소당 1번, 공감 3개 이상이면 HOT
import { findPII } from '../public/pii.js';

export const BOARDS = { qna: '질문', story: '경험담', share: '점검 결과 공유', tip: '정보·팁', free: '자유' };
export const TOPICS = { wage: '임금·최저임금', allowance: '주휴·수당', hours: '근로시간·휴게·연차', contract: '계약서·수습', insurance: '4대보험', dismissal: '해고·퇴사', etc: '기타' };
export const JOBS = ['알바', '인턴', '수습', '계약직', '기타'];
const HOT_LIKES = 3, HIDE_REPORTS = 3, GAP_MS = 60_000, PAGE = 20;
const LEN = { nick: [2, 10], title: [2, 40], body: [10, 2000], comment: [2, 500], pw: [4, 20] };

const now = () => Date.now();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
// 접속 주소 해시: 서버 비밀 값(IP_SALT)을 섞어, 주소 전체를 대입해 원래 주소를 되찾지 못하게 함(법적 검토 6번, 2026-11-20)
async function ipHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`comm:${env.IP_SALT ?? ''}:${ip}`))).slice(0, 24);
}
// 글 비밀번호: PBKDF2(SHA-256). 반복 횟수는 Worker CPU 시간 제한을 고려해 낮게 잡음
const ITER = 10000;
async function pbkdf2(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITER }, key, 256));
}
async function hashPw(pw) { const salt = hex(crypto.getRandomValues(new Uint8Array(12))); return `${salt}:${await pbkdf2(pw, salt)}`; }
async function checkPw(pw, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h || typeof pw !== 'string') return false;
  return (await pbkdf2(pw, salt)) === h;
}
// 비밀번호 시도 횟수 제한(2026-11-23 보안 점검): '틀린 시도'만, 글(댓글) 하나 × 접속 주소 하나당 1시간에 10번까지.
// 2차 점검(11-23)에서 처음 방식('글 하나당' 모든 시도)은 남이 일부러 10번 틀려 진짜 글쓴이를 잠글 수 있었음 → 주소별로 나누고, 맞으면 되돌림.
// 먼저 1 올리고 그 값을 받는 한 문장 → 같은 주소에서 동시에 여러 번 보내도 10번을 넘지 못함. 기록은 usage 표(48시간 뒤 cron이 삭제)
const PW_TRIES = 10, PW_WINDOW_MS = 3600e3;
async function pwTry(db, kind, id, ip) { // 잠겼으면 null, 아니면 되돌릴 때 쓸 키
  const k = `pwtry:${kind}:${id}:${ip}:${Math.floor(now() / PW_WINDOW_MS)}`;
  const r = await db.prepare('INSERT INTO usage (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(k, now() + 48 * 3600e3).first();
  return (r?.n ?? 1) <= PW_TRIES ? k : null;
}
const pwRefund = (db, k) => db.prepare('UPDATE usage SET n = MAX(n - 1, 0) WHERE k = ?').bind(k).run(); // 맞힌 시도는 세지 않음
const PW_LOCKED = '비밀번호를 너무 많이 틀렸어요. 1시간쯤 뒤에 다시 시도해 주세요.';

const str = v => (typeof v === 'string' ? v.trim() : '');
function lenErr(name, v, label) {
  const [a, b] = LEN[name];
  const josa = (label.charCodeAt(label.length - 1) - 0xac00) % 28 ? '은' : '는'; // 받침 있으면 '은'
  return v.length < a || v.length > b ? `${label}${josa} ${a}~${b}자로 입력해 주세요.` : null;
}
function piiErr(fields) {
  for (const [label, v] of fields) {
    const hit = findPII(v);
    if (hit.length) return { error: `${label}에 개인정보로 보이는 내용(${[...new Set(hit.map(h => h.kind))].join(', ')})이 있어 올릴 수 없어요. 지우고 다시 시도해 주세요.`, pii: hit.map(h => h.kind) };
  }
  return null;
}
// 판정 결과 공유: 등급·항목명만, 최대 15개
function cleanShare(v) {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, 15).map(x => ({ level: str(x?.level), title: str(x?.title).slice(0, 80) }))
    .filter(x => ['위험', '주의', '참고'].includes(x.level) && x.title);
  return out.length ? out : null;
}

const postView = r => ({
  id: r.id, board: r.board, topic: r.topic, nick: r.nick, job: r.job, title: r.title, created: r.created,
  likes: r.likes, comments: r.comments, sample: !!r.sample,
  ...(r.body !== undefined ? { body: r.body } : {}), ...(r.share ? { share: JSON.parse(r.share) } : {}),
});
const LIST_COLS = 'id, board, topic, nick, job, title, created, likes, comments, sample';

async function recentGap(db, table, ip) {
  const r = await db.prepare(`SELECT created FROM ${table} WHERE ip = ? ORDER BY created DESC LIMIT 1`).bind(ip).first();
  return r && now() - r.created < GAP_MS ? Math.ceil((GAP_MS - (now() - r.created)) / 1000) : 0;
}

export async function comm(request, env, { json }) {
  const db = env.DB;
  if (!db) return json({ error: '커뮤니티 저장소가 연결되지 않았어요.' }, 500);
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/comm', '');
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const ip = await ipHash(request, env);

  // 첫 화면: HOT 3개 + 게시판별 최신 글 1개 + 최근 글 3개(홈 화면용)
  if (path === '/home' && request.method === 'GET') {
    const hot = (await db.prepare(`SELECT ${LIST_COLS} FROM posts WHERE hidden = 0 AND likes >= ? ORDER BY likes DESC, created DESC LIMIT 3`).bind(HOT_LIKES).all()).results;
    const latest = {};
    for (const b of Object.keys(BOARDS)) {
      latest[b] = (await db.prepare(`SELECT ${LIST_COLS} FROM posts WHERE hidden = 0 AND board = ? ORDER BY created DESC LIMIT 1`).bind(b).first()) ?? null;
    }
    const recent = (await db.prepare(`SELECT ${LIST_COLS} FROM posts WHERE hidden = 0 ORDER BY created DESC LIMIT 3`).all()).results;
    return json({ hot: hot.map(postView), latest: Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, v && postView(v)])), recent: recent.map(postView), boards: BOARDS, topics: TOPICS, hotLikes: HOT_LIKES });
  }

  // 게시판 글 목록 (board=hot 이면 공감 3개 이상)
  if (path === '/list' && request.method === 'GET') {
    const board = url.searchParams.get('board'), topic = url.searchParams.get('topic');
    const page = Math.max(0, +url.searchParams.get('page') || 0);
    let sql = `SELECT ${LIST_COLS} FROM posts WHERE hidden = 0`, args = [];
    if (board === 'hot') { sql += ' AND likes >= ?'; args.push(HOT_LIKES); }
    else if (BOARDS[board]) { sql += ' AND board = ?'; args.push(board); }
    else return json({ error: '없는 게시판이에요.' }, 400);
    if (topic && TOPICS[topic]) { sql += ' AND topic = ?'; args.push(topic); }
    sql += board === 'hot' ? ' ORDER BY likes DESC, created DESC' : ' ORDER BY created DESC';
    sql += ` LIMIT ${PAGE + 1} OFFSET ${page * PAGE}`;
    const rows = (await db.prepare(sql).bind(...args).all()).results;
    return json({ posts: rows.slice(0, PAGE).map(postView), more: rows.length > PAGE });
  }

  // 글 상세 + 댓글
  if (path === '/post' && request.method === 'GET') {
    const id = +url.searchParams.get('id');
    const p = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
    if (!p) return json({ error: '삭제되었거나 없는 글이에요.' }, 404);
    if (p.hidden) return json({ hidden: true });
    const cs = (await db.prepare('SELECT id, nick, body, created, hidden, sample FROM comments WHERE post_id = ? ORDER BY created').bind(id).all()).results;
    const liked = !!(await db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND ip = ?').bind(id, ip).first());
    return json({ post: postView(p), liked, comments: cs.map(c => c.hidden ? { id: c.id, hidden: true } : { id: c.id, nick: c.nick, body: c.body, created: c.created, sample: !!c.sample }) });
  }

  if (request.method !== 'POST') return json({ error: '없는 주소이에요.' }, 404);

  // 글쓰기
  if (path === '/write') {
    const board = str(body.board), topic = str(body.topic) || null, job = str(body.job) || null;
    const nick = str(body.nick), title = str(body.title), text = str(body.body), pw = typeof body.pw === 'string' ? body.pw : '';
    if (!BOARDS[board]) return json({ error: '게시판을 골라 주세요.' }, 400);
    if (board !== 'free' && !TOPICS[topic]) return json({ error: '말머리를 골라 주세요.' }, 400);
    if (job && !JOBS.includes(job)) return json({ error: '근무 형태가 올바르지 않아요.' }, 400);
    const e = lenErr('nick', nick, '닉네임') || lenErr('title', title, '제목') || lenErr('body', text, '본문') || lenErr('pw', pw, '비밀번호');
    if (e) return json({ error: e }, 400);
    const share = board === 'share' ? cleanShare(body.share) : null;
    const pii = piiErr([['닉네임', nick], ['제목', title], ['본문', text], ['판정 결과', (share ?? []).map(s => s.title).join(' ')]]);
    if (pii) return json(pii, 400);
    const wait = await recentGap(db, 'posts', ip);
    if (wait) return json({ error: `글은 1분에 하나만 쓸 수 있어요. ${wait}초 뒤에 다시 시도해 주세요.` }, 429);
    const r = await db.prepare('INSERT INTO posts (board, topic, nick, job, title, body, share, pw, ip, created) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(board, board === 'free' ? null : topic, nick, job, title, text, share ? JSON.stringify(share) : null, await hashPw(pw), ip, now()).run();
    return json({ id: r.meta.last_row_id });
  }

  // 비밀번호 확인(수정 화면으로 가기 전)
  if (path === '/verify') {
    const p = await db.prepare('SELECT pw, sample FROM posts WHERE id = ?').bind(+body.id).first();
    if (!p) return json({ error: '없는 글이에요.' }, 404);
    if (p.sample) return json({ error: '예시 글은 수정·삭제할 수 없어요.' }, 403);
    const pk = await pwTry(db, 'post', +body.id, ip);
    if (!pk) return json({ error: PW_LOCKED }, 429);
    if (!(await checkPw(body.pw, p.pw))) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    await pwRefund(db, pk);
    return json({ ok: true });
  }

  // 글 수정
  if (path === '/edit') {
    const p = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(+body.id).first();
    if (!p || p.hidden) return json({ error: '수정할 수 없는 글이에요.' }, 404);
    if (p.sample) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    const pk = await pwTry(db, 'post', p.id, ip);
    if (!pk) return json({ error: PW_LOCKED }, 429);
    if (!(await checkPw(body.pw, p.pw))) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    await pwRefund(db, pk);
    const topic = str(body.topic) || null, job = str(body.job) || null, title = str(body.title), text = str(body.body);
    if (p.board !== 'free' && !TOPICS[topic]) return json({ error: '말머리를 골라 주세요.' }, 400);
    if (job && !JOBS.includes(job)) return json({ error: '근무 형태가 올바르지 않아요.' }, 400);
    const e = lenErr('title', title, '제목') || lenErr('body', text, '본문');
    if (e) return json({ error: e }, 400);
    const pii = piiErr([['제목', title], ['본문', text]]);
    if (pii) return json(pii, 400);
    const share = p.board === 'share' && body.keepShare === false ? null : p.share;
    await db.prepare('UPDATE posts SET topic = ?, job = ?, title = ?, body = ?, share = ? WHERE id = ?')
      .bind(p.board === 'free' ? null : topic, job, title, text, share, p.id).run();
    return json({ id: p.id });
  }

  // 글 삭제(댓글·공감·신고 기록도 함께)
  if (path === '/delete') {
    const p = await db.prepare('SELECT id, pw, sample FROM posts WHERE id = ?').bind(+body.id).first();
    if (!p) return json({ error: '없는 글이에요.' }, 404);
    if (p.sample) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    const pk = await pwTry(db, 'post', p.id, ip);
    if (!pk) return json({ error: PW_LOCKED }, 429);
    if (!(await checkPw(body.pw, p.pw))) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    await pwRefund(db, pk);
    await db.batch([
      db.prepare("DELETE FROM reports WHERE kind = 'comment' AND target IN (SELECT id FROM comments WHERE post_id = ?)").bind(p.id),
      db.prepare('DELETE FROM comments WHERE post_id = ?').bind(p.id),
      db.prepare('DELETE FROM likes WHERE post_id = ?').bind(p.id),
      db.prepare("DELETE FROM reports WHERE kind = 'post' AND target = ?").bind(p.id),
      db.prepare('DELETE FROM posts WHERE id = ?').bind(p.id),
    ]);
    return json({ ok: true });
  }

  // 댓글 쓰기
  if (path === '/comment') {
    const p = await db.prepare('SELECT id, hidden FROM posts WHERE id = ?').bind(+body.postId).first();
    if (!p || p.hidden) return json({ error: '댓글을 달 수 없는 글이에요.' }, 404);
    const nick = str(body.nick), text = str(body.body), pw = typeof body.pw === 'string' ? body.pw : '';
    const e = lenErr('nick', nick, '닉네임') || lenErr('comment', text, '댓글') || lenErr('pw', pw, '비밀번호');
    if (e) return json({ error: e }, 400);
    const pii = piiErr([['닉네임', nick], ['댓글', text]]);
    if (pii) return json(pii, 400);
    const wait = await recentGap(db, 'comments', ip);
    if (wait) return json({ error: `댓글은 1분에 하나만 쓸 수 있어요. ${wait}초 뒤에 다시 시도해 주세요.` }, 429);
    await db.batch([
      db.prepare('INSERT INTO comments (post_id, nick, body, pw, ip, created) VALUES (?,?,?,?,?,?)').bind(p.id, nick, text, await hashPw(pw), ip, now()),
      db.prepare('UPDATE posts SET comments = comments + 1 WHERE id = ?').bind(p.id),
    ]);
    return json({ ok: true });
  }

  // 댓글 삭제
  if (path === '/comment/delete') {
    const c = await db.prepare('SELECT id, post_id, pw, sample, hidden FROM comments WHERE id = ?').bind(+body.id).first();
    if (!c) return json({ error: '없는 댓글이에요.' }, 404);
    if (c.sample) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    const pk = await pwTry(db, 'comment', c.id, ip);
    if (!pk) return json({ error: PW_LOCKED }, 429);
    if (!(await checkPw(body.pw, c.pw))) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    await pwRefund(db, pk);
    await db.batch([
      db.prepare('DELETE FROM comments WHERE id = ?').bind(c.id),
      db.prepare("DELETE FROM reports WHERE kind = 'comment' AND target = ?").bind(c.id),
      db.prepare('UPDATE posts SET comments = MAX(comments - 1, 0) WHERE id = ?').bind(c.post_id),
    ]);
    return json({ ok: true });
  }

  // 공감(주소당 1번)
  if (path === '/like') {
    const p = await db.prepare('SELECT id, hidden FROM posts WHERE id = ?').bind(+body.id).first();
    if (!p || p.hidden) return json({ error: '없는 글이에요.' }, 404);
    const r = await db.prepare('INSERT OR IGNORE INTO likes (post_id, ip) VALUES (?, ?)').bind(p.id, ip).run();
    if (!r.meta.changes) return json({ error: '이미 공감한 글이에요.', already: true }, 409);
    await db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').bind(p.id).run();
    const { likes } = await db.prepare('SELECT likes FROM posts WHERE id = ?').bind(p.id).first();
    return json({ likes, hot: likes >= HOT_LIKES });
  }

  // 신고(주소당 1번, 3회면 숨김)
  if (path === '/report') {
    const kind = body.kind === 'comment' ? 'comment' : 'post', table = kind === 'comment' ? 'comments' : 'posts';
    const t = await db.prepare(`SELECT id, sample FROM ${table} WHERE id = ?`).bind(+body.id).first();
    if (!t) return json({ error: '없는 대상이에요.' }, 404);
    if (t.sample) return json({ error: '예시 글은 신고할 수 없어요.' }, 403); // 시연용 글이 숨겨지지 않게
    const r = await db.prepare('INSERT OR IGNORE INTO reports (kind, target, ip) VALUES (?,?,?)').bind(kind, t.id, ip).run();
    if (!r.meta.changes) return json({ error: '이미 신고했어요.', already: true }, 409);
    await db.prepare(`UPDATE ${table} SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?`).bind(HIDE_REPORTS, t.id).run();
    const { hidden } = await db.prepare(`SELECT hidden FROM ${table} WHERE id = ?`).bind(t.id).first();
    return json({ ok: true, hidden: !!hidden });
  }

  return json({ error: '없는 주소이에요.' }, 404);
}
