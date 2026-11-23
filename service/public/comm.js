// 커뮤니티 화면(로그인 없음, AI 사용 안 함). 서버: /api/comm/* (src/comm.js)
// 다른 파일의 공용 함수 사용: $, show, esc, fail (app.js), loadLaws·LAWS (learn.js), findPII (pii.js)
'use strict';

const BOARD = { hot: 'HOT', qna: '질문', story: '경험담', share: '점검 결과 공유', tip: '정보·팁', free: '자유' };
const BOARD_DESC = { hot: '공감을 3개 이상 받은 글이 모여요', qna: '궁금한 점을 묻고 댓글로 답을 받아요', story: '겪은 일과 해결 과정을 나눠요',
  share: '계약서 점검 결과를 나누고 의견을 들어요', tip: '알아두면 좋은 정보를 나눠요', free: '일·생활 이야기를 자유롭게 나눠요' };
const TOPIC = { wage: '임금·최저임금', allowance: '주휴·수당', hours: '근로시간·휴게·연차', contract: '계약서·수습', insurance: '4대보험', dismissal: '해고·퇴사', etc: '기타' };
// 말머리 → 기본으로 연결할 법 안내 카드(laws.json topics)
const TOPIC_CARD = { wage: ['minwage'], allowance: ['weekly'], hours: ['hours', 'rest', 'annual'], contract: ['probation'], insurance: ['insurance'], dismissal: ['dismissal'] };
const LEN = { nick: [2, 10], title: [2, 40], body: [10, 2000], comment: [2, 500], pw: [4, 20] };

const api = async (path, body) => {
  const r = await fetch('/api/comm' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const d = await r.json().catch(() => ({ error: '서버 응답을 읽지 못했어요.' }));
  if (!r.ok && !d.error) d.error = '잠시 후 다시 시도해 주세요.';
  return d;
};
const HOME_BACK = ['홈으로 돌아가기', () => show('s-home')];
const netFail = retry => fail('커뮤니티를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', undefined, { retry, back: HOME_BACK, tab: 's-comm' });
function ago(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`; if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  const d = new Date(ms + 9 * 3600e3); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}
const warn = (id, msg) => { $(id).hidden = !msg; $(id).textContent = msg || ''; };

// 글 한 줄(목록·HOT·홈 공용)
const row = p => `<button class="c-row" data-post="${p.id}">
  <span class="c-row-top">${p.topic ? `<span class="c-tag">${esc(TOPIC[p.topic] ?? '')}</span>` : ''}${p.sample ? '<span class="c-tag sample">예시 글</span>' : ''}<b>${esc(p.title)}</b></span>
  <span class="c-row-meta">${esc(BOARD[p.board] ?? '')} · ${esc(p.nick)}${p.job ? ` · ${esc(p.job)}` : ''} · ${ago(p.created)} · 공감 ${p.likes} · 댓글 ${p.comments}</span></button>`;
const empty = '<div class="empty">아직 글이 없어요</div>';
// 불러오는 동안 회색 막대(홈과 같은 모양, 2026-11-21 UI 개선 ④ 문제 8)
const LIST_SKEL = '<div class="hp-skel" aria-busy="true" aria-label="글을 불러오는 중">' + '<div><i></i><i></i></div>'.repeat(3) + '</div>';
const BOARD_SKEL = '<div class="c-bsk" aria-hidden="true"></div>'.repeat(5);

// ---------- 입력칸 오류: 칸 바로 아래에 표시(UI 개선 ④ 문제 5·6) ----------
function fieldErr(el, msg) {
  const id = el.id + '-err';
  let e = document.getElementById(id);
  const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(x => x && x !== id);
  if (!msg) {
    e?.remove(); el.classList.remove('is-err'); el.removeAttribute('aria-invalid');
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
    return;
  }
  if (!e) { e = document.createElement('span'); e.id = id; e.className = 'f-err'; el.after(e); }
  e.textContent = msg;
  el.classList.add('is-err'); el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', [id, ...ids].join(' '));
}
// errs: [[칸, 문구], ...] → 모두 표시하고 첫 칸으로 이동. 오류가 있으면 true
function showErrs(els, errs) {
  els.forEach(el => fieldErr(el, ''));
  errs.forEach(([el, msg]) => fieldErr(el, msg));
  if (!errs.length) return false;
  const first = errs[0][0];
  first.scrollIntoView({ block: 'center' });
  (first.matches('input, textarea, select') ? first : first.querySelector('button'))?.focus({ preventScroll: true });
  return true;
}
const lenErr = (name, v) => { const [a, b] = LEN[name]; return v.length < a || v.length > b ? `${a}~${b}자로 써 주세요.` : ''; };
const piiErr = v => { const hit = window.findPII ? window.findPII(v) : []; return hit.length ? `개인정보로 보이는 내용이 있어요: ${[...new Set(hit.map(h => h.kind))].join(', ')} (“${hit[0].text}”). 지우고 다시 시도해 주세요.` : ''; };

// ---------- 첫 화면 ----------
let homeData = null;
async function openComm() {
  show('s-comm');
  if (typeof renderMineBtn === 'function') renderMineBtn();
  if (!homeData) { $('c-hot').innerHTML = LIST_SKEL; $('c-boards').innerHTML = BOARD_SKEL; }
  const d = await api('/home').catch(() => null);
  if (!d || d.error) return netFail(openComm);
  homeData = d;
  $('c-hot').innerHTML = d.hot.length ? d.hot.map(row).join('') : '<div class="empty">아직 HOT 글이 없어요</div>';
  $('c-boards').innerHTML = Object.keys(BOARD).filter(b => b !== 'hot').map(b => {
    const p = d.latest[b];
    return `<button class="c-board" data-board="${b}"><b>${BOARD[b]}</b><span>${p ? esc(p.title) : '아직 글이 없어요'}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
  }).join('');
}
window.openComm = openComm;
$('c-write').addEventListener('click', () => openWrite({ board: 'qna' })); // 첫 화면 글쓰기(문제 7)

