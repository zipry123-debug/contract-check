// 근로계약서 점검 — 휴대폰 웹 화면
// 흐름: 사진 → (브라우저 안에서) 축소·개인정보 가리기 → 서버 /api/extract → 결과 목록
'use strict';

const MAX_SIDE = 2048;          // 서버로 보낼 사진 긴 변(px). 측정 조건과 같음
const JPEG_QUALITY = 0.9;
const $ = id => document.getElementById(id);

// 화면 전환. 휴대폰 '뒤로' 버튼이 사이트를 나가지 않고 이전 화면으로 가도록 방문 기록에 남김
// 분석 중·오류 화면은 잠깐 들르는 화면: 거기서 다른 화면으로 갈 때는 기록을 덮어씀 → 뒤로 가면 그 전 화면(가리기)으로
// 하단 탭: 화면이 속한 탭을 강조(와이어프레임 공통 틀). 가리기·분석 중 화면에서는 탭을 숨김(화면 전체 사용)
const TAB_OF = { 's-home': 's-home', 's-learn': 's-learn', 's-topic': 's-learn', 's-article': 's-learn', 's-comm': 's-comm' };
['s-check', 's-start', 's-quality', 's-mask', 's-wait', 's-confirm', 's-result', 's-detail', 's-help', 's-error', 's-notcontract', 's-quota',
  's-fl-setup', 's-fl-upload', 's-fl-wait', 's-fl-check', 's-fl-result']
  .forEach(s => (TAB_OF[s] = 's-check'));
['s-board', 's-post', 's-write', 's-pw', 's-hidden'].forEach(s => (TAB_OF[s] = 's-comm'));
['s-ask', 's-unknown'].forEach(s => (TAB_OF[s] = 's-ask')); // 2026-11-23 구성 변경: AI 질문 탭
// 하단 탭 강조 + 화면 읽기 프로그램용 현재 탭 표시(aria-current, 2026-11-21 UI 개선 ① 문제 4)
function markTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}
// 화면이 바뀌면 새 화면 제목으로 초점을 옮김 → 화면 읽기 프로그램이 바뀐 화면 이름부터 읽음(2026-11-21 UI 개선 ② 문제 10)
function focusScreen(id) {
  const sc = document.getElementById(id); if (!sc) return;
  const target = [...sc.querySelectorAll('h1, h2')].find(h => h.offsetParent) || sc;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
function show(id, fromHistory = false) {
  // 떠나는 화면의 스크롤 위치를 그 화면 기록에 저장 → 뒤로 돌아오면 보던 곳으로(2026-11-21 UI 개선 ② 문제 9)
  const prev = document.body.dataset.screen;
  if (!fromHistory && prev && prev !== id && history.state?.screen === prev) history.replaceState({ ...history.state, y: Math.round(window.scrollY) }, '');
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.dataset.screen = id;
  markTab(TAB_OF[id]);
  if (fromHistory) {
    const y = history.state?.y || 0;
    window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y));
    focusScreen(id);
    return;
  }
  if (id in backOrigin && BACK_NAME[prev]) { backOrigin[id] = prev; $(BACK_LABEL[id]).textContent = BACK_NAME[prev]; } // 19: 홈/계약서 점검 중 들어온 곳
  window.scrollTo(0, 0);
  focusScreen(id);
  const cur = history.state?.screen;
  if (cur === id) return;
  if (cur === 's-wait' || cur === 's-error' || cur === 's-fl-wait') history.replaceState({ screen: id }, '');
  else history.pushState({ screen: id }, '');
  curState = history.state; // 창이 열린 채 '뒤로'를 누르면 이 기록으로 되돌림(아래 popstate)
}
// 뒤로 버튼(UI 개선 ③ 3차 19): 근로 시작·외주 설정은 홈 또는 계약서 점검 탭에서 들어옴 → 그곳 이름을 보여 주고 그곳으로 감.
// 가리기에서 '다시 고르기'로 돌아온 경우 등은 처음 들어온 곳을 그대로 기억(기록을 되감지 않아 가리기 화면으로 가지 않음)
const BACK_NAME = { 's-home': '홈', 's-check': '계약서 점검' };
const BACK_LABEL = { 's-start': 'start-back-label', 's-fl-setup': 'fls-back-label' };
const backOrigin = { 's-start': 's-check', 's-fl-setup': 's-check' };
$('start-back').addEventListener('click', () => show(backOrigin['s-start']));
$('fls-back').addEventListener('click', () => show(backOrigin['s-fl-setup']));
$('flu-back').addEventListener('click', () => show('s-fl-setup'));
history.replaceState({ screen: 's-home' }, '');
document.body.dataset.screen = 's-home';
markTab('s-home');
// 아이폰 사파리는 터치 이벤트가 등록돼 있어야 누를 때 모양(:active)을 보여 줌(2026-11-21 UI 개선 ① 문제 6)
document.addEventListener('touchstart', () => {}, { passive: true });
// 2026-11-23 UI/UX 점검 1: 창(팝업)이 열린 채 휴대폰 '뒤로'를 누르면 창만 닫고 지금 화면에 머묾
// (예전엔 창을 닫으면서 이전 화면으로 넘어가, 값 확인 중 사진을 보다가 뒤로 하면 가리기 화면으로 튕겼음).
// 브라우저가 이미 이전 기록으로 옮겼으므로 지금 화면 기록을 다시 쌓아 되돌림. PDF 바꾸는 중 창은 예전처럼(뒤로 = 화면 이동)
const OV_IDS = ['nomask', 'edit-ov', 'cm-ov', 'fl-edit-ov', 'fl-nopii-ov', 'photo-ov', 'img-ov'];
let curState = history.state;
window.addEventListener('popstate', e => {
  const openOv = OV_IDS.filter(x => $(x) && !$(x).hidden);
  if (openOv.length && curState) { openOv.forEach(x => { $(x).hidden = true; }); history.pushState(curState, ''); return; }
  curState = e.state;
  const id = e.state?.screen ?? 's-home';
  if (inflight) inflight.abort();          // 분석 중 뒤로 가면 요청 취소
  $('nomask').hidden = true; $('edit-ov').hidden = true; $('cm-ov').hidden = true; $('fl-edit-ov').hidden = true; $('fl-nopii-ov').hidden = true; $('photo-ov').hidden = true; $('img-ov').hidden = true; $('pdf-ov').hidden = true; // 창이 열린 채 뒤로 가면 닫기
  window.flAbort?.(); // 프리랜서 분석 중 뒤로 가면 요청 취소
  if (id === 's-mask' && !cv.width) return show(maskMode ? 's-fl-upload' : 's-start', true);
  show(id, true);
  if (id === 's-mask') fitView();
});
// 2026-11-23 UI/UX 점검 4: 작업이 휴대폰 메모리에만 있으므로, 가리기·값 확인·결과·외주 비교·글쓰기 중에
// 새로고침하거나 창을 닫으려 하면 브라우저가 한 번 묻게 함(브라우저마다 문구는 정해져 있음)
const WORK_SCREENS = new Set(['s-quality', 's-confirm', 's-result', 's-detail', 's-fl-check', 's-fl-result']);
window.addEventListener('beforeunload', e => {
  const sc = document.body.dataset.screen;
  const busy = WORK_SCREENS.has(sc)
    || (sc === 's-mask' && cv.width > 0)
    || (sc === 's-fl-upload' && !!document.querySelector('#fl-slots .pg'))
    || (sc === 's-write' && !!(($('w-title')?.value || '').trim() || ($('w-body')?.value || '').trim()));
  if (busy) { e.preventDefault(); e.returnValue = ''; }
});
// 오류 화면. ctx.retry: '다시 시도'가 할 일(없으면 버튼 숨김), ctx.back: [돌아가기 버튼 문구, 할 일]
let errCtx = {};
function fail(msg, title = '문제가 생겼어요', ctx = {}) {
  errCtx = ctx;
  $('err-title').textContent = title; $('err-msg').textContent = msg;
  $('b-home').textContent = ctx.back?.[0] ?? '계약서 점검 시작으로 돌아가기';
  $('b-retry').hidden = !ctx.retry;
  const from = ctx.tab ?? TAB_OF[document.body.dataset.screen]; // 오류가 난 화면의 탭에 불을 켬(예: 커뮤니티 오류인데 '계약서 점검'이 켜지던 문제, 2026-11-21)
  show('s-error');
  if (from) markTab(from);
}

// ---------- 1. 사진 불러오기 (EXIF 회전 반영 + 축소) ----------
const cv = $('cv'), ctx = cv.getContext('2d');
let strokes = [];      // 가리기 획 목록 [{w, pts:[[x,y]...]}] — 되돌리기용
let baseImage = null;  // 축소된 원본(가리기 전)

