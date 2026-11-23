// AI 질문 화면: 질문 → 개인정보 형식 검사(보내기 전) → 서버 /api/ask → 답변·근거 조문, 또는 답하기 어려운 이유별 안내(2026-11-22, 예전 '확인 불가' 화면 대신 같은 자리)
// UI 개선 ⑤(2026-11-21, UI개선_05_AI질문_기획서.md): 예시 누르면 질문 칸으로 이동, 보내는 중 표시, 답이 나오면 답 제목으로 초점, 뒤로 버튼
'use strict';

const ASK_MAX = 500;
const qBox = $('ask-q');
const askWarn = msg => { $('ask-warn').textContent = msg || ''; $('ask-warn').hidden = !msg; };

qBox.addEventListener('input', () => { $('ask-count').textContent = `${[...qBox.value].length}/${ASK_MAX}`; askWarn(''); });
// 예시 질문: 칸에 채우고 칸이 보이게 이동(문제 1 — 예전에는 채워진 칸이 화면 밖이었음)
document.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => {
  qBox.value = b.textContent; qBox.dispatchEvent(new Event('input'));
  qBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}));

// 뒤로: 들어온 화면으로(문제 4). 처음 화면은 항상 기록에 있어서(app.js) 직전 화면으로 돌아감
$('ask-back').addEventListener('click', () => (history.length > 1 ? history.back() : show('s-home')));
// '상담 창구 안내' 화면(s-unknown) → 질문 화면으로 돌아감(쓰던 질문 그대로). 기록을 되돌려서 '뒤로'가 두 화면을 오가지 않게
const backToAsk = () => (history.state?.screen === 's-unknown' ? history.back() : show('s-ask'));
$('u-back').addEventListener('click', backToAsk);
$('u-again').addEventListener('click', backToAsk);

let asking = false;
$('b-ask').addEventListener('click', async () => {
  if (asking) return;
  const q = qBox.value.trim();
  if (!q) return askWarn('질문을 입력해 주세요.');
  if ([...q].length > ASK_MAX) return askWarn(`질문은 ${ASK_MAX}자까지 쓸 수 있어요.`);
  const pii = window.findPII ? window.findPII(q) : [];
  if (pii.length) return askWarn(`개인정보로 보이는 내용이 있어요: ${pii.map(p => `${p.kind}(${p.text})`).join(', ')}. 지운 뒤 보내 주세요.`);

  asking = true; askWarn('');
  const btn = $('b-ask'); btn.disabled = true; btn.textContent = '답을 찾는 중…';
  $('ask-answer').hidden = true; $('ask-nf').hidden = true;
  $('ask-loading').hidden = false; // 답이 나올 자리에 회색 막대(문제 8)
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q }), signal: AbortSignal.timeout(60000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return askWarn(data.error || '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
    if (data.status !== 'ok') return renderNotFound(q, data.reason);
    renderAnswer(q, data);
    qBox.value = ''; qBox.dispatchEvent(new Event('input')); // 답을 받으면 입력칸 비우기(질문은 답변 위에 그대로 보임, 2026-11-21)
  } catch {
    askWarn('인터넷 연결이 끊겼거나 응답이 늦어요. 잠시 후 [보내기]를 다시 눌러 주세요.');
  } finally {
    asking = false; btn.disabled = false; btn.textContent = '보내기';
    $('ask-loading').hidden = true;
  }
});