// 홈 화면 '커뮤니티 최근 글 3개'
// 불러오는 중(회색 막대, index.html) / 글 없음 / 못 불러옴을 구분(2026-11-21 UI 개선 ① 문제 5)
const HOME_SKEL = '<div class="hp-skel" aria-busy="true" aria-label="최근 글을 불러오는 중">' + '<div><i></i><i></i></div>'.repeat(3) + '</div>';
async function fillHome(showLoading = false) {
  const box = $('home-posts');
  if (showLoading) box.innerHTML = HOME_SKEL;
  const d = await api('/home').catch(() => null);
  if (!d || d.error || !Array.isArray(d.recent)) {
    if (box.querySelector('.c-list')) return; // 이미 보이는 글이 있으면 그대로 둠(글 쓴 뒤 새로고침 실패 등)
    box.innerHTML = '<div class="hp-msg" role="status">최근 글을 불러오지 못했어요.<br><button type="button" id="b-home-retry">다시 불러오기</button></div>';
    $('b-home-retry').addEventListener('click', () => fillHome(true));
    return;
  }
  box.innerHTML = d.recent.length ? `<div class="c-list">${d.recent.map(row).join('')}</div>` : '<div class="empty">아직 글이 없어요</div>';
}
fillHome();

// ---------- 게시판 ----------
let cur = { board: null, topic: '', page: 0 };
let boardFrom = null; // 게시판에 들어오기 직전 화면('‹ 커뮤니티' 버튼용, 문제 1)
async function openBoard(board, topic = '') {
  if (document.body.dataset.screen !== 's-board') boardFrom = document.body.dataset.screen;
  cur = { board, topic, page: 0 };
  $('b-list').innerHTML = LIST_SKEL; $('b-more').hidden = true;
  const mine = board === 'mine';
  $('b-title').textContent = mine ? '내 글' : BOARD[board];
  $('b-desc').textContent = mine ? MINE_DESC : BOARD_DESC[board];
  $('b-write').hidden = board === 'hot' || mine;
  const useTopic = board !== 'hot' && board !== 'free' && !mine;
  $('b-topics').hidden = !useTopic;
  $('b-topics').innerHTML = useTopic ? [['', '전체'], ...Object.entries(TOPIC)].map(([k, v]) =>
    `<button class="chip${k === topic ? ' on' : ''}" data-btopic="${k}">${v}</button>`).join('') : '';
  if (document.body.dataset.screen !== 's-board') show('s-board');
  await loadList(false);
}
async function loadList(append) {
  if (cur.board === 'mine') return loadMine();
  const q = `/list?board=${cur.board}&page=${cur.page}${cur.topic ? `&topic=${cur.topic}` : ''}`;
  const more = $('b-more');
  if (append) { more.disabled = true; more.textContent = '불러오는 중…'; }
  const d = await api(q).catch(() => null);
  more.disabled = false; more.textContent = '더 보기';
  if (!d || d.error) return netFail(() => (append ? (show('s-board'), loadList(true)) : openBoard(cur.board, cur.topic)));
  const html = d.posts.map(row).join('');
  $('b-list').innerHTML = append ? $('b-list').innerHTML + html : (html || empty);
  more.hidden = !d.more;
}
// ---------- 닉네임 저장(2026-11-23 사용자 요청) ----------
// '닉네임 저장'에 체크하고 글·댓글을 등록하면 닉네임을 이 브라우저(localStorage)에만 기억, 체크를 풀고 등록하면 지움. 서버는 바꾸지 않음.
const NICK_KEY = 'myNick';
function savedNick() { try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; } }
function keepNick(on, nick) { try { if (on) localStorage.setItem(NICK_KEY, nick); else localStorage.removeItem(NICK_KEY); } catch { /* 저장 불가 */ } }
// ---------- 내 글(2026-11-23 사용자 선택 A) ----------
// 로그인이 없어서, 글을 쓰면 글 번호만 이 브라우저(localStorage)에 기억해 두고 모아 보여 줌. 서버·DB는 바꾸지 않음.
// 다른 기기·브라우저, 이 기능 전에 쓴 글은 안 보임. 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 빈 목록.
const MINE_KEY = 'myPosts', MINE_MAX = 30;
const MINE_DESC = '이 휴대폰에서 쓴 글이 모여요. 다른 기기·브라우저에서 쓴 글은 보이지 않아요.';
function mineIds() {
  try { const a = JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); return Array.isArray(a) ? a.filter(n => Number.isInteger(n) && n > 0).slice(0, MINE_MAX) : []; }
  catch { return []; }
}
function saveMine(ids) { try { localStorage.setItem(MINE_KEY, JSON.stringify(ids.slice(0, MINE_MAX))); } catch { /* 저장 불가 */ } renderMineBtn(); }
const addMine = id => saveMine([id, ...mineIds().filter(x => x !== id)]);
const dropMine = gone => saveMine(mineIds().filter(x => !gone.includes(x)));
function renderMineBtn() {
  const n = mineIds().length;
  $('c-mine').textContent = n ? `내 글 ${n}` : '내 글';
  $('c-mine').setAttribute('aria-label', n ? `이 휴대폰에서 쓴 내 글 ${n}개 보기` : '이 휴대폰에서 쓴 내 글 보기');
}
renderMineBtn();
async function loadMine() {
  const ids = mineIds();
  // 글마다 상세 주소로 불러옴(새로 쓴 순서). 404(삭제됨)·숨김 글은 목록과 기억에서 뺌
  const rs = await Promise.all(ids.map(async id => {
    try {
      const r = await fetch(`/api/comm/post?id=${id}`);
      if (r.status === 404) return { id, gone: true };
      if (!r.ok) return { id, err: true };
      const d = await r.json();
      return d.hidden ? { id, gone: true } : d.post ? { id, post: d.post } : { id, err: true };
    } catch { return { id, err: true }; }
  }));
  if (cur.board !== 'mine') return; // 불러오는 사이 다른 게시판으로 옮김
  const gone = rs.filter(r => r.gone).map(r => r.id);
  if (gone.length) dropMine(gone);
  const posts = rs.filter(r => r.post).map(r => r.post);
  if (!posts.length && rs.some(r => r.err)) return netFail(() => openBoard('mine'));
  $('b-list').innerHTML = posts.length ? posts.map(row).join('') + (rs.some(r => r.err) ? '<p class="muted">일부 글을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>' : '')
    : '<div class="empty">이 휴대폰에서 쓴 글이 아직 없어요</div>';
  $('b-more').hidden = true;
}