const MAX_FILE_MB = 40;
async function decode(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } // 휴대폰 사진의 회전 정보 반영
  catch {
    // 일부 기기·형식에서 실패하면 <img>로 다시 시도
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  }
}
async function loadImage(blob, opt = {}) {
  preMasked = !!opt.preMasked;
  if (blob.type && !blob.type.startsWith('image/')) return fail('사진 파일(JPG·PNG)만 올릴 수 있어요.');
  if (blob.size > MAX_FILE_MB * 1024 * 1024) return fail(`사진 파일이 너무 커요(${MAX_FILE_MB}MB 초과). 카메라로 다시 찍어 주세요.`);
  try {
    const bmp = await decode(blob);
    if (!bmp.width || !bmp.height) throw new Error('empty');
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close?.();
    baseImage = ctx.getImageData(0, 0, cv.width, cv.height);
    strokes = [];
    $('mask-toast').hidden = true; updateMaskCount();
    document.querySelector('[data-tool="move"]').click(); // 새 사진은 이동 도구로 시작
    // 반사·흐림이 보이면 경고 화면 먼저(와이어프레임 '반사·흐림 경고 화면'), 아니면 바로 가리기
    updatePageUI();
    if (checkQuality().length) return show('s-quality');
    show('s-mask');
    fitView(); // 화면을 보인 직후 크기를 재서 맞춤(clientWidth를 읽으면 배치가 바로 계산됨)
  } catch (e) {
    fail('사진을 열지 못했어요. JPG·PNG 사진으로 다시 시도해 주세요. (아이폰 HEIC 사진은 열리지 않을 수 있어요)');
  }
}
let isSample = false; // 가상 샘플은 개인정보가 미리 가려져 있어 '가리지 않음' 경고를 띄우지 않음
let preMasked = false; // 2026-11-22: 이미 가린 장을 다시 열었을 때(장 빼기 뒤 등) — 가린 그대로라 '가리지 않음' 경고를 띄우지 않음
let replaceAt = null;  // 2026-11-22: 품질 경고에서 '다시 촬영'으로 바꿀 장 번호(여러 장일 때)
// 2026-11-22: 근로계약서도 여러 장(최대 3장). 사진·PDF를 함께 골라도 되고, 가리기 화면에서 '다음 장 추가'도 됨
// 쪽마다 가리기(한 곳 이상) → 마지막 쪽에서 [분석하기] → 가린 쪽만 한 번에 보냄
const MAX_PAGES = 3;
let pages = [];     // 각 쪽: { blob, masked: 가린 사진(dataURL) 또는 null }
let curPage = 0;    // 지금 가리는 쪽(0부터)
function resetPages() { pages = []; curPage = 0; $('mask-note').hidden = true; }
// 고른 파일들(사진·PDF 섞여도 됨)을 쪽 사진(Blob) 목록으로. PDF는 휴대폰 안에서 사진으로 바꿈
async function filesToBlobs(files, room) {
  const out = []; let dropped = 0;
  for (const f of files) {
    if (out.length >= room) { dropped++; continue; }
    if (window.isPdf?.(f)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) throw Object.assign(new Error('big'), { userMsg: `PDF 파일이 너무 커요(${MAX_FILE_MB}MB 초과). 계약서 쪽만 캡처해 사진으로 올려 주세요.` });
      const job = pdfBusy('PDF를 사진으로 바꾸고 있어요…');
      const { blobs, total } = await window.pdfToImages(f, room - out.length);
      if (pdfCancelled(job)) throw Object.assign(new Error('cancel'), { cancelled: true }); // 바꾸는 중 '취소'를 눌렀으면 결과를 버림
      out.push(...blobs); dropped += total - blobs.length;
    } else out.push(f);
  }
  pdfDone();
  return { blobs: out, dropped };
}
async function addFiles(files, { fresh }) {
  if (!files.length) return;
  isSample = false;
  if (fresh) resetPages();
  const room = MAX_PAGES - pages.length;
  try {
    const { blobs, dropped } = await filesToBlobs(files, room);
    if (!blobs.length) return;
    const first = pages.length;
    blobs.forEach(blob => pages.push({ blob, masked: null }));
    $('mask-note').textContent = dropped ? `한 번에 ${MAX_PAGES}장까지 분석해요. 앞에서부터 ${MAX_PAGES}장만 넣었어요(${dropped}장은 빠짐).` : '';
    $('mask-note').hidden = !dropped;
    curPage = first; openPage(curPage);
  } catch (e) { pdfDone(); if (e.cancelled) return; fail(e.userMsg || PDF_ERR(e)); }
}
// 한 장 열기: 이미 가린 장이면 가린 사진을 그대로 열어 이어서 가릴 수 있게
async function openPage(i) {
  const p = pages[i];
  if (p.masked && !p.noPii) loadImage(await (await fetch(p.masked)).blob(), { preMasked: true });
  else loadImage(p.blob); // '개인정보 없음' 장은 원본을 다시 열어 마음이 바뀌면 가릴 수 있게
}
// 품질 경고에서 '다시 촬영': 여러 장이면 그 장만 바꿈(첫 파일만, PDF면 첫 쪽)
async function replacePage(at, files) {
  try {
    const { blobs } = await filesToBlobs(files.slice(0, 1), 1);
    if (!blobs.length) return;
    pages[at] = { blob: blobs[0], masked: null }; curPage = at; openPage(at);
  } catch (e) { pdfDone(); if (e.cancelled) return; fail(e.userMsg || PDF_ERR(e)); }
}
for (const id of ['in-camera', 'in-file']) {
  $(id).addEventListener('change', e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(fs, { fresh: true }); });
}
$('in-more').addEventListener('change', e => {
  const fs = [...(e.target.files ?? [])]; e.target.value = '';
  if (replaceAt !== null) { const at = replaceAt; replaceAt = null; return replacePage(at, fs); }
  addFiles(fs, { fresh: false });
});
document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', async () => {
  try { resetPages(); isSample = true; const blob = await (await fetch(b.dataset.sample)).blob(); pages = [{ blob, masked: null }]; loadImage(blob); } catch { fail('샘플을 불러오지 못했어요.'); }
}));
// 가리기 화면의 쪽 표시·버튼 이름(외주 비교에서 빌려 쓸 때는 숨김)
function updatePageUI() {
  const multi = !maskMode && pages.length > 1, last = curPage >= pages.length - 1;
  $('page-bar').hidden = !multi; $('b-back1').hidden = multi; // 여러 장이면 '다시 찍기'는 쪽 줄로(그 장만 바꿈)
  // 2026-11-23 UI/UX 점검 2: '· 개인정보 없음'을 붙이면 375px에서 줄이 넘쳐 쪽 줄에는 쪽 번호만(그 장 상태는 아래 '가린 곳' 줄에 표시)
  $('mask-page').textContent = multi ? `${curPage + 1} / ${pages.length}장` : '';
  $('b-prev-page').style.visibility = curPage > 0 ? '' : 'hidden'; // 첫 장에선 자리만 남김(쪽 표시 위치 고정)
  $('b-add-page').hidden = !!maskMode || isSample || !last || pages.length >= MAX_PAGES || !pages.length;
  if (!maskMode) $('b-send').textContent = !last ? `가리기 완료 · 다음 장(${curPage + 2}/${pages.length})` : pages.length > 1 ? `분석하기 (${pages.length}장)` : '분석하기';
}
// 다음 장 추가: 지금 쪽을 먼저 가려야 함 → 가린 사진을 저장하고 파일 고르기(휴대폰에선 카메라도 고를 수 있음)
$('b-add-page').addEventListener('click', () => {
  if (needMask()) return nomask(true, 'add');
  savePage();
  replaceAt = null; $('in-more').click();
});
// 이 장 빼기(여러 장일 때): 지운 뒤 다음 장, 마지막이었으면 앞 장(가린 그대로)을 염
$('b-del-page').addEventListener('click', () => {
  if (pages.length < 2) return;
  if ((strokes.length || (pages[curPage].masked && !pages[curPage].noPii)) && !confirm('이 장과 가린 내용이 빠져요. 뺄까요?')) return; // 2026-11-23 UI/UX 점검 7
  pages.splice(curPage, 1);
  if (curPage >= pages.length) curPage = pages.length - 1;
  openPage(curPage);
});
// 이전 장(2026-11-22): 지금 장에서 새로 가린 것은 저장해 두고 앞 장을 가린 그대로 엶
$('b-prev-page').addEventListener('click', () => {
  if (curPage < 1) return;
  if (strokes.length) savePage();
  curPage--; openPage(curPage);
});
// 쪽 줄의 다시 찍기: 이 장만 새 사진·PDF로 바꿈(품질 경고의 '다시 촬영'과 같은 방식)
$('b-page-retake').addEventListener('click', () => { replaceAt = curPage; $('in-more').click(); });

// 사이트 수정 7(2026-11-22): PDF 계약서 → 휴대폰 안에서 쪽별 사진으로 바꿈(pdfpages.js). 같은 날 여러 장 분석으로 바뀌어 쪽 고르기 창은 '바꾸는 중' 표시로만 씀
const PDF_ERR = e => (e?.name === 'PasswordException' ? '암호가 걸린 PDF는 열 수 없어요. 암호를 푼 PDF나 화면을 캡처한 사진으로 올려 주세요.'
  : 'PDF를 열지 못했어요. 인터넷 연결을 확인하거나, PDF 화면을 캡처한 사진으로 올려 주세요.');
let pdfJob = 0; // 바꾸기 작업 번호: '취소'를 누르면 올려서 진행 중이던 결과를 버림
window.pdfBusy = msg => { $('pdf-msg').textContent = msg; $('pdf-ov').hidden = false; return ++pdfJob; };
window.pdfDone = () => { $('pdf-ov').hidden = true; };
window.pdfCancelled = job => job !== pdfJob;
window.PDF_ERR = PDF_ERR;
$('b-pdf-cancel').addEventListener('click', () => { pdfJob++; pdfDone(); });