// 답하기 어려울 때: 서버가 검증한 이유(reason) 4가지에 맞춰 미리 정한 문구·버튼만 보여 줌(법 내용은 쓰지 않음)
const EXT = (href, label) => `<a class="ext" href="${href}" target="_blank" rel="noopener" aria-label="${label} (새 창)">${label} ↗</a>`;
const TEL = '<a class="btn primary" href="tel:1350" aria-label="1350 전화 걸기">1350 전화 상담 (평일 9~18시)</a>';
const ASK_WEB = '<a class="btn" href="https://www.moel.go.kr/minwon/fastcounsel/fastcounselList.do" target="_blank" rel="noopener" aria-label="글로 묻기: 빠른 인터넷 상담 (새 창)">글로 묻기: 빠른 인터넷 상담 ↗</a>';
const NF = {
  freelance: {
    why: '외주·연재 계약과 저작권은 근로기준법이 아니라 계약서와 다른 법으로 정해져요. 등록된 근로 법 조문으로는 답할 수 없어요.',
    acts: `<button type="button" class="btn primary" id="nf-fl">외주·연재 계약서 비교하기</button>
      <ul class="nf-links"><li>불공정한 계약이라면 · ${EXT('https://www.mcst.go.kr/site/s_minwon/eCulture/artSinmungo/artSinmungo.jsp', '예술인권리침해 신고 안내')}</li>
      <li>저작권 분쟁이라면 · ${EXT('https://www.copyright.or.kr/business/mediation/adjustment/index.do', '한국저작권위원회 조정 안내')}</li></ul>`,
    foot: '질문을 근로시간·임금·퇴직 같은 근로 문제로 바꾸면 답할 수 있어요.' },
  judgment: {
    why: '신고하면 이길지, 내 상황이 법 위반인지는 구체적인 사정을 들어 봐야 해서 AI가 판단하지 않아요. 상담 창구에서 내 상황을 말하고 물어보세요.',
    acts: `${TEL}${ASK_WEB}<a class="btn" href="https://labor.moel.go.kr/" target="_blank" rel="noopener" aria-label="노동포털에서 진정 신청하기 (새 창)">노동포털에서 진정 신청하기 ↗</a>`,
    foot: '1350은 국번 없이 걸고 통화료가 있어요. "직장 내 괴롭힘은 법에서 어떻게 정하나요?"처럼 법 내용을 물으면 근거 조문과 함께 답해요.' },
  unregistered: {
    why: '아직 근거 조문을 등록하지 않은 내용이에요. 틀린 답을 막으려고 확인한 조문으로만 답해요.',
    acts: `${TEL}${ASK_WEB}<button type="button" class="btn" data-go="s-learn">법 안내에서 주제 보기</button>`,
    foot: '1350은 국번 없이 걸고 통화료가 있어요. 근로시간·주휴수당·최저임금·퇴직금·실업급여 같은 주제는 바로 답할 수 있어요.' },
  offtopic: {
    why: '알바체커는 근로계약·임금·근로시간처럼 일하는 사람의 권리에 관한 질문에 답해요.',
    acts: '<button type="button" class="btn" data-go="s-learn">법 안내에서 주제 보기</button>',
    foot: '예: "주휴수당은 언제 받을 수 있나요?", "퇴직금은 언제까지 받아야 하나요?"' },
};
function renderNotFound(q, reason) {
  const c = NF[reason] || NF.unregistered;
  $('ask-nf').innerHTML = `<div class="q-bubble"></div><h3 id="nf-h" tabindex="-1">이 질문에는 바로 답하기 어려워요</h3>
    <p class="nf-why">${c.why}</p>${c.acts}<p class="nf-foot">${c.foot}</p>`;
  $('ask-nf').querySelector('.q-bubble').textContent = q; // 질문은 글자로만 넣음
  $('nf-fl')?.addEventListener('click', () => $('b-home-fl').click()); // 홈의 '외주·연재 계약서 비교하기'와 같은 동작
  $('ask-nf').hidden = false;
  $('nf-h').focus({ preventScroll: true });
  $('ask-nf').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAnswer(q, d) {
  $('ans-q').textContent = q;
  $('ans-text').textContent = d.answer;
  $('ans-articles').innerHTML = d.articles.map(a =>
    `<button class="btn" data-article="${escL(a.id)}">${escL(a.law)} ${escL(a.no)}</button>`).join('');
  $('ans-topics').innerHTML = d.topics.map(t => `<button class="btn" data-topic="${escL(t.id)}">관련 법 안내: ${escL(t.title)}</button>`).join('');
  $('ans-topics-wrap').hidden = !d.topics.length;
  $('ans-checked').textContent = `근거 자료 확인일 ${d.checked} · 등록된 조문 안에서 찾은 답이며, 실제 사정에 따라 달라질 수 있어요. 궁금하면 1350에 문의하세요.`;
  $('ask-answer').hidden = false; $('ask-nf').hidden = true;
  $('ans-h').focus({ preventScroll: true }); // 화면 읽기 프로그램이 답 제목부터 읽음(문제 7)
  $('ask-answer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