$('b-topics').addEventListener('click', e => { const b = e.target.closest('[data-btopic]'); if (b) openBoard(cur.board, b.dataset.btopic); });
$('b-more').addEventListener('click', () => { cur.page++; loadList(true); });
$('b-write').addEventListener('click', () => openWrite({ board: cur.board, topic: cur.topic }));
$('b-back').addEventListener('click', () => (boardFrom === 's-comm' ? history.back() : openComm()));

// ---------- 글 상세 ----------
let post = null;
let postBack = null; // '‹' 버튼: 들어온 화면으로 돌아가면 history.back, 아니면 게시판으로(문제 1)
// keep: 같은 글을 다시 그릴 때(댓글 등록·삭제·신고 뒤) 화면 이동·스크롤 없이 그 자리에서(문제 4)
async function openPost(id, keep = false) {
  const from = document.body.dataset.screen;
  const d = await api(`/post?id=${id}`).catch(() => null);
  if (!d) return netFail(() => openPost(id));
  if (d.hidden) return show('s-hidden');
  if (d.error) return fail(d.error, '글을 열 수 없어요', { back: HOME_BACK, tab: 's-comm' });
  post = d.post;
  const p = d.post;
  // 닉네임 저장(2026-11-23): 댓글 닉네임 칸이 비어 있으면 저장한 닉네임을 넣음
  const sn = savedNick(); if (!$('cm-nick').value) $('cm-nick').value = sn; $('cm-nick-save').checked = !!sn;
  if (!keep) {
    const label = from === 's-board' ? (cur.board === 'hot' ? 'HOT' : cur.board === 'mine' ? '내 글' : `${BOARD[cur.board]} 게시판`) : from === 's-comm' ? '커뮤니티' : from === 's-home' ? '홈' : null;
    postBack = label ? { label, back: true } : { label: `${BOARD[p.board]} 게시판`, back: false };
    $('p-back-label').textContent = postBack.label;
  }
  $('p-meta').innerHTML = `<button class="link" data-board="${p.board}">${esc(BOARD[p.board])}</button>${p.topic ? ` · ${esc(TOPIC[p.topic])}` : ''}${p.sample ? ' · <span class="c-tag sample">예시 글</span>' : ''}`;
  $('p-title').textContent = p.title;
  $('p-author').textContent = `${p.nick}${p.job ? ` · ${p.job}` : ''} · ${ago(p.created)}`;
  $('p-body').textContent = p.body;
  $('p-share').hidden = !p.share;
  $('p-share').innerHTML = p.share ? shareHtml(p.share) : '';
  setLike(p.likes, d.liked);
  $('p-acts').hidden = p.sample; // 예시 글은 수정·삭제·신고 불가
  renderComments(d.comments, keep?.mine);
  if (!keep) show('s-post');
  // 관련 법 안내 카드: 말머리 기본 카드 + 제목·본문 낱말로 자동 연결(최대 3개)
  try {
    await loadLaws();
    const text = `${p.title} ${p.body}`;
    const ids = [...(TOPIC_CARD[p.topic] ?? []).slice(0, 1), ...LAWS.topics.filter(t => t.keywords.some(k => text.includes(k))).map(t => t.id)];
    const cards = [...new Set(ids)].slice(0, 3).map(id => LAWS.topics.find(t => t.id === id)).filter(Boolean);
    $('p-cards-wrap').hidden = !cards.length;
    $('p-cards').innerHTML = cards.map(t => `<button class="item row-btn" data-topic="${t.id}"><span><b>${esc(t.title)}</b><br><span class="muted">${esc(t.lead)}</span></span><span class="go">보기 ›</span></button>`).join('');
  } catch { $('p-cards-wrap').hidden = true; }
}
const shareHtml = list => `<div class="k">첨부된 계약서 점검 결과</div>` + list.map(s =>
  `<div class="sh-row lv-${esc(s.level)}"><span class="lv-badge">${esc(s.level)}</span><span>${esc(s.title)}</span></div>`).join('');