// 사진 품질 검사(반사·흐림·어두움): 긴 변 512px 회색조로 줄여 계산. 경고만 하고 진행은 사용자가 선택
function checkQuality() {
  try {
    const s = 512 / Math.max(cv.width, cv.height), w = Math.round(cv.width * s), h = Math.round(cv.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
    const issues = Quality.judgeQuality(Quality.qualityMetrics(g, w, h));
    $('q-msg').innerHTML = issues.map(t => '<p>' + t + '</p>').join('') + '<p class="muted">이대로 보내면 AI가 글자를 잘못 읽을 가능성이 높아요.</p>';
    return issues;
  } catch { return []; }
}
// 프리랜서 비교에서 가리기 화면을 빌려 쓸 때: { done(dataUrl), back() }. 근로계약서 점검이면 null
let maskMode = null;
function setMaskMode(m) {
  maskMode = m;
  $('b-send').textContent = m ? '가리기 완료' : '분석하기';
  $('b-back1').textContent = m ? '돌아가기' : '다시 찍기';
  updatePageUI();
}
$('b-retake').addEventListener('click', () => {
  if (maskMode) return maskMode.back();
  if (pages.length > 1) { replaceAt = curPage; return $('in-more').click(); } // 여러 장이면 이 장만 다시(2026-11-22)
  show('s-start');
});
$('b-qok').addEventListener('click', () => { show('s-mask'); fitView(); });

// ---------- 2. 개인정보 가리기 ----------
// 한 손가락: 선택한 도구(네모로 가리기 / 붓으로 칠하기 / 사진 이동)
// 두 손가락: 언제나 확대·축소·이동 (그리던 것은 취소)
const stage = $('stage');
const BRUSH_SCREEN_PX = 10;            // 붓 굵기(화면 기준). 계약서 글자 한 줄 높이 정도. 확대하면 더 가늘게 칠해짐
let tool = 'move';                     // 기본은 이동(휴대폰 시험 의견: 확대·이동 후 네모로 가리기)
const view = { s: 1, tx: 0, ty: 0, fit: 1 };

function applyView() { cv.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})`; }
function fitView() {
  const W = stage.clientWidth, H = stage.clientHeight;
  view.fit = view.s = Math.min(W / cv.width, H / cv.height);
  view.tx = (W - cv.width * view.s) / 2; view.ty = (H - cv.height * view.s) / 2;
  applyView();
}
// 확대 중심(px,py: 무대 기준)이 제자리에 있도록 배율 변경
function zoomAt(px, py, s) {
  s = Math.min(view.fit * 8, Math.max(view.fit, s));
  view.tx = px - (px - view.tx) * s / view.s; view.ty = py - (py - view.ty) * s / view.s; view.s = s;
  applyView();
}

// 가린 곳 수를 '분석하기' 위에 미리 보여 줌(누른 뒤에야 경고하지 않게, 2026-11-21 UI 개선 ③ 문제 13)
function updateMaskCount() {
  $('mask-count').innerHTML = isSample ? '가상 샘플이라 개인정보가 미리 가려져 있어요'
    : preMasked && !strokes.length ? '이미 가린 장이에요. 더 가릴 곳이 있으면 칠해 주세요'
    : !maskMode && pages[curPage]?.noPii && !strokes.length ? "'개인정보 없음'으로 고른 장이에요(가리지 않고 보내요). 가릴 곳이 있으면 칠해 주세요"
    : `가린 곳 <b>${strokes.length}곳</b> <span>· 이름·주민번호·주소·연락처·계좌를 모두 가렸는지 확인해 주세요</span>`;
}
function redraw() {
  updateMaskCount();
  ctx.putImageData(baseImage, 0, 0);
  ctx.fillStyle = ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (s.type === 'rect') {
      const [a, b] = s.pts; ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
      continue;
    }
    ctx.lineWidth = s.w; ctx.beginPath();
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); // 점 한 번 찍기
    ctx.stroke();
  }
}
// 화면 좌표 → 캔버스(원본 사진) 좌표
const toCanvas = e => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left - view.tx) / view.s, (e.clientY - r.top - view.ty) / view.s]; };
const toStage = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

const pointers = new Map();   // 지금 화면에 닿은 손가락들
let drawing = null, pan = null, pinch = null, lastTap = null;
stage.addEventListener('pointerdown', e => {
  if (e.target.closest('.zoom')) return; // 확대 버튼 누름은 그리기·이동으로 처리하지 않음
  e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저·합성 이벤트 */ }
  pointers.set(e.pointerId, toStage(e));
  if (pointers.size === 2) {               // 두 번째 손가락 → 그리던 것 취소하고 확대 모드
    if (drawing) { strokes.splice(strokes.indexOf(drawing), 1); drawing = null; redraw(); }
    pan = null;
    const [p, q] = [...pointers.values()];
    pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), m: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], s: view.s, tx: view.tx, ty: view.ty };
    return;
  }
  if (pointers.size > 2) return;
  if (tool === 'move') {
    // 두 번 톡톡(350ms 안, 가까운 자리) → 그 자리 2.5배 확대, 이미 크게 확대돼 있으면 전체 보기
    const p = toStage(e), now = Date.now();
    if (lastTap && now - lastTap.t < 350 && Math.hypot(p[0] - lastTap.p[0], p[1] - lastTap.p[1]) < 30) {
      lastTap = null;
      if (view.s > view.fit * 3) fitView(); else zoomAt(p[0], p[1], view.s * 2.5);
      return;
    }
    lastTap = { t: now, p };
    pan = { p, tx: view.tx, ty: view.ty }; return;
  }
  const pt = toCanvas(e);
  drawing = tool === 'rect' ? { type: 'rect', pts: [pt, pt] } : { type: 'brush', w: BRUSH_SCREEN_PX / view.s, pts: [pt] };
  strokes.push(drawing); redraw();
});
stage.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  e.preventDefault(); pointers.set(e.pointerId, toStage(e));
  if (pinch && pointers.size >= 2) {
    const [p, q] = [...pointers.values()];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]), m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    // 처음 상태에서 다시 계산(오차 누적 방지): 확대 + 두 손가락 중심 이동
    Object.assign(view, { s: pinch.s, tx: pinch.tx + m[0] - pinch.m[0], ty: pinch.ty + m[1] - pinch.m[1] });
    zoomAt(m[0], m[1], pinch.s * d / pinch.d);
    return;
  }
  if (pan) { const [x, y] = toStage(e); view.tx = pan.tx + x - pan.p[0]; view.ty = pan.ty + y - pan.p[1]; applyView(); return; }
  if (drawing) { const pt = toCanvas(e); if (drawing.type === 'rect') drawing.pts[1] = pt; else drawing.pts.push(pt); redraw(); }
});
function pointerEnd(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    // 너무 작은 네모(그냥 톡 친 경우)는 버림
    if (drawing?.type === 'rect') { const [a, b] = drawing.pts; if (Math.abs(a[0] - b[0]) * view.s < 6 || Math.abs(a[1] - b[1]) * view.s < 6) { strokes.pop(); redraw(); } }
    drawing = null; pan = null;
  }
}
stage.addEventListener('pointerup', pointerEnd);
stage.addEventListener('pointercancel', pointerEnd);
// 컴퓨터에서는 마우스 휠로 확대
stage.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = toStage(e); zoomAt(x, y, view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });

document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
  tool = b.dataset.tool;
  document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b));
}));
$('b-undo').addEventListener('click', () => { strokes.pop(); redraw(); });
$('b-fit').addEventListener('click', fitView);
const zoomCenter = k => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, view.s * k);
$('b-zin').addEventListener('click', () => zoomCenter(1.6));
$('b-zout').addEventListener('click', () => zoomCenter(1 / 1.6));
$('b-back1').addEventListener('click', () => {
  if (maskMode) return maskMode.back();
  // 2026-11-23 UI/UX 점검 7: 가린 곳이 있으면 지우기 전에 묻기
  if ((strokes.length || pages.some(p => p.masked)) && !confirm('지금까지 가린 내용이 지워져요. 다시 찍을까요?')) return;
  resetPages(); show('s-start');
});
// 화면 크기 변화(휴대폰 주소창 표시·숨김, 회전): 확대 안 한 상태면 다시 맞추고, 확대 중이면 그대로 둠
window.addEventListener('resize', () => {
  if (!$('s-mask').classList.contains('active') || !cv.width) return;
  const atFit = Math.abs(view.s - view.fit) < 1e-6;
  view.fit = Math.min(stage.clientWidth / cv.width, stage.clientHeight / cv.height);
  if (atFit) fitView();
});

// ---------- 3. 서버로 보내기 ----------
let lastPayload = null, timer = null, inflight = null;
const WAIT_MSG = [[0, 'AI가 계약서를 읽고 있어요…'], [10, '두 번 읽어 서로 비교하고 있어요…'], [25, '서버가 붐벼 조금 더 걸리고 있어요. 1분 넘게 걸리지는 않아요.']];
async function analyze(payload) {
  lastPayload = payload;
  const again = { retry: () => analyze(payload) };
  if (!navigator.onLine) return fail('인터넷에 연결되어 있지 않아요. 와이파이나 모바일 데이터를 켠 뒤 다시 시도해 주세요.', '분석을 끝내지 못했어요', again);
  show('s-wait');
  const t0 = Date.now();
  // 단계 표시: 사진을 보낸 뒤에는 본 읽기(1차)와 검증 읽기(2차)가 서버에서 동시에 진행되므로 둘을 함께 '진행 중'으로 표시
  const setStep = (a, b, c) => [a, b, c].forEach((s, i) => { const el = $('st' + (i + 1)); el.className = 'step ' + s; if (s === 'doing') el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); }); // UI/UX 점검 20
  setStep('doing', '', '');
  const tick = () => {
    const sec = Math.round((Date.now() - t0) / 1000);
    $('wait-sec').textContent = `${sec}초`;
    $('wait-msg').textContent = WAIT_MSG.filter(([t]) => sec >= t).pop()[1];
    if (Date.now() - t0 > 700) setStep('done', 'doing', 'doing');
  };
  tick(); timer = setInterval(tick, 500);
  const ctl = new AbortController(); inflight = ctl;
  const to = setTimeout(() => ctl.abort('timeout'), 90000);
  try {
    const res = await fetch('/api/extract', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ images: payload }), signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) return show('s-quota'); // 하루 사용량 초과(와이어프레임 '사용량 초과 안내')
    if (!res.ok || !data.result) {
      throw new Error(data.error || (res.status >= 500 ? 'AI 응답이 지연되거나 서버에 잠깐 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' : `요청을 처리하지 못했어요 (${res.status})`));
    }
    current = { result: data.result, types: Object.fromEntries((data.schema ?? []).map(f => [f.name, f])) };
    // 읽은 값이 거의 없으면(계약서가 아니거나 너무 흐린 사진) '계약서가 아닌 사진' 안내
    // 예/아니오 항목의 '아니오'(체크 없음 등)는 빈 사진에서도 나오므로 세지 않음
    const filled = Object.values(data.result).filter(f => f && f.value !== null && f.value !== false && f.value !== '' && !(Array.isArray(f.value) && !f.value.length)).length;
    if (filled < 5) return show('s-notcontract');
    renderResult(data.result);
    renderFindings(data.findings ?? []);
    expandFields(false);
    ckMode(false); resMode(false); renderConfirm();
    show('s-confirm');
  } catch (e) {
    if (ctl.signal.aborted && ctl.signal.reason !== 'timeout') return; // 사용자가 취소함
    fail(ctl.signal.reason === 'timeout' ? 'AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.'
      : e instanceof TypeError ? '인터넷 연결이 끊겼어요. 연결을 확인하고 다시 시도해 주세요.' : e.message, '분석을 끝내지 못했어요', again);
  } finally { clearInterval(timer); clearTimeout(to); inflight = null; }
}
// 분석 취소 → 가린 그대로 가리기 화면으로(다시 고르지 않게, 2026-11-21 UI 개선 ③ 문제 11. 예전: 점검 시작 화면)
$('b-cancel').addEventListener('click', () => {
  inflight?.abort('cancel');
  if (!cv.width) return show('s-start');
  show('s-mask'); fitView(); $('mask-toast').hidden = false;
});
const send = () => analyze(pages.map(p => p.masked)); // 가린 쪽들(순서대로)
// 아무것도 가리지 않았으면 확인 경고 후 진행(사용자 확정 2026-11-18)
// 직접 찍거나 고른 사진은 한 곳 이상 가려야 분석(대회 규칙: 실제 개인정보를 외부 AI로 보내지 않음. 사용자 확정 2026-11-18)
// 2026-11-22: 여러 장일 때 개인정보가 없는 장은 사용자가 고르면 가리지 않고 보냄(아래 needMask·nomask)
// 가상 샘플은 개인정보가 미리 가려져 있어 바로 분석. 실제로 다 가렸는지는 코드로 알 수 없어 '한 곳 이상'만 확인
// 2026-11-22 사용자 결정: 여러 장일 때 개인정보가 전혀 없는 장은 '개인정보 없음'으로 골라 가리지 않은 그대로 보낼 수 있음.
// 안전장치: 한 계약서에서 가린 장이 한 장 이상 있어야 함(이름·서명은 어딘가에 있으므로). 한 장짜리는 예전처럼 꼭 가려야 함
const needMask = () => !strokes.length && !isSample && !preMasked && !(!maskMode && pages[curPage]?.noPii);
// 지금 장 저장: 새로 가린 곳이 있으면 '개인정보 없음' 표시를 풂
function savePage() { const p = pages[curPage]; p.masked = cv.toDataURL('image/jpeg', JPEG_QUALITY); if (strokes.length) p.noPii = false; }
const maskedCount = (except = -1) => pages.filter((p, i) => i !== except && p.masked && !p.noPii).length;
let nomaskFor = 'send'; // 경고를 띄운 버튼: 'send'(가리기 완료·분석하기) | 'add'(다음 장 추가) | 'all'(모든 장이 '개인정보 없음')
function nomask(open, why = 'send') {
  $('nomask').hidden = !open; if (!open) return;
  nomaskFor = why;
  const multi = !maskMode && pages.length > 1;
  // 마지막 장인데 다른 장도 하나도 안 가렸으면 '개인정보 없음'을 고를 수 없음(다음 장 추가·앞쪽 장은 뒤에서 가릴 수 있어 허용)
  const canNoPii = multi && why !== 'all' && (why === 'add' || curPage < pages.length - 1 || maskedCount(curPage) > 0);
  $('nomask-t').innerHTML = why === 'all' ? "<b>모든 장을 '개인정보 없음'으로 보낼 수는 없어요</b>" : '<b>아직 아무것도 가리지 않았어요</b>';
  $('nomask-multi').hidden = !canNoPii; $('b-nomask-nopii').hidden = !canNoPii;
  $('nomask-all').hidden = !(multi && !canNoPii);
}
function nextOrSend() {
  if (curPage < pages.length - 1) { curPage++; return openPage(curPage); } // 다음 장 가리기
  if (maskedCount() === 0 && !isSample) return nomask(true, 'all'); // 모든 장이 '개인정보 없음'이면 보내지 않음
  send();
}
$('b-send').addEventListener('click', () => {
  if (needMask()) return nomask(true, 'send');
  $('mask-toast').hidden = true;
  if (maskMode) return maskMode.done(cv.toDataURL('image/jpeg', JPEG_QUALITY)); // 프리랜서: 가린 사진을 돌려주고 올리기 화면으로
  if (!pages.length) pages = [{ blob: null, masked: null }]; // 혹시 목록이 비었으면 지금 화면을 한 장으로
  savePage();
  nextOrSend();
});
// '이 장엔 개인정보가 없어요': 가리지 않은 그대로 저장하고 원래 하려던 일(다음 장·분석·다음 장 추가)을 이어서 함
$('b-nomask-nopii').addEventListener('click', () => {
  nomask(false);
  const p = pages[curPage]; p.masked = cv.toDataURL('image/jpeg', JPEG_QUALITY); p.noPii = true; $('mask-toast').hidden = true;
  if (nomaskFor === 'add') { replaceAt = null; return $('in-more').click(); }
  nextOrSend();
});
// 근로계약서 점검으로 들어오면 가리기 화면을 원래 모드로
document.querySelectorAll('[data-go="s-start"], #in-camera, #in-file, [data-sample]').forEach(el => el.addEventListener('click', () => setMaskMode(null)));
$('b-nomask-back').addEventListener('click', () => { nomask(false); document.querySelector('[data-tool="rect"]').click(); });
$('b-retry').addEventListener('click', () => errCtx.retry?.());
// 사이트 수정 16(2026-11-22): 결과 화면 '다른 계약서 점검하기' → 근로계약서 점검 시작
$('b-new-check').addEventListener('click', () => {
  // 2026-11-23 UI/UX 점검 7: 지금 결과는 저장되지 않으므로 한 번 묻기
  if (!confirm(`지금 결과는 사라져요. 필요하면 먼저 '결과 요약 복사'나 '${$('print-label').textContent}'를 해 두세요. 새 계약서를 점검할까요?`)) return;
  show('s-start');
});
$('b-home').addEventListener('click', () => (errCtx.back ? errCtx.back[1]() : show(maskMode ? 's-fl-upload' : 's-start')));

// ---------- 4. 결과 표시 (와이어프레임 '판정 결과 화면'·'판정 상세 화면') ----------
let lastFindings = [];
const firstSentence = s => (String(s).match(/^.*?[.!?](?=\s|$)/) ?? [s])[0];
function renderFindings(list) {
  lastFindings = list;
  for (const lv of ['위험', '주의', '참고']) $('n-' + lv).textContent = `${list.filter(f => f.level === lv).length}`;
  // 2026-11-23 구성 변경: 등급별 묶음(위험·주의 / 참고) + 카드에 근거 조문 + '상세 보기 ›'. 인쇄 때 카드가 보이도록 카드는 div, 버튼은 안쪽에만
  const card = (f, i) => `<div class="f-item rd-f lv-${f.level}${i === 0 ? ' c-open' : ''}"><div class="rd-fh" role="button" tabindex="0" aria-expanded="${i === 0}"><b>${esc(f.title)}${f.unsure ? ' <span class="tag check"><span class="ic" data-ic="alert" aria-hidden="true"></span> 읽기 불확실</span>' : ''}</b><span class="rd-lv"><i aria-hidden="true"></i>${f.level}</span></div>
      <p>${esc(firstSentence(f.detail))}</p>${f.law ? `<div class="rd-law">근거 조문 · ${esc(f.law)}</div>` : ''}
      <button class="rd-more" data-detail="${i}">대응 방법 보기 ›</button></div>`;
  const ix = list.map((f, i) => [f, i]), g1 = ix.filter(([f]) => f.level !== '참고'), g2 = ix.filter(([f]) => f.level === '참고');
  $('findings').innerHTML = list.length
    ? (g1.length ? '<div class="rd-g"><b>확인이 필요한 조항</b><small>법 기준보다 불리할 수 있어요</small></div>' + g1.map(([f, i]) => card(f, i)).join('') : '')
      + (g2.length ? '<div class="rd-g"><b>참고하세요</b><small>상황에 따라 달라질 수 있어요</small></div>' + g2.map(([f, i]) => card(f, i)).join('') : '')
    : '<div class="card"><p>법 기준과 비교해 눈에 띄는 문제를 찾지 못했어요. 그래도 아래 읽은 내용이 원본과 같은지 확인해 주세요.</p></div>';
  $('b-first-detail').hidden = !list.length;
}
// 2026-11-23 21번 구성안 C: 판정 카드 머리를 누르면 펼치기·접기(첫 카드만 펼친 채 시작)
const toggleF = h => { const c = h.closest('.rd-f'); const on = c.classList.toggle('c-open'); h.setAttribute('aria-expanded', on); };
$('findings').addEventListener('click', e => { const b = e.target.closest('[data-detail]'); if (b) return openDetail(+b.dataset.detail); const h = e.target.closest('.rd-fh'); if (h) toggleF(h); });
$('findings').addEventListener('keydown', e => { const h = e.target.closest('.rd-fh'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleF(h); } });
// 2026-11-23 UI/UX 점검 5: 결과 보관 — 요약 글 복사(메모·메신저에 붙여 넣기), 인쇄 창(휴대폰에서 'PDF로 저장' 선택)
function resultSummary() {
  const r = current?.result ?? {}, v = n => r[n]?.value;
  const cnt = ['위험', '주의', '참고'].map(lv => `${lv} ${lastFindings.filter(f => f.level === lv).length}건`).join(' · ');
  const lines = [`계약스캔 근로계약서 점검 결과 (${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)})`, $('res-sub').textContent, cnt, ''];
  if (!lastFindings.length) lines.push('법 기준과 비교해 눈에 띄는 문제를 찾지 못했어요.', '');
  lastFindings.forEach(f => lines.push(`[${f.level}] ${f.title}`, `- ${f.detail}`, `- 근거: ${f.law}`, ''));
  lines.push('핵심 계약 조건');
  [...$('core-list').querySelectorAll('.item.core')].forEach(it => lines.push(`- ${it.querySelector('.k').textContent}: ${it.querySelector('.v').textContent}`));
  lines.push('', 'AI가 계약서를 읽고 정해진 규칙(코드)이 판정한 결과이며 법률 자문이 아닙니다. 사업장 규모(5명 미만 등)나 실제 근무 사정에 따라 달라질 수 있어요.',
    '상담: 고용노동부 고객상담센터 1350(국번 없이)', location.origin);
  return lines.join('\n').replace(/⁠/g, '').replace(/ /g, ' '); // UI/UX 2차: 줄바꿈 표시 빼기(복사·이미지용)
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* 복사 미지원 */ } ta.remove(); return ok;
  }
}
$('b-copy-result').addEventListener('click', async () => {
  const ok = await copyText(resultSummary());
  $('copy-status').textContent = ok ? '결과 요약을 복사했어요. 메모·메신저에 붙여 넣어 보관하세요.' : `이 브라우저에서는 복사가 안 돼요. '${$('print-label').textContent}'를 이용해 주세요.`;
});
// 2026-11-23 사용자 휴대폰 확인: 'PDF로 저장·인쇄'를 눌러도 화면이 안 뜸 — [추정] 카카오톡 등 앱 안 브라우저·일부 브라우저는 window.print()가 아무것도 안 함.
// 인쇄 창이 실제로 열리면 beforeprint가 옴 → 1.5초 안에 안 오면 안내(근본 해결은 '이미지로 저장' 등, 인수인계 참고)
// 2026-11-23 사용자 확인: 카카오톡 앱 안에서 열었음 → 앱 안 브라우저면 인쇄 대신 '이미지로 저장'(길게 눌러 저장).
// [확인] 카카오톡 앱 안 브라우저는 파일 받기(Blob)도 안 된다는 개발자 포럼 보고가 있어, 앱 안에서는 '파일로 받기' 버튼을 숨김.
const UA = navigator.userAgent, IS_KAKAO = /KAKAOTALK/i.test(UA);
const IN_APP = IS_KAKAO || /NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|BAND\//i.test(UA);
if (IN_APP) {
  // 2026-11-23 사용자 요청: 안내 띠를 닫을 수 있게 — 닫으면 이 창(탭)을 닫을 때까지 다시 안 보임(sessionStorage, 안 되면 이번 화면만)
  let closed = false; try { closed = sessionStorage.getItem('inappClosed') === '1'; } catch { /* 저장 불가 */ }
  $('inapp-note').hidden = closed; // (버튼 이름은 아래에서 '이미지로 저장')
  $('inapp-name').textContent = IS_KAKAO ? '카카오톡 안에서 열려 있어요.' : '앱 안에서 열려 있어요.';
  $(IS_KAKAO ? 'b-open-ext' : 'inapp-how').hidden = false;
  $('print-label').textContent = '이미지로 저장';
}
// 카카오톡 외부 브라우저 열기 주소(공식 문서 아님, 커뮤니티 예시 — 실기기 확인 필요)
$('b-inapp-close').addEventListener('click', () => {
  $('inapp-note').hidden = true; try { sessionStorage.setItem('inappClosed', '1'); } catch { /* 저장 불가 */ }
  document.querySelector('#s-home .hero-t')?.focus?.();
});
$('b-open-ext').addEventListener('click', () => { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href); });

// 결과 요약(resultSummary)을 그림(PNG)으로: 외부 라이브러리 없이 canvas에 줄바꿈해 그림
function summaryImage() {
  const W = 1080, P = 64, MAXW = W - P * 2, FONT = getComputedStyle(document.body).fontFamily;
  const cv2 = document.createElement('canvas'), c = cv2.getContext('2d');
  const style = t => { const m = t.match(/^\[(위험|주의|참고)\]/); return { size: 34, lh: 54, bold: !!m || t === '핵심 계약 조건', color: m ? { 위험: '#c62828', 주의: '#b85c00', 참고: '#555' }[m[1]] : '#111' }; };
  const rows = [];
  resultSummary().split('\n').forEach((t, i) => {
    const s = i === 0 ? { size: 44, lh: 66, bold: true, color: '#111' } : style(t);
    if (!t) { rows.push({ t: '', s: { ...s, lh: 24 } }); return; }
    c.font = `${s.bold ? 700 : 400} ${s.size}px ${FONT}`;
    let line = '';
    for (const w of t.split(/(?<= )/)) { // 단어 단위(띄어쓰기 유지), 한 단어가 너무 길면 글자 단위
      if (c.measureText(line + w).width <= MAXW) { line += w; continue; }
      if (line) { rows.push({ t: line.trimEnd(), s }); line = ''; }
      for (const ch of w) { if (c.measureText(line + ch).width > MAXW) { rows.push({ t: line, s }); line = ''; } line += ch; }
    }
    if (line) rows.push({ t: line.trimEnd(), s });
  });
  cv2.width = W; cv2.height = P * 2 + rows.reduce((h, r) => h + r.s.lh, 0);
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, cv2.height); c.textBaseline = 'top';
  let y = P;
  for (const r of rows) { c.font = `${r.s.bold ? 700 : 400} ${r.s.size}px ${FONT}`; c.fillStyle = r.s.color; c.fillText(r.t, P, y + (r.s.lh - r.s.size) / 2); y += r.s.lh; }
  return cv2.toDataURL('image/png');
}
function openSummaryImage() {
  const url = summaryImage();
  $('img-out').src = url; $('img-dl').href = url; $('img-dl').hidden = IN_APP;
  $('img-ov').hidden = false; $('b-img-close').focus();
}
$('b-img-close').addEventListener('click', () => { $('img-ov').hidden = true; $('b-print-result').focus(); });
$('b-print-result').addEventListener('click', () => {
  $('copy-status').textContent = '';
  if (IN_APP) return openSummaryImage();
  let opened = false; const on = () => { opened = true; };
  window.addEventListener('beforeprint', on, { once: true });
  window.print();
  setTimeout(() => { // 인쇄 창이 안 열린 브라우저(앱 안 브라우저를 못 알아본 경우 등): 이미지로 대신
    window.removeEventListener('beforeprint', on);
    if (!opened) { $('copy-status').textContent = "이 브라우저에서는 PDF 저장(인쇄) 창이 열리지 않아 이미지로 보여 드려요. '결과 요약 복사'도 쓸 수 있어요."; openSummaryImage(); }
  }, 1500);
});
$('b-first-detail').addEventListener('click', () => openDetail(0));
// 판정 상세·도움받을 곳의 뒤로 버튼: 직전 화면으로(보던 위치 복원, 2026-11-21 UI 개선 ③ 문제 5)
$('d-back').addEventListener('click', () => history.back());
$('h-back').addEventListener('click', () => history.back());

// 판정 근거 문구(legal.js의 law) → 등록 조문(laws.json)
function lawToArticles(law, title) {
  if (/고용보험법|산업재해/.test(law)) return ['iaci-6', 'eid-3', 'npd-2', 'nhid-9'].map(id => LAWS.articles.find(a => a.id === id));
  const out = []; let cur = null;
  for (const part of String(law).split(/[,·]/)) {
    const m = part.match(/(근로기준법|최저임금법)?\s*제(\d+)조/);
    if (!m) continue;
    if (part.includes('같은 법 시행령')) cur = `${cur} 시행령`; else if (m[1]) cur = m[1];
    const a = LAWS.articles.find(x => x.law === cur && x.no.split(' ')[0] === `제${m[2]}조`);
    if (a && !out.includes(a)) out.push(a);
  }
  const y = String(title).match(/(2026|2027)년 최저임금/); // 최저임금 판정이면 해당 연도 고시도 연결
  if (y) out.push(LAWS.articles.find(a => a.id === `mw-${y[1]}`));
  return out.filter(Boolean);
}
async function openDetail(i) {
  const f = lastFindings[i]; if (!f) return;
  try { await loadLaws(); } catch { return fail('법령 자료를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', undefined, { retry: () => openDetail(i), back: ['판정 결과로 돌아가기', () => show('s-result')] }); }
  $('d-title').textContent = f.title;
  $('d-level').textContent = f.level; $('d-level').className = `lv-chip lv-${f.level}`;
  $('d-law').textContent = f.law;
  $('d-detail').textContent = f.detail;
  $('d-values').innerHTML = (f.fields ?? []).map(n => `<div class="kv"><span>${LABEL[n] ?? n}</span><b>${esc(fmt(n, current?.result[n]?.value))}</b></div>`).join('');
  $('d-unsure').hidden = !f.unsure;
  const arts = lawToArticles(f.law, f.title);
  $('d-articles').innerHTML = arts.length ? arts.map(a => `<button class="item row-btn" data-article="${a.id}"><span><b>${escL(a.law)} ${escL(a.no)}</b><br><span class="muted">${escL(a.title)}</span></span><span class="go">원문 보기 ›</span></button>`).join('')
    : `<div class="item muted">${esc(f.law)}</div>`;
  $('d-checked').textContent = `내용 확인일 ${LAWS.checked}`;
  const topic = window.topicForLaw?.(f);
  $('d-topic-card').hidden = !topic;
  if (topic) $('d-topic').dataset.topic = topic;
  $('d-small').hidden = !/5명 미만/.test(f.detail);
  show('s-detail');
}

// 핵심 계약 조건 요약(결과 화면). '고치기'는 아래 33개 항목의 해당 칸 편집을 연다
function renderCore() {
  const r = current.result, v = n => r[n]?.value;
  // 결과 제목 아래 요약: 사업체명 · 고용형태, 분석일(한국 날짜)
  $('res-sub').textContent = [v('사업체명'), v('고용형태') ? `${v('고용형태')} 근로계약` : null].filter(Boolean).join(' · ') || '근로계약서';
  $('res-date').textContent = `분석 완료 · ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}`;
  const end = v('계약종료일') ?? (v('기간의정함') === false ? '기간 정함 없음' : '—');
  const rows = [
    ['계약기간', `${v('계약시작일') ?? '—'} ~ ${end}`, '계약시작일'],
    ['근무시간', `${v('시업시각') ?? '—'} ~ ${v('종업시각') ?? '—'}${v('주근무일수') ? `, 주 ${v('주근무일수')}일` : ''}`, '시업시각'],
    ['임금', `${v('임금형태') ?? ''} ${fmt('임금액', v('임금액'))}`.trim(), '임금액'],
    ['임금 지급', `${v('임금지급일') ?? '—'} · ${v('지급방법') ?? '—'}`, '임금지급일'],
    ['사회보험', INS.map(n => `${n} ${v(n) === true ? '✓' : v(n) === false ? '✗' : '?'}`).join(' · '), '고용보험'],
  ];
  $('core-list').innerHTML = rows.map(([k, val, n]) => `<div class="item core"><div><div class="k">${k}</div><div class="v">${esc(val)}</div></div><button class="mini" data-core="${n}">고치기</button></div>`).join('');
}
$('core-list').addEventListener('click', e => {
  const n = e.target.closest('[data-core]')?.dataset.core; if (!n) return;
  expandFields(true); // 접힌 목록을 펼친 뒤 그 항목 고치기
  const btn = document.querySelector(`#it-${n} [data-edit="${n}"]`);
  btn?.click();
  $('it-' + n)?.scrollIntoView({ block: 'center' });
});

