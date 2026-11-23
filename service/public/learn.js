// 홈·법 안내(주제 카드·조문 원문) 화면. 데이터는 laws.json(서버의 AI 질문 근거와 같은 파일)
'use strict';

let LAWS = null;
const loadLaws = () => LAWS ? Promise.resolve(LAWS)
  : fetch('laws.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => (LAWS = d));
const art = id => LAWS.articles.find(a => a.id === id);
const lawUrl = a => a.url || `https://www.law.go.kr/${encodeURI(`법령/${a.law.replace(/\s/g, '')}/${a.no.split(' ')[0]}`)}`;
const escL = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 판정 결과 → 관련 주제 카드(결과 화면의 '쉬운 설명 보기')
window.topicForLaw = f => {
  const s = `${f.title} ${f.law}`;
  if (/수습/.test(s)) return 'probation';
  if (/최저임금/.test(s)) return 'minwage';
  if (/휴게|제54조/.test(s)) return 'rest';
  if (/주휴|제55조|제18조/.test(s)) return 'weekly';
  if (/사회보험|고용보험|산재/.test(s)) return 'insurance';
  if (/근로시간|연장|제50조|제53조|제56조/.test(s)) return 'hours';
  return null;
};

// UI 개선 ② 법 안내(2026-11-21): 카드 › 표시, 뒤로 버튼, 조문 날짜를 쉬운 말로
const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
let curTopic = null; // 지금 보고 있는 주제(조문 화면 '뒤로' 이름에 씀)
let topicFrom = null; // 주제 카드를 연 화면
const today = () => new Date().toLocaleDateString('sv-SE'); // 휴대폰 날짜 기준 YYYY-MM-DD

// 숫자+단위(원·일·시간·개월·%·배·세·명, 기간인 'N년')를 굵게. 연도(2026년)와 '3분의 1'은 그대로
// 앞이 숫자가 아닐 때만 시작(오래된 휴대폰 브라우저도 되게 lookbehind 대신 앞 글자를 함께 잡음)
const em = s => escL(s).replace(/(^|[^\d,.])(\d[\d,]*(?:\.\d+)?(?:만\s?\d{1,4}천?|만|천)?\s?(?:원|일|시간|분(?!의)|개월|%|배|세|명|년))/g,
  (all, pre, m) => pre + (/^\d{4}년$/.test(m) ? m : `<b>${m}</b>`));
const ART_SHOW = 3;
let secSeq = 0;
// 카드 본문: 글자(문단) → 글머리표, {h, items} → 제목을 눌러 펴는 묶음, {table} → 표
function bodyHtml(body) {
  const list = items => items.map(i => typeof i === 'string' ? `<li>${em(i)}</li>`
    : `</ul><div class="t-table-wrap"><table class="t-table"><thead><tr>${i.table.head.map(h => `<th scope="col">${escL(h)}</th>`).join('')}</tr></thead><tbody>${i.table.rows.map(r => `<tr>${r.map((c, k) => k ? `<td>${em(c)}</td>` : `<th scope="row">${escL(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div><ul class="t-points">`).join('');
  const out = []; let run = [];
  const flush = () => { if (run.length) out.push(`<ul class="t-points">${list(run)}</ul>`); run = []; };
  for (const b of body) {
    if (typeof b === 'string') { run.push(b); continue; }
    flush();
    const id = `tsec-${++secSeq}`;
    out.push(`<div class="t-sec"><button type="button" class="t-sec-h" aria-expanded="false" aria-controls="${id}"><span>${escL(b.h)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="${id}" class="t-sec-b" hidden><ul class="t-points">${list(b.items)}</ul></div></div>`);
  }
  flush();
  return out.join('').replace(/<ul class="t-points"><\/ul>/g, '');
}

function failLearn(retry) { fail('법 안내 자료를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', undefined, { retry, back: ['홈으로 돌아가기', () => show('s-home')], tab: 's-learn' }); }

// 2026-11-23 구성 변경: 법 안내 주제 아이콘(선 굵기는 CSS에서 1.75)
const TOPIC_IC = {
  hours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  rest: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2 2 0 0 1 0 4H16"/><path d="M8 3.5v2M12 3.5v2"/>',
  weekly: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  minwage: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5"/>',
  annual: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  probation: '<path d="M12 20v-8"/><path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 14c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"/>',
  insurance: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 0 4 0"/>',
  dismissal: '<path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8"/><path d="M10 12h10M17 9l3 3-3 3"/>',
  severance: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
  unemployment: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
};
async function openLearn() {
  try { await loadLaws(); } catch { return failLearn(openLearn); }
  // 2026-11-23 구성 변경: 2칸 격자 + 주제별 선 아이콘(데이터의 이모지 대신, 같은 굵기 SVG). 아이콘이 없는 주제는 빈 칸
  $('topic-list').innerHTML = LAWS.topics.map(t =>
    `<button class="rd-tt" data-topic="${t.id}"><span class="rd-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${TOPIC_IC[t.id] || ''}</svg></span><b>${escL(t.title)}</b><small>${escL(t.lead)}</small></button>`).join('');
  $('learn-sub').textContent = `${LAWS.topics.length}개 주제를 쉬운 말로 정리했어요`;
  $('learn-checked').textContent = `내용 확인일 ${LAWS.checked} · 국가법령정보센터 원문 기준`;
  show('s-learn');
}

async function openTopic(id) {
  try { await loadLaws(); } catch { return failLearn(() => openTopic(id)); }
  const t = LAWS.topics.find(x => x.id === id);
  if (!t) return openLearn();
  curTopic = t;
  topicFrom = document.body.dataset.screen; // 목록에서 왔으면 '‹ 법 안내'가 뒤로 가기(보던 위치 복원)
  $('t-title').textContent = t.title;
  $('t-checked').textContent = `내용 확인 ${t.checked || LAWS.checked}`; // 2026-11-22: 새 카드(퇴직금·실업급여)는 카드별 확인일
  const rel = (t.related || []).map(id => LAWS.topics.find(x => x.id === id)).filter(Boolean);
  $('t-related').innerHTML = rel.map(r => `<button class="chip" data-topic="${r.id}">${escL(r.title)}</button>`).join('');
  $('t-related-card').hidden = !rel.length;
  $('t-lead').textContent = t.lead;
  // 2026-11-22 읽기 쉽게: '한눈에'(있을 때), 설명은 글머리표, 긴 카드는 제목별로 접고 펴기, 표, 숫자 굵게
  $('t-keys').innerHTML = (t.keys || []).map(x => `<div><dt>${escL(x.k)}</dt><dd>${em(x.v)}</dd></div>`).join('');
  $('t-keys').hidden = !t.keys?.length;
  $('t-body').innerHTML = bodyHtml(t.body);
  $('t-ex-situation').textContent = t.example.situation;
  $('t-ex-calc').textContent = t.example.calc;
  $('t-ex-caution').textContent = t.example.caution;
  $('t-small').textContent = t.small ? `5명 미만 사업장: ${t.small}` : '';
  $('t-small').hidden = !t.small;
  // 근거 조문이 많으면 앞의 3개만 보이고 나머지는 '모두 보기'로
  $('t-articles').innerHTML = t.articles.map(art).map((a, i) =>
    `<button class="item row-btn" data-article="${a.id}"${i >= ART_SHOW && t.articles.length > ART_SHOW + 1 ? ' hidden' : ''}><span><b>${escL(a.law)} ${escL(a.no)}</b><br><span class="muted">${escL(a.title)}</span></span><span class="go">원문 보기 ›</span></button>`).join('');
  const more = t.articles.length > ART_SHOW + 1;
  $('t-art-more').hidden = !more;
  $('t-art-more').setAttribute('aria-expanded', 'false');
  $('t-art-more-t').textContent = `근거 조문 ${t.articles.length}개 모두 보기`;
  show('s-topic');
}

async function openArticle(id) {
  try { await loadLaws(); } catch { return failLearn(() => openArticle(id)); }
  const a = art(id);
  if (!a) return;
  // 뒤로: 주제 카드에서 왔으면 그 주제 이름, 아니면 '뒤로'(직전 화면)
  $('a-back-label').textContent = document.body.dataset.screen === 's-topic' && curTopic ? curTopic.title : '뒤로';
  $('a-title').textContent = `${a.law} ${a.no} (${a.title})`;
  // 날짜: 오늘 어느 조문이 적용되는지 쉬운 말로(문제 3)
  const now = today(), tag = s => `<span class="art-now">${s}</span>`;
  const verLine = (main, sub) => `<div class="ver-line">${escL(main)}</div>${sub ? `<div class="ver-sub">${escL(sub)}</div>` : ''}`;
  if (a.amended && a.amended.effective > now) {
    $('a-version').innerHTML = verLine(`이 조문은 ${a.amended.effective}에 바뀌어요`, "그 전까지는 아래 '지금 적용' 조문이 적용돼요.");
    $('a-now-k').innerHTML = `${tag('지금 적용')} ${escL(a.version)}부터 시행`;
    $('a-amended-k').textContent = `${a.amended.effective}부터 바뀌는 내용`;
  } else if (a.amended) {
    $('a-version').innerHTML = verLine(`이 조문은 ${a.amended.effective}에 바뀌었어요`, "지금은 아래 '바뀐 내용'이 적용돼요.");
    $('a-now-k').textContent = `바뀌기 전 내용 (${a.amended.effective} 전까지)`;
    $('a-amended-k').innerHTML = `${tag('지금 적용')} ${escL(a.amended.effective)}부터 바뀐 내용`;
  } else if (a.version > now) {
    $('a-version').innerHTML = verLine(`${a.version}부터 적용돼요`, '아직 적용 전이에요.');
    $('a-now-k').innerHTML = `${tag('적용 예정')} ${escL(a.version)}부터`;
  } else {
    $('a-version').innerHTML = verLine('지금 적용 중인 조문이에요', `${a.version}부터 ${a.law.startsWith('고용노동부고시') ? '적용' : '시행'}`);
    $('a-now-k').innerHTML = `${tag('지금 적용')} 조문`;
  }
  $('a-checked').textContent = `내용 확인일 ${a.checked || LAWS.checked}`; // 2026-11-22: 조문마다 확인일(근로기준법은 11-22에 원문과 다시 대조)
  $('a-text').textContent = a.text;
  $('a-amended').hidden = !a.amended;
  if (a.amended) $('a-amended-text').textContent = a.amended.text;
  $('a-note').hidden = !a.note; $('a-note').textContent = a.note || '';
  $('a-small').hidden = !a.small; $('a-small').textContent = a.small || '';
  $('a-link').href = lawUrl(a);
  show('s-article');
}

// 화면 이동 버튼: data-go(화면), data-topic(주제 카드), data-article(조문)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go],[data-topic],[data-article],[data-tab]');
  if (!b || b.disabled) return;
  if (b.dataset.tab === 's-comm' || b.dataset.go === 's-comm') return window.openComm(); // 커뮤니티(comm.js)
  if (b.dataset.tab) return b.dataset.tab === 's-learn' ? openLearn() : show(b.dataset.tab); // 하단 탭
  if (b.dataset.topic) return openTopic(b.dataset.topic);
  if (b.dataset.article) return openArticle(b.dataset.article);
  if (b.dataset.go === 's-learn') return openLearn();
  show(b.dataset.go);
});
$('b-top').addEventListener('click', () => show('s-home'));
// 카드 묶음 제목 누르면 펴고 접기, 근거 조문 모두 보기
$('t-body').addEventListener('click', e => {
  const h = e.target.closest('.t-sec-h'); if (!h) return;
  const open = h.getAttribute('aria-expanded') !== 'true';
  h.setAttribute('aria-expanded', String(open)); $(h.getAttribute('aria-controls')).hidden = !open;
});
$('t-art-more').addEventListener('click', () => {
  const open = $('t-art-more').getAttribute('aria-expanded') !== 'true';
  $('t-art-more').setAttribute('aria-expanded', String(open));
  [...$('t-articles').children].forEach((b, i) => { if (i >= ART_SHOW) b.hidden = !open; });
  $('t-art-more-t').textContent = open ? '근거 조문 접기' : `근거 조문 ${curTopic.articles.length}개 모두 보기`;
});
// 주제 카드 → 주제 목록: 목록에서 왔으면 뒤로 가기(보던 위치 복원), 다른 곳에서 왔으면 목록을 새로 엶
$('t-back').addEventListener('click', () => (topicFrom === 's-learn' && history.state?.screen === 's-topic' ? history.back() : openLearn()));
$('a-back').addEventListener('click', () => history.back()); // 조문 → 직전 화면(주제 카드·AI 답 등)