function setLike(n, liked) {
  $('p-like').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>도움돼요 · 공감 ${n}`; // UI 개선 ④ 2차 13: 목록·HOT의 '공감'과 같은 숫자임을 보여 줌
  $('p-like').classList.toggle('on', !!liked);
}
// mine: 방금 등록한 댓글({nick, body}) → 같은 닉네임·내용 중 가장 최근 댓글을 표시하고 "등록했어요"(문제 4)
function renderComments(cs, mine) {
  $('p-ccount').textContent = cs.length;
  const mineId = mine ? Math.max(-1, ...cs.filter(c => !c.hidden && c.nick === mine.nick && c.body === mine.body).map(c => c.id)) : -1;
  $('p-comments').innerHTML = cs.length ? cs.map(c => c.hidden
    ? `<div class="cm hidden-cm">신고로 숨겨진 댓글이에요.</div>`
    : `${c.id === mineId ? '<p class="cm-done" role="status">댓글을 등록했어요</p>' : ''}<div class="cm${c.id === mineId ? ' mine' : ''}" data-cid="${c.id}"><div class="cm-h"><b>${esc(c.nick)}</b><span class="muted">${ago(c.created)}</span>${c.sample ? '' : `<span class="cm-acts"><button class="link" data-cdel="${c.id}">삭제</button><button class="link" data-crep="${c.id}">신고</button></span>`}</div><p>${esc(c.body)}</p></div>`).join('')
    : '<div class="empty info-plain">첫 댓글을 남겨 보세요</div>';
  if (mineId >= 0) document.querySelector(`#p-comments [data-cid="${mineId}"]`)?.scrollIntoView({ block: 'nearest' });
}
$('p-back').addEventListener('click', () => (postBack?.back ? history.back() : post && openBoard(post.board)));
$('p-like').addEventListener('click', async () => {
  if (!post) return;
  const d = await api('/like', { id: post.id }).catch(() => null);
  if (!d) return netFail(() => openPost(post.id));
  if (d.already) return setLike(post.likes, true);
  if (d.error) return dialog({ title: '공감하지 못했어요', msg: d.error, ok: '확인', noCancel: true });
  post.likes = d.likes; setLike(d.likes, true);
});