const GROUPS = [
  ['계약 형태·기간', ['사업체명', '고용형태', '기간의정함', '계약시작일', '계약종료일', '수습여부', '수습기간', '수습임금비율']],
  ['일하는 곳·일', ['근무장소', '업무내용']],
  ['근로시간·휴일', ['시업시각', '종업시각', '휴게시간', '주근무일수', '근무요일', '주휴일']],
  ['임금', ['임금형태', '임금액', '상여금', '기타수당', '초과근로가산임금률', '임금지급일', '지급방법']],
  ['사회보험', ['고용보험', '산재보험', '국민연금', '건강보험']],
  ['기타 조항·서명', ['연차유급휴가문구', '계약서교부문구', '특약사항', '사업주서명', '근로자서명', '작성일']],
];
const LABEL = { 시업시각: '출근 시각', 종업시각: '퇴근 시각', 기간의정함: '계약 기간 정함', 수습임금비율: '수습 중 임금 비율', 초과근로가산임금률: '초과근로 가산임금률',
  연차유급휴가문구: '연차유급휴가 조항', 계약서교부문구: '계약서 교부 조항', 주근무일수: '주 근무일 수' };
const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
const BOOL_TEXT = { 고용보험: ['가입', '미체크'], 산재보험: ['가입', '미체크'], 국민연금: ['가입', '미체크'], 건강보험: ['가입', '미체크'],
  사업주서명: ['있음', '없음'], 근로자서명: ['있음', '없음'] };