// 댓글 등록
$('cm-body').addEventListener('input', () => { $('cm-count').textContent = `${$('cm-body').value.length}/500`; });
const CM_ELS = () => [$('cm-nick'), $('cm-body'), $('cm-pw')];
$('cm-send').addEventListener('click', async () => {
  const nick = $('cm-nick').value.trim(), body = $('cm-body').value.trim(), pw = $('cm-pw').value;
  warn('cm-warn', '');
  if (showErrs(CM_ELS(), [[$('cm-nick'), lenErr('nick', nick) || piiErr(nick)], [$('cm-body'), lenErr('comment', body) || piiErr(body)], [$('cm-pw'), lenErr('pw', pw)]].filter(x => x[1]))) return;
  $('cm-send').disabled = true;
  const d = await api('/comment', { postId: post.id, nick, body, pw }).catch(() => null);
  $('cm-send').disabled = false;
  if (!d) return warn('cm-warn', '등록하지 못했어요. 인터넷 연결을 확인해 주세요.');
  if (d.error) return warn('cm-warn', d.error);
  const keep = $('cm-nick-save').checked; keepNick(keep, nick); if (keep) myNick = nick;
  warn('cm-warn', ''); $('cm-body').value = ''; $('cm-nick').value = keep ? nick : ''; $('cm-pw').value = ''; $('cm-count').textContent = '0/500';
  openPost(post.id, { mine: { nick, body } });
});
CM_ELS().forEach(el => el.addEventListener('input', () => fieldErr(el, '')));
// 댓글 삭제·신고: 그 자리에서 다시 그림
$('p-comments').addEventListener('click', e => {
  const del = e.target.closest('[data-cdel]'), rep = e.target.closest('[data-crep]');
  if (del) dialog({ title: '댓글 삭제', msg: '댓글을 쓸 때 정한 비밀번호를 입력해 주세요.', pw: true, ok: '삭제',
    run: async pw => { const d = await api('/comment/delete', { id: +del.dataset.cdel, pw }); if (d.error) return d.error; openPost(post.id, true); } });
  if (rep) report('comment', +rep.dataset.crep);
});