function fmt(name, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return (BOOL_TEXT[name] ?? ['예', '아니오'])[v ? 0 : 1];
  if (name === '기타수당') return v.length ? v.map(a => `${a.name} ${won(a.amount)}`).join(', ') : '없음';
  if (['임금액', '상여금'].includes(name)) return v === 0 ? '없음' : won(v);
  if (['수습임금비율', '초과근로가산임금률'].includes(name)) return `${v}%`;
  if (name === '주근무일수') return `${v}일`;
  return String(v);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderResult(r) {
  $('rejudge-msg').hidden = true;
  let nCheck = 0;
  const html = GROUPS.map(([title, names]) => {
    const items = names.map(n => {
      const f = r[n] ?? {};
      const check = f.status === '확인필요' || f.confidence === 'low';
      if (check) nCheck++;
      const tag = f.edited ? '<span class="tag ok">직접 수정</span>' : f.confirmed ? '<span class="tag ok">확인함</span>'
        : check ? '<span class="tag check">확인 필요</span>' : f.status === '해당없음' ? '<span class="tag na">해당 없음</span>' : '';
      const raw = f.raw_text && f.raw_text !== String(f.value) ? `<div class="raw">원문: ${esc(f.raw_text)}</div>` : '';
      // 확인이 필요한 이유(두 번 읽기 불일치·규칙 검사)와 다르게 읽힌 값
      const why = (f.reasons ?? []).map(t => `<div class="why">${esc(t)}</div>`).join('');
      const alt = f.alt !== undefined ? `<div class="why">다르게 읽힌 값: ${esc(fmt(n, f.alt))}</div>` : '';
      // 2026-11-23 사용자 선택: '원본과 같아요' 뺌(값 확인 화면과 같게), 모든 줄 이름 옆 '고치기' — 평소엔 숨기고 핵심 계약 조건 [수정하기]를 누르면 보임
      const acts = '<div class="acts" hidden></div>';
      const link = `<button class="link" data-edit="${n}">고치기</button>`;
      return `<div class="item${check ? ' check' : ''}" id="it-${n}"><div class="k"><span>${LABEL[n] ?? n}</span><span class="kr">${tag}${link}</span></div><div class="v">${esc(fmt(n, f.value))}</div>${raw}${why}${alt}${acts}</div>`;
    }).join('');
    return `<div class="group"><h2>${title}</h2>${title === '사회보험' ? insuranceAsk(r) : ''}${items}</div>`;
  }).join('');
  $('summary').textContent = nCheck ? `확인이 필요한 항목이 ${nCheck}개 있어요. 주황색 항목을 계약서 원본과 비교해 주세요.` : '모든 항목을 읽었어요. 그래도 중요한 숫자는 원본과 한 번 비교해 주세요.';
  $('fields').innerHTML = html;
  $('fields-toggle-n').textContent = nCheck ? `확인 필요 ${nCheck}개` : ''; // 접어 둬도 확인할 항목이 있으면 보이게
}
// 33개 항목 목록 접기·펼치기(2026-11-21 UI 개선 ③ 문제 1)
function expandFields(open) {
  $('fields-wrap').hidden = !open;
  $('b-fields-toggle').setAttribute('aria-expanded', String(open));
  $('fields-toggle-t').textContent = open ? '33개 항목 접기' : '33개 항목 전체 보기';
}
$('b-fields-toggle').addEventListener('click', () => expandFields($('fields-wrap').hidden));

// ---------- 핵심 값 확인 화면 ----------
// 판정에 쓰이는 값만 모아 원본과 비교하게 함. 실제 손글씨 7장 시험에서 시급·상여금·체크 칸(양방향) 오독이
// 표시 없이 나와(위험 오답 6/98칸), 판정 전에 사람이 확인하는 단계를 둠
const KEY = ['계약시작일', '계약종료일', '시업시각', '종업시각', '휴게시간', '근무요일', '임금형태', '임금액', '상여금', '수습임금비율',
  '고용보험', '산재보험', '국민연금', '건강보험'];
function keyFields() {
  const r = current.result;
  return KEY.filter(n => r[n] && !(n === '수습임금비율' && r['수습여부']?.value !== true)
    && !(n === '계약종료일' && r['기간의정함']?.value === false && r[n].value === null));
}
const needsCheck = f => !f.edited && !f.confirmed && (f.status === '확인필요' || f.confidence === 'low');
// 항목마다 '원본과 같아요'·'고치기'(와이어프레임 '핵심 값 확인 화면'), 사회보험은 한 상자에 가입/미체크
function renderConfirm() {
  const r = current.result, names = keyFields();
  const isBool = n => current.types[n]?.type === 'bool';
  const cards = names.filter(n => !isBool(n)).map(n => {
    const f = r[n], check = needsCheck(f);
    const tag = f.edited ? '<span class="tag ok">고침</span>' : f.confirmed ? '<span class="tag ok">원본과 같음</span>' : check ? '<span class="tag check">확인 필요</span>' : '';
    const why = check ? `<div class="why-box">${f.alt !== undefined ? `<div>다르게 읽힌 값: ${esc(fmt(n, f.alt))}</div>` : ''}${(f.reasons ?? ['AI가 확실히 읽지 못했어요']).map(x => `<div>이유: ${esc(x)}</div>`).join('')}</div>` : '';
    // 2026-11-23 사용자 요청: 항목마다 카드 → 한 상자 안의 줄(이름·버튼 한 줄, 값은 아래). 읽는 순서는 이름→값→버튼 그대로
    return `<div class="item ckr${check ? ' check' : ''}" id="ck-${n}"><div class="k"><span>${LABEL[n] ?? n}</span>${tag}</div>
      <div class="v">${esc(fmt(n, f.value))}</div>${why}
      <div class="acts"><button class="mini" data-cedit="${n}">고치기</button></div></div>`;
  }).join('');
  const bools = names.filter(isBool);
  const ins = bools.length ? `<div class="card"><div class="k">사회보험 가입 여부</div>${bools.map(n => `<div class="ins-row"><span>${n}</span><div class="seg2">${[true, false].map(v =>
    `<button data-bool="${n}" data-v="${v}" class="${r[n].value === v ? 'on' : ''}">${fmt(n, v)}</button>`).join('')}</div></div>`).join('')}</div>` : '';
  $('confirm-list').innerHTML = (cards ? `<div class="group">${cards}</div>` : '') + ins;
  // 진행 상황(문제 12): 확인·고친 항목 수, 확인 필요 항목 수
  // 2026-11-23 사용자 요청: '원본과 같아요' 버튼 뺌(같으면 그대로 두면 됨) → 진행은 고친 개수만
  const done = names.filter(n => r[n].edited).length, need = names.filter(n => needsCheck(r[n])).length;
  $('ck-progress').textContent = `${names.length}개 중 ${done}개 고침`;
  $('ck-progress-sub').textContent = need ? `확인 필요 ${need}개 · 확인하지 않아도 결과를 볼 수 있어요` : '다 확인하지 않아도 결과를 볼 수 있어요';
  // 원본과 비교할 수 있게 보낸(가린) 사진을 보여 줌 — 휴대폰 화면에만 그림(2026-11-21 UI 개선 ③ 문제 2)
  const shots = [].concat(lastPayload ?? []).filter(Boolean);
  if (shots.length) {
    $('ck-photo').src = shots[0];
    $('ck-photo-t').textContent = shots.length > 1 ? `내 계약서 사진 (${shots.length}장)` : '내 계약서 사진';
    $('photo-scroll').innerHTML = shots.map((u, i) => `<img src="${u}" alt="가린 계약서 사진 ${i + 1}장">`).join('');
  }
  $('b-photo').hidden = !shots.length; $('b-photo2').hidden = !shots.length; // UI/UX 점검 9: 아래 고정 막대에도 '사진 보기'
}
// 2026-11-23 사용자 선택(대안 4): [수정하기]를 눌러야 줄마다 '고치기'가 보임, 누른 상태에선 '완료'
function ckMode(on) {
  $('s-confirm').classList.toggle('editing', on);
  $('b-ck-mode').setAttribute('aria-pressed', String(on)); $('b-ck-mode').textContent = on ? '완료' : '수정하기';
}
$('b-ck-mode').addEventListener('click', () => ckMode(!$('s-confirm').classList.contains('editing')));
// 2026-11-23 사용자 선택: 결과 화면도 같은 방식, [수정하기]는 '핵심 계약 조건' 제목 줄에 1개 — 핵심 조건·33개 항목의 '고치기'를 함께 보이게 함
function resMode(on) {
  $('s-result').classList.toggle('editing', on);
  $('b-res-mode').setAttribute('aria-pressed', String(on)); $('b-res-mode').textContent = on ? '완료' : '수정하기';
}
$('b-res-mode').addEventListener('click', () => resMode(!$('s-result').classList.contains('editing')));
const photoOpen = open => {
  $('photo-ov').hidden = !open; $('photo-ov').classList.remove('zoom'); $('b-photo-zoom').textContent = '크게';
  if (open) $('b-photo-close').focus(); else $('b-photo').focus();
};
$('b-photo').addEventListener('click', () => photoOpen(true));
$('b-photo2').addEventListener('click', () => photoOpen(true));
$('b-photo-close').addEventListener('click', () => photoOpen(false));
$('b-photo-zoom').addEventListener('click', () => { const z = $('photo-ov').classList.toggle('zoom'); $('b-photo-zoom').textContent = z ? '화면에 맞추기' : '크게'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('photo-ov').hidden) photoOpen(false); });
// 확인·고친 값은 '확인필요'를 풀고 확신도 높음으로
function settleKey(n, patch) {
  const f = current.result[n];
  Object.assign(f, patch, { confidence: 'high' });
  f.status = f.value === null ? '해당없음' : 'ok';
  delete f.reasons; delete f.alt;
}
let editing = null;
$('confirm-list').addEventListener('click', e => {
  const d = e.target.closest('button')?.dataset ?? {};
  const r = current.result;
  if (d.bool) { const v = d.v === 'true'; settleKey(d.bool, r[d.bool].value !== v ? { value: v, edited: true } : { confirmed: true }); renderConfirm(); }
  if (d.cedit) {
    editing = d.cedit;
    $('edit-name').textContent = LABEL[d.cedit] ?? d.cedit;
    $('edit-body').innerHTML = editorHtml(d.cedit, r[d.cedit], current.types[d.cedit]);
    $('edit-ov').hidden = false;
  }
});
$('b-edit-cancel').addEventListener('click', () => { $('edit-ov').hidden = true; editing = null; });
$('b-edit-save').addEventListener('click', () => {
  if (editing) { settleKey(editing, { value: readEditor($('edit-body'), current.types[editing]), edited: true }); renderConfirm(); }
  $('edit-ov').hidden = true; editing = null;
});
$('b-confirm-go').addEventListener('click', () => { renderResult(current.result); renderCore(); show('s-result'); rejudge(); });

// 사회보험 '미체크' 확인 질문: AI는 손글씨·인쇄 V 체크를 빈칸으로 읽는 실수를 한다(반대 방향 실수는 측정에서 0건).
// → 미체크로 읽힌 칸이 있으면, 원본에서 실제로 체크된 칸을 한 번 고르게 한다(2차 측정: 사회보험 오답 15칸 모두 이 경우)
const INS = ['고용보험', '산재보험', '국민연금', '건강보험'];
function insuranceAsk(r) {
  const off = INS.filter(n => r[n]?.value === false && !r[n].edited && !r[n].confirmed);
  if (!off.length) return '';
  return `<div class="ins-ask qwarn">
    <p><b>원본 확인이 필요해요.</b> AI가 체크(V) 표시를 놓치는 경우가 있어요. 아래 칸이 원본에서 실제로 체크되어 있다면 골라 주세요.</p>
    <div class="ins-list">${off.map(n => `<label><input type="checkbox" value="${n}"> ${n}</label>`).join('')}</div>
    <div class="acts"><button class="mini primary" data-ins-ok="1">확인했어요</button></div>
  </div>`;
}

// ---------- 5. 사용자가 확인·수정 → 판정 다시 계산 ----------
let current = null; // { result, types }
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
function editorHtml(n, f, t) {
  const v = f.value;
  const opt = (val, label, sel) => `<option value="${esc(val)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  switch (t?.type) {
    case 'bool': return `<select class="ed">${opt('', '모름/없음', v === null)}${opt('true', fmt(n, true), v === true)}${opt('false', fmt(n, false), v === false)}</select>`;
    case 'enum': return `<select class="ed">${opt('', '모름/없음', v === null)}${t.options.map(o => opt(o, o, v === o)).join('')}</select>`;
    case 'day': return `<select class="ed">${opt('', '모름/없음', !v)}${DAYS.map(d => opt(d, d + '요일', v === d)).join('')}</select>`;
    case 'days': return `<div class="ed days">${DAYS.map(d => `<label><input type="checkbox" value="${d}"${String(v ?? '').includes(d) ? ' checked' : ''}>${d}</label>`).join('')}</div>`;
    case 'date': return `<input class="ed" type="date" value="${esc(v ?? '')}">`;
    case 'time': return `<input class="ed" type="time" value="${esc(v ?? '')}">`;
    case 'range': { const [a, b] = String(v ?? '').split('-'); return `<div class="ed range"><input type="time" value="${esc(a ?? '')}"> ~ <input type="time" value="${esc(b ?? '')}"></div>`; }
    case 'int': return `<input class="ed" type="text" inputmode="numeric" value="${v ?? ''}" placeholder="숫자만">`;
    case 'allowances': return `<textarea class="ed" rows="3" placeholder="한 줄에 하나씩: 식대 200000">${esc((v ?? []).map(a => `${a.name} ${a.amount}`).join('\n'))}</textarea>`;
    default: return `<textarea class="ed" rows="${t?.type === 'text' ? 3 : 1}">${esc(v ?? '')}</textarea>`;
  }
}
function readEditor(box, t) {
  const el = box.querySelector('.ed');
  switch (t?.type) {
    case 'bool': return el.value === '' ? null : el.value === 'true';
    case 'enum': case 'day': return el.value || null;
    case 'days': { const d = [...el.querySelectorAll('input:checked')].map(x => x.value); return d.length ? d.join(',') : null; }
    case 'range': { const [a, b] = [...el.querySelectorAll('input')].map(x => x.value); return a && b ? `${a}-${b}` : null; }
    case 'int': { const x = el.value.replace(/[^\d]/g, ''); return x === '' ? null : Number(x); }
    case 'allowances': return el.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = l.match(/^(.*?)[\s:]*([\d,]+)\s*원?$/); return m ? { name: m[1].trim() || '수당', amount: Number(m[2].replace(/,/g, '')) } : null; }).filter(Boolean);
    default: return el.value.trim() || null;
  }
}
// 2026-11-23 UI/UX 점검 8: 다시 계산 중 표시, 실패하면 '고치기 전 판정'이라고 알리고 '다시 계산' 버튼
async function rejudge() {
  $('findings').classList.add('busy');
  $('rejudge-msg').hidden = false; $('rejudge-msg').classList.remove('fail'); $('b-rejudge').hidden = true;
  $('rejudge-t').textContent = '확인한 값으로 판정을 다시 계산하고 있어요…';
  let ok = false;
  try {
    const res = await fetch('/api/judge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ result: current.result }), signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    if (res.ok && Array.isArray(data.findings)) { renderFindings(data.findings); renderCore(); ok = true; }
  } catch { /* 아래에서 알림 */ } finally { $('findings').classList.remove('busy'); }
  if (ok) { $('rejudge-msg').hidden = true; return; }
  $('rejudge-msg').classList.add('fail'); $('b-rejudge').hidden = false;
  $('rejudge-t').textContent = '고친 값으로 판정을 다시 계산하지 못했어요. 아래 판정은 고치기 전 값 기준일 수 있어요.';
}
$('b-rejudge').addEventListener('click', () => rejudge());
// 확인·수정한 항목은 '확인필요'를 풀고 판정을 다시 계산
function settle(n, patch) {
  const f = current.result[n];
  Object.assign(f, patch, { confidence: 'high' });
  f.status = f.value === null ? '해당없음' : 'ok';
  delete f.reasons; delete f.alt;
  const y = window.scrollY; renderResult(current.result); window.scrollTo(0, y);
  rejudge();
}
$('fields').addEventListener('click', e => {
  const d = e.target.dataset ?? {};
  if (d.edit) {
    const box = $('it-' + d.edit), f = current.result[d.edit], t = current.types[d.edit];
    box.querySelector('.acts').outerHTML = `<div class="editor">${editorHtml(d.edit, f, t)}<div class="acts"><button class="mini primary" data-save="${d.edit}">저장</button><button class="mini" data-cancel="1">취소</button></div></div>`;
  }
  if (d.save) settle(d.save, { value: readEditor($('it-' + d.save), current.types[d.save]), edited: true });
  if (d.cancel) { const y = window.scrollY; renderResult(current.result); window.scrollTo(0, y); }
  if (d.insOk) {
    // 사용자가 고른 칸은 '가입'으로 고치고, 나머지 미체크 칸은 '확인함'
    const picked = new Set([...document.querySelectorAll('.ins-ask input:checked')].map(x => x.value));
    for (const n of INS) {
      const f = current.result[n];
      if (f?.value !== false || f.edited || f.confirmed) continue;
      if (picked.has(n)) Object.assign(f, { value: true, edited: true }); else f.confirmed = true;
      Object.assign(f, { status: 'ok', confidence: 'high' }); delete f.reasons; delete f.alt;
    }
    const y = window.scrollY; renderResult(current.result); window.scrollTo(0, y);
    rejudge();
  }
});


// ---------- 2026-11-23 UI/UX 점검 10·15·19·20 (공통) ----------
// 15: 촬영하기·사진·PDF 선택은 진짜 버튼 → 숨은 파일 입력을 누름(키보드·화면 읽기로도 누를 수 있게)
document.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => $(b.dataset.pick).click()));

// 19: 이모지 대신 같은 선 굵기(1.8)의 SVG 아이콘. <span class="ic" data-ic="이름">을 채움(나중에 그려지는 화면도)
const ICONS = {
  bot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 13v2M15 13v2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  scale: '<path d="M12 3v18M7 21h10M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  docscheck: '<path d="M8.5 8V4h8l3.5 3.5V16h-3M5 8h8l3 3v9H5z"/><path d="M8 15l2 2 3.5-4"/>', // 2026-11-23 21번: 외주·연재 비교(겹친 문서와 체크, 사용자 그림 icon_겹친문서_체크.svg)
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3v2a5 5 0 0 0 10 0V3M7 21v-2a5 5 0 0 1 10 0v2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  brush: '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 6 2 8 0 1.5-1.5 1.5-3.5 2-4"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
};
const fillIcons = root => root.querySelectorAll?.('.ic[data-ic]:empty').forEach(el => {
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[el.dataset.ic] ?? ''}</svg>`;
});
fillIcons(document);