// 글 수정·삭제·신고
let pwMode = null, verifiedPw = null;
$('p-edit').addEventListener('click', () => openPw('edit'));
$('p-del').addEventListener('click', () => openPw('delete'));
$('p-report').addEventListener('click', () => report('post', post.id));
function openPw(mode) {
  pwMode = mode; $('pw-h').textContent = mode === 'edit' ? '글 수정 · 비밀번호 확인' : '글 삭제 · 비밀번호 확인';
  $('pw-in').value = ''; warn('pw-warn', ''); show('s-pw');
}
$('pw-back').addEventListener('click', () => history.back());
$('pw-ok').addEventListener('click', async () => {
  const pw = $('pw-in').value;
  const d = await api('/verify', { id: post.id, pw }).catch(() => null);
  if (!d) return warn('pw-warn', '확인하지 못했어요. 인터넷 연결을 확인해 주세요.');
  if (d.error) return warn('pw-warn', d.error);
  // 수정: 비밀번호 화면 기록을 글쓰기로 바꿔 '‹ 뒤로'가 글로 바로 가게(문제 1)
  if (pwMode === 'edit') { verifiedPw = pw; history.replaceState({ screen: 's-write' }, ''); return openWrite({ edit: post }); }
  dialog({ title: '글을 삭제할까요?', msg: '삭제하면 댓글도 함께 지워지고 되돌릴 수 없어요.', ok: '삭제',
    run: async () => { const r = await api('/delete', { id: post.id, pw }); if (r.error) return r.error; dropMine([post.id]); const b = cur.board === 'mine' ? 'mine' : post.board; post = null; openBoard(b); } });
});
function report(kind, id) {
  dialog({ title: kind === 'post' ? '이 글을 신고할까요?' : '이 댓글을 신고할까요?', msg: '개인정보·욕설·비방·광고 같은 문제가 있을 때 신고해 주세요. 신고가 3번 쌓이면 자동으로 숨겨지고 되살릴 수 없어요.', ok: '신고', policy: true,
    run: async () => {
      const d = await api('/report', { kind, id });
      if (d.error) return d.error;
      dialog({ title: '신고가 접수됐어요', msg: d.hidden ? '신고가 3번 쌓여 숨김 처리됐어요.' : '신고가 3번 쌓이면 자동으로 숨겨져요.', ok: '확인', noCancel: true,
        run: () => { if (d.hidden && kind === 'post') show('s-hidden'); else openPost(post.id, true); } });
    } });
}