// UI/UX 2차(2026-11-23) 1·2·5·11·18·19·20: 줄바꿈 지킴이 — 화면 글자에 보이지 않는 표시를 넣어
//  날짜·번호의 '-' 뒤, 괄호 뒤 조사 앞, '·' 앞에서 줄이 바뀌지 않게, 마지막 줄에 한두 글자만 남지 않게(마지막 띄어쓰기를 붙는 공백으로)
const WJ = '⁠', NBSP = ' ', GUARD_SKIP = 'script, style, textarea, option, select, #stage, .nw';
function guardOne(t) {
  const p = t.parentElement; if (!p || p.closest(GUARD_SKIP)) return;
  const o = t.data; let s = o;
  s = s.replace(/(\d)-(?=\d)/g, '$1-' + WJ).replace(/\)(?=[가-힣])/g, ')' + WJ).replace(/ · /g, NBSP + '· ').replace(/([^\s ⁠])·/g, '$1' + WJ + '·');
  const nx = t.nextSibling;
  if (!nx || nx.nodeName === 'BR' || (nx.nodeType === 1 && /^(block|flex|grid|list-item)$/.test(getComputedStyle(nx).display))) s = s.replace(/ ([^\s]{1,2})$/, NBSP + '$1');
  if (s !== o) t.data = s;
}
function guardText(root) {
  if (root.nodeType === 3) return guardOne(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; const list = [];
  while ((n = tw.nextNode())) if (n.data.trim()) list.push(n);
  list.forEach(guardOne);
}
guardText(document.body);

// 20: 고르는 버튼의 선택 상태를 색만이 아니라 aria-pressed로도 알림
const PRESS_SEL = '[data-tool], [data-fltype], [data-flcount], [data-bool], [data-fltab], .vtabs button, [data-btopic], [data-wtopic], #p-like';
const syncPressed = root => root.querySelectorAll?.(PRESS_SEL).forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('on'))));
syncPressed(document);

// 10: 창(.overlay) 공통 — 열면 첫 입력칸(없으면 첫 버튼)으로 초점, 닫으면 연 버튼으로 초점, Esc로 닫기
let lastPress = null;
document.addEventListener('click', e => { const b = e.target.closest('button, a, label'); if (b && !b.closest('.overlay')) lastPress = b; }, true);
const opener = new Map();
const OVS = [...document.querySelectorAll('.overlay')];
const isOpen = ov => !ov.hidden;
new MutationObserver(list => {
  for (const m of list) {
    if (m.type === 'childList') { m.addedNodes.forEach(n => { if (n.nodeType === 1) { fillIcons(n); syncPressed(n); guardText(n); if (n.matches?.(PRESS_SEL)) syncPressed(n.parentNode); } else if (n.nodeType === 3) guardText(n); }); continue; }
    const el = m.target;
    if (m.attributeName === 'class' && el.matches?.(PRESS_SEL)) { el.setAttribute('aria-pressed', String(el.classList.contains('on'))); continue; }
    if (m.attributeName !== 'hidden' || !el.classList?.contains('overlay')) continue;
    if (isOpen(el)) {
      opener.set(el, lastPress);
      el.querySelector('.overlay-box')?.scrollTo?.(0, 0);
      if (!el.contains(document.activeElement)) (el.querySelector('input:not([type=hidden]), select, textarea') ?? el.querySelector('button:not([hidden])'))?.focus({ preventScroll: true });
    } else {
      const o = opener.get(el); opener.delete(el);
      if (o && o.isConnected && o.offsetParent !== null) o.focus({ preventScroll: true });
    }
  }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const ov = OVS.filter(isOpen).pop();
  if (!ov || ov.id === 'photo-ov' || ov.id === 'pdf-ov') return; // 사진 창은 따로 처리, PDF 바꾸는 중 창은 '취소' 버튼으로만
  const close = [...ov.querySelectorAll('button')].find(b => !b.hidden && /^(취소|닫기)$/.test(b.textContent.trim()));
  if (close) close.click();
});