// 확인 창
let ovRun = null;
function dialog({ title, msg, ok = '확인', pw = false, noCancel = false, run = null, policy = false }) {
  $('cm-ov-t').firstElementChild.textContent = title; $('cm-ov-msg').textContent = msg;
  $('cm-ov-policy').hidden = !policy; // 신고 창에만 삭제 요청 안내(정보통신망법 제44조의2, 2026-11-21)
  $('cm-ov-pw').hidden = !pw; $('cm-ov-pw').value = ''; warn('cm-ov-warn', '');
  $('cm-ov-yes').textContent = ok; $('cm-ov-no').hidden = noCancel; ovRun = run; $('cm-ov').hidden = false;
}
$('cm-ov-no').addEventListener('click', () => { $('cm-ov').hidden = true; });
$('cm-ov-yes').addEventListener('click', async () => {
  const run = ovRun;
  if (!run) { $('cm-ov').hidden = true; return; }
  if (!$('cm-ov-pw').hidden && !$('cm-ov-pw').value) return warn('cm-ov-warn', '비밀번호를 입력해 주세요.');
  $('cm-ov-yes').disabled = true;
  try {
    const err = await run($('cm-ov-pw').value);
    if (err) return warn('cm-ov-warn', err);
    if (ovRun === run) $('cm-ov').hidden = true; // run 안에서 새 창을 열었으면 그대로 둠
  } catch { warn('cm-ov-warn', '처리하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  finally { $('cm-ov-yes').disabled = false; }
});

// ---------- 글쓰기·수정 ----------
let w = { topic: '', share: null, edit: null };
// 새 글 초안: 등록하기 전까지 이 화면(탭)에서만 기억. 기기 저장소에는 남기지 않음(문제 2)
let draft = null;
let myNick = savedNick(), myJob = ''; // 새 글에 입력한 닉네임·근무 형태(글 수정 화면 값과 분리). 닉네임은 저장한 값으로 시작
function syncDraft() {
  if (w.edit) return;
  const title = $('w-title').value, body = $('w-body').value;
  draft = title.trim() || body.trim() ? { board: $('w-board').value, topic: w.topic, title, body, share: w.share } : null;
}
// fromResult: 판정 결과 '공유하기'로 들어옴(첨부를 새로 붙임)
function openWrite({ board = 'qna', topic = '', share = null, edit = null, fromResult = false } = {}) {
  const dr = !edit && draft;
  w = { topic: edit ? edit.topic ?? '' : fromResult || !dr ? topic : dr.topic, share: edit ? edit.share ?? null : fromResult || !dr ? share : dr.share, edit };
  const b = edit ? edit.board : fromResult ? board : dr ? dr.board : (board === 'hot' ? 'qna' : board);
  $('w-title-h').textContent = edit ? '글 수정' : '글쓰기';
  $('w-draft').hidden = !dr;
  $('w-board').innerHTML = Object.entries(BOARD).filter(([k]) => k !== 'hot').map(([k, v]) => `<option value="${k}"${k === b ? ' selected' : ''}>${v}</option>`).join('');
  $('w-board').disabled = !!edit;
  // 새 글은 내가 새 글에 썼던 닉네임·근무 형태를 넣음. 수정한 글의 값이 새 글에 남지 않게 따로 기억(2026-11-21)
  $('w-nick').value = edit ? edit.nick : myNick; $('w-nick').disabled = !!edit;
  $('w-nick-save-wrap').hidden = !!edit; $('w-nick-save').checked = !!savedNick();
  $('w-job').value = edit ? edit.job ?? '' : myJob;
  $('w-title').value = edit ? edit.title : dr ? dr.title : ''; $('w-body').value = edit ? edit.body : dr ? dr.body : '';
  $('w-pw-wrap').hidden = !!edit; $('w-pw').value = '';
  $('w-count').textContent = `${$('w-body').value.length}/2000`;
  $('w-send').textContent = edit ? '수정하기' : '등록하기';
  warn('w-warn', ''); W_ELS().forEach(el => fieldErr(el, ''));
  renderTopics(); renderShare();
  show('s-write');
}
window.openWrite = openWrite;
$('w-back').addEventListener('click', () => history.back());
const W_ELS = () => [$('w-topics'), $('w-nick'), $('w-title'), $('w-body'), $('w-pw')];
[$('w-nick'), $('w-title'), $('w-body'), $('w-pw')].forEach(el => el.addEventListener('input', () => { fieldErr(el, ''); if (el.id === 'w-title' || el.id === 'w-body') syncDraft(); }));
$('w-nick').addEventListener('input', () => { if (!w.edit) myNick = $('w-nick').value; });
$('w-job').addEventListener('change', () => { if (!w.edit) myJob = $('w-job').value; });
function renderTopics() {
  const free = $('w-board').value === 'free';
  $('w-topic-wrap').hidden = free;
  $('w-topics').innerHTML = Object.entries(TOPIC).map(([k, v]) => `<button class="chip${k === w.topic ? ' on' : ''}" data-wtopic="${k}">${v}</button>`).join('');
}
function renderShare() {
  const on = $('w-board').value === 'share' && w.share?.length;
  $('w-share-wrap').hidden = !on;
  $('w-share').innerHTML = on ? w.share.map(s => `<div class="sh-row lv-${esc(s.level)}"><span class="lv-badge">${esc(s.level)}</span><span>${esc(s.title)}</span></div>`).join('') : '';
}
$('w-board').addEventListener('change', () => { if ($('w-board').value === 'free') fieldErr($('w-topics'), ''); renderTopics(); renderShare(); syncDraft(); });
$('w-topics').addEventListener('click', e => { const b = e.target.closest('[data-wtopic]'); if (b) { w.topic = b.dataset.wtopic; fieldErr($('w-topics'), ''); renderTopics(); syncDraft(); } });
$('w-share-del').addEventListener('click', () => { w.share = null; w.shareRemoved = true; renderShare(); syncDraft(); });
$('w-body').addEventListener('input', () => { $('w-count').textContent = `${$('w-body').value.length}/2000`; });
$('w-send').addEventListener('click', async () => {
  const board = $('w-board').value, nick = $('w-nick').value.trim(), job = $('w-job').value, title = $('w-title').value.trim(), body = $('w-body').value.trim(), pw = $('w-pw').value;
  warn('w-warn', '');
  // 틀린 칸을 한꺼번에 칸 아래에 표시하고 첫 칸으로 이동(문제 5)
  const errs = [
    [$('w-topics'), board !== 'free' && !w.topic ? '말머리를 골라 주세요.' : ''],
    [$('w-nick'), w.edit ? '' : lenErr('nick', nick) || piiErr(nick)],
    [$('w-title'), lenErr('title', title) || piiErr(title)],
    [$('w-body'), lenErr('body', body) || piiErr(body)],
    [$('w-pw'), w.edit ? '' : lenErr('pw', pw)],
  ].filter(x => x[1]);
  if (showErrs(W_ELS(), errs)) return;
  $('w-send').disabled = true;
  const topic = board === 'free' ? null : w.topic;
  const d = await (w.edit
    ? api('/edit', { id: w.edit.id, pw: verifiedPw, topic, job, title, body, keepShare: !w.shareRemoved })
    : api('/write', { board, topic, nick, job, title, body, pw, share: board === 'share' ? w.share : null })).catch(() => null);
  $('w-send').disabled = false;
  if (!d) return warn('w-warn', '등록하지 못했어요. 인터넷 연결을 확인해 주세요.');
  if (d.error) return warn('w-warn', d.error);
  verifiedPw = null; w.shareRemoved = false;
  if (!w.edit && Number.isInteger(d.id)) addMine(d.id); // 내 글 모아보기용으로 글 번호만 이 브라우저에 기억
  if (!w.edit) keepNick($('w-nick-save').checked, nick);
  if (!w.edit) draft = null; // 등록했으면 초안 비움
  // 등록 후 글 상세로. 글쓰기·비밀번호 화면은 '뒤로'로 다시 오지 않게 기록을 덮어씀
  history.replaceState({ screen: 's-post' }, '');
  await openPost(d.id);
  fillHome();
});

// 판정 결과 → 공유하기
const TOPIC_OF_CARD = { minwage: 'wage', weekly: 'allowance', hours: 'hours', rest: 'hours', annual: 'hours', probation: 'contract', insurance: 'insurance', dismissal: 'dismissal' };
$('b-share').addEventListener('click', () => {
  const list = (typeof lastFindings !== 'undefined' ? lastFindings : []).map(f => ({ level: f.level, title: f.title }));
  const first = lastFindings?.[0];
  const topic = (first && TOPIC_OF_CARD[window.topicForLaw?.(first)]) || 'etc';
  openWrite({ board: 'share', topic, share: list.length ? list : null, fromResult: true });
});

// 화면 이동: 게시판·글. 글을 누르면 열릴 때까지 그 줄을 회색으로(문제 8)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-board],[data-post]');
  if (!b) return;
  if (b.dataset.board) return openBoard(b.dataset.board);
  if (b.dataset.post) {
    if (b.classList.contains('busy')) return;
    b.classList.add('busy'); b.setAttribute('aria-busy', 'true');
    return openPost(+b.dataset.post).finally(() => { b.classList.remove('busy'); b.removeAttribute('aria-busy'); });
  }
});
