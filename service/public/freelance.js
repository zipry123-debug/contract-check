// 프리랜서 계약서 비교 — 화면 (시안 ①~⑤, 기획서 6절, 2026-11-20)
// 흐름: 종류·개수 고르기 → 계약서마다 사진 1~3장 올리고 장마다 가리기('개인정보 없음' 체크한 장은 전송 안 함)
//      → /api/fl/extract(계약서마다 AI 두 번 읽기) → 값 확인(있음/없음·핵심 숫자만 고침) → /api/fl/compare(코드 비교)
// app.js의 show·fail·loadImage·setMaskMode·esc를 함께 씀
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const ABC = 'ABC';
  const TYPE_LABEL = { 납품형: '용역·납품 계약', 권리형: '저작물 이용 계약', 전속형: '한 곳에 묶여 활동하는 계약(전속)', 근로형: '사실상 근로계약', 기타: '기타 계약' };
  // 값 확인에서 고칠 수 있는 숫자 칸(사용자 결정 2026-11-20: 있음/없음 + 핵심 숫자)
  const EDIT = {
    납품형: { amount: [['amount', '계약 금액', '원']], pay: [['advance_pct', '먼저 받는 돈 비율', '%'], ['final_days', '나머지를 받기까지', '일']],
      revision: [['included', '포함된 수정 횟수', '회'], ['extra_fee', '추가 수정 1회 비용', '원']], inspect: [['deadline_days', '검수 결과 통보 기한', '일']],
      delay: [['rate_pct', '지체 1일당 비율', '%'], ['cap_pct', '지체상금 상한', '%']] },
    권리형: { fee: [['per_episode', '회당 연재료', '원']], share: [['pct', '작가 몫 비율', '%']], length: [['min_cuts', '최소 컷 수', '컷'], ['max_cuts', '최대 컷 수', '컷']],
      rest: [['per_50', '50회당 휴재 횟수', '회']], cancel: [['cure_days', '고칠 기회 기간', '일']], review: [['days', '검토 기간', '일']] },
  };
  const FLAG_TEXT = { '있음/없음': '조항이 있는지를 두 번 다르게 읽었어요', '표준과 다름': '두 번 읽은 내용이 서로 달라요', 'AI가 불확실하다고 표시': 'AI가 확실히 읽지 못했어요', '문장과 해석이 다름': '조항 문장과 AI가 정리한 내용이 서로 맞지 않아요' };

  const st = { type: '납품형', count: 2, contracts: [], fl: null, ctl: null, tab: 0, target: 0, timer: null };
  const newContract = () => ({ name: '', pages: [], res: null, rows: null, flags: {}, keep: false, exclude: false, edited: {}, confirmed: {} });
  const nameOf = (c, i) => c.name.trim() || c.res?.result?.company || `${ABC[i]} 계약서`;

  async function loadFL() {
    if (st.fl) return st.fl;
    const r = await fetch('freelance.json'); if (!r.ok) throw new Error('기준표');
    return (st.fl = await r.json());
  }

  // ---------- ② 비교 설정 ----------
  async function openSetup() {
    try { await loadFL(); } catch { return fail('비교 기준을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', undefined, { retry: openSetup, back: ['계약서 점검으로 돌아가기', () => show('s-check')] }); }
    renderSetup(); show('s-fl-setup');
  }
  function renderSetup() {
    document.querySelectorAll('[data-fltype]').forEach(b => b.classList.toggle('on', b.dataset.fltype === st.type));
    document.querySelectorAll('[data-flcount]').forEach(b => b.classList.toggle('on', +b.dataset.flcount === st.count));
    $('fl-count-note').hidden = st.count !== 1; // 2026-11-23 사용자 요청: '1개면 …' 안내는 1개를 골랐을 때만
    const items = st.fl.types[st.type].items;
    const law = items.filter(i => i.common).map(i => i.name), rest = items.filter(i => !i.common).map(i => i.name);
    $('fl-preview').innerHTML = `<b>공통 항목</b> <span class="muted">(예술인 복지법 제4조의4)</span><p class="muted">${esc(law.join(' · '))}</p>
      <b>${esc(TYPE_LABEL[st.type])}</b><p class="muted">${esc(rest.join(' · '))}</p>
      <p class="muted">기준: ${esc(st.fl.sources[st.fl.types[st.type].source].name)}</p>`;
  }
  $('b-fl-open').addEventListener('click', openSetup);
  $('b-home-fl')?.addEventListener('click', openSetup); // 홈에서 바로 비교 설정으로(2026-11-21)
  $('fl-type').addEventListener('click', e => { const b = e.target.closest('[data-fltype]'); if (b) { st.type = b.dataset.fltype; renderSetup(); } });
  $('fl-count').addEventListener('click', e => { const b = e.target.closest('[data-flcount]'); if (b) { st.count = +b.dataset.flcount; renderSetup(); } });
  $('b-fl-setup-next').addEventListener('click', () => {
    // 종류·개수가 바뀌면 새로 시작, 같으면 올린 사진 유지
    // 2026-11-23 UI/UX 점검 7: 개수만 바꾸면 이미 올린 계약서는 그대로 두고 늘리거나 줄임(예전엔 모두 지워짐).
    // 종류를 바꾸거나 사진이 있는 계약서가 빠지게 되면 먼저 묻기
    const has = c => c.pages.length > 0;
    if (st.contracts.type !== st.type) {
      if (st.contracts.some(has) && !confirm('계약 종류를 바꾸면 올린 사진이 모두 지워져요. 바꿀까요?')) return;
      st.contracts = Array.from({ length: st.count }, newContract); st.contracts.type = st.type;
    } else if (st.contracts.length !== st.count) {
      const drop = st.contracts.slice(st.count).filter(has);
      if (drop.length && !confirm(`개수를 줄이면 뒤쪽 계약서 ${drop.length}개에 올린 사진이 지워져요. 줄일까요?`)) return;
      const keep = st.contracts.slice(0, st.count);
      st.contracts = [...keep, ...Array.from({ length: st.count - keep.length }, newContract)]; st.contracts.type = st.type;
    }
    renderSlots(); show('s-fl-upload');
  });

  // ---------- ③ 계약서 올리기 ----------
  // '개인정보 없음' 체크한 장(p.skip): 2026-11-22 사용자 결정으로 가리지 않은 그대로 보내 분석함
  // (예전 11-20 결정은 '보내지 않음'이었으나, 그 장의 조항을 못 읽어 비교가 빠지는 문제로 바꿈).
  // 안전장치: 계약서마다 가린 장(또는 샘플)이 한 장 이상 있어야 함 — 이름·서명은 어딘가에 있으므로
  const ready = p => p.sample || p.masked || p.skip;
  const sendable = c => c.pages.some(p => p.masked || p.sample);
  // 사진을 앱과 같은 크기·화질의 JPEG로(가리기 화면을 거치지 않은 '개인정보 없음' 장용)
  const toJpegUrl = async blob => {
    const bmp = await decode(blob), s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    return c.toDataURL('image/jpeg', JPEG_QUALITY);
  };
  function renderSlots() {
    $('fl-up-title').textContent = st.contracts.length > 1 ? `계약서 ${st.contracts.length}개 올리기` : '계약서 올리기';
    document.querySelectorAll('.fl-sn').forEach(x => { x.textContent = st.contracts.length; });
    // UI/UX 2차 14: 1개면 '서로 다른 곳' 설명이 맞지 않음 → 표준과 비교 설명
    document.querySelectorAll('.fl-sd').forEach(x => { x.dataset.many ??= x.textContent; x.textContent = st.contracts.length === 1 ? x.dataset.one : x.dataset.many; });
    $('fl-slots').innerHTML = st.contracts.map((c, i) => {
      const pages = c.pages.map((p, j) => {
        const state = p.sample ? '<span class="done">✓ 가상 샘플</span>' : p.masked ? '<span class="done">✓ 가리기 완료</span>'
          : p.skip ? '<span class="done">✓ 개인정보 없음</span>' : '<span class="todo">가려야 해요</span>';
        const acts = p.sample ? '' : `<div class="pg-acts"><button class="mini" data-mask="${i}.${j}">${p.masked ? '다시 가리기' : '가리기'}</button>
          ${p.masked ? '' : `<label class="nopii"><input type="checkbox" data-nopii="${i}.${j}"${p.skip ? ' checked' : ''}> 이 장에는 개인정보가 없어요</label>`}</div>`;
        return `<div class="pg"><img class="thumb" src="${p.thumb}" alt="${ABC[i]} 계약서 ${j + 1}쪽"><div class="pg-info"><b>${j + 1}쪽</b> ${state}${acts}</div>
          <button class="link" data-del="${i}.${j}" aria-label="${j + 1}쪽 빼기">빼기</button></div>`;
      }).join('');
      const add = c.pages.length < 3 ? `<div class="row"><button class="btn small" data-add="${i}" data-src="camera">촬영하기</button><button class="btn small" data-add="${i}" data-src="file">사진·PDF 선택</button></div>` : '';
      const ok = c.pages.length && c.pages.every(ready) && sendable(c);
      const nopii = c.pages.filter(p => p.skip).length;
      const status = c.res ? '<span class="done">✓ 읽기 완료</span>' : ok ? `<span class="done">✓ 준비됨 · ${c.pages.length}장${nopii ? ` ('개인정보 없음' ${nopii}장은 가리지 않고 보내요)` : ''}</span>`
        : !c.pages.length ? '<span class="muted">아직 올리지 않았어요</span>' : !c.pages.every(ready) ? '<span class="todo">가리지 않은 장이 있어요</span>' : `<span class="todo">모든 장을 '개인정보 없음'으로 보낼 수는 없어요. 이름·서명이 있는 장을 한 곳 이상 가려 주세요</span>`;
      return `<div class="slot-c"><div class="slot"><div class="ab${ok ? '' : ' off'}">${ABC[i]}</div><div class="info">
        <label class="nm-label" for="fl-nm-${i}">계약서 이름</label><input class="f-input nm" id="fl-nm-${i}" data-name="${i}" maxlength="20" placeholder="${ABC[i]} 계약서 (이름 바꾸기)" value="${esc(c.name)}">${status}</div></div>
        ${pages}${add}</div>`;
    }).join('');
    const allReady = st.contracts.every(c => c.pages.length && c.pages.every(ready) && sendable(c));
    const b = $('b-fl-analyze');
    b.disabled = !allReady;
    const one = st.contracts.length === 1;
    b.textContent = allReady ? (one ? '점검 시작하기' : '비교 시작하기') : one ? '계약서를 올리고 가리면 점검할 수 있어요' : `${st.contracts.length}개 모두 올리고 가리면 비교할 수 있어요`;
  }
  const pageAt = s => { const [i, j] = s.split('.').map(Number); return [st.contracts[i], st.contracts[i]?.pages[j], i, j]; };
  $('fl-slots').addEventListener('click', e => {
    const d = e.target.closest('button')?.dataset ?? {};
    if (d.add !== undefined) { st.target = +d.add; $(d.src === 'camera' ? 'fl-in-camera' : 'fl-in-file').click(); }
    if (d.del) {
      const [c, p, , j] = pageAt(d.del);
      if ((p?.masked || p?.skip) && !confirm(`${j + 1}쪽을 빼면 가린 작업도 함께 지워져요. 뺄까요?`)) return; // 2026-11-23 UI/UX 점검 7
      c.pages.splice(j, 1); c.res = null; c.rows = null; renderSlots();
    }
    if (d.mask) {
      const [c, p] = pageAt(d.mask);
      setMaskMode({
        done: url => { p.data = url; p.thumb = url; p.masked = true; p.skip = false; c.res = null; setMaskMode(null); show('s-fl-upload'); renderSlots(); },
        back: () => { setMaskMode(null); show('s-fl-upload'); },
      });
      isSample = false; loadImage(p.blob);
    }
  });
  // '개인정보 없음' 체크: 바로 켜지 않고 확인 창을 거침(끌 때는 바로). 체크한 장은 가리지 않은 그대로 보냄(2026-11-22)
  let nopiiAt = null;
  $('fl-slots').addEventListener('change', e => {
    const t = e.target;
    if (!t.dataset.nopii) return;
    const [c, p] = pageAt(t.dataset.nopii);
    if (!t.checked) { p.skip = false; if (!p.masked) p.data = null; c.res = null; return renderSlots(); } // 체크를 풀면 보낼 사진도 지움
    t.checked = false; nopiiAt = t.dataset.nopii; $('fl-nopii-ov').hidden = false;
  });
  const closeNopii = () => { $('fl-nopii-ov').hidden = true; };
  $('b-fl-nopii-yes').addEventListener('click', async () => {
    const [c, p] = pageAt(nopiiAt); closeNopii();
    try { p.data = await toJpegUrl(p.blob); } catch { return fail('사진을 열지 못했어요. 다른 사진으로 다시 시도해 주세요.', undefined, { back: ['계약서 올리기로 돌아가기', () => show('s-fl-upload')] }); }
    p.skip = true; c.res = null; renderSlots();
  });
  $('b-fl-nopii-no').addEventListener('click', closeNopii);
  $('b-fl-nopii-mask').addEventListener('click', () => { closeNopii(); document.querySelector(`[data-mask="${nopiiAt}"]`)?.click(); });
  $('fl-slots').addEventListener('input', e => { const t = e.target; if (t.dataset.name !== undefined) st.contracts[+t.dataset.name].name = t.value; });
  for (const id of ['fl-in-camera', 'fl-in-file']) {
    $(id).addEventListener('change', e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      if (window.isPdf?.(f)) return addPdf(f); // 사이트 수정 7(2026-11-22)
      if (f.type && !f.type.startsWith('image/')) return fail('사진(JPG·PNG)이나 PDF 파일만 올릴 수 있어요.', undefined, { back: ['계약서 올리기로 돌아가기', () => show('s-fl-upload')] });
      const c = st.contracts[st.target];
      c.pages.push({ blob: f, thumb: URL.createObjectURL(f), masked: false, skip: false, sample: false, data: null });
      c.res = null; renderSlots();
    });
  }
  // 사이트 수정 7(2026-11-22): PDF → 휴대폰 안에서 쪽별 사진으로 바꿔 남은 칸(계약서마다 3장)만큼 넣음. 쪽마다 가리기는 사진과 같음
  async function addPdf(f) {
    const i = st.target, c = st.contracts[i], room = 3 - c.pages.length;
    if (room <= 0) return;
    if (f.size > 40 * 1024 * 1024) return fail('PDF 파일이 너무 커요(40MB 초과). 계약서 쪽만 캡처해 사진으로 올려 주세요.', undefined, { back: ['계약서 올리기로 돌아가기', () => show('s-fl-upload')] });
    const job = window.pdfBusy('PDF를 사진으로 바꾸고 있어요…');
    try {
      const { blobs, total } = await window.pdfToImages(f, room);
      if (window.pdfCancelled(job)) return; // 바꾸는 중 '취소'를 눌렀으면 결과를 버림(2026-11-22)
      window.pdfDone();
      blobs.forEach(b => c.pages.push({ blob: b, thumb: URL.createObjectURL(b), masked: false, skip: false, sample: false, data: null }));
      c.res = null; renderSlots();
      if (total > blobs.length) document.querySelectorAll('#fl-slots .slot-c')[i]?.insertAdjacentHTML('afterbegin',
        `<p class="qwarn" role="status">PDF ${total}쪽 중 앞 ${blobs.length}쪽만 넣었어요(계약서마다 3장까지). 계약 조항이 뒤쪽에 있다면 필요 없는 쪽을 빼고 그 쪽을 캡처해 사진으로 올려 주세요.</p>`);
    } catch (e) { window.pdfDone(); fail(window.PDF_ERR(e), undefined, { back: ['계약서 올리기로 돌아가기', () => show('s-fl-upload')] }); }
  }
  // 샘플: 같은 일에 조건이 다른 가상 계약서(개인정보 없음). 앞에서 고른 개수(2·3)만큼 넣음
  document.querySelectorAll('[data-flsample]').forEach(b => b.addEventListener('click', async () => {
    const type = b.dataset.flsample, ids = (type === '납품형' ? ['D1', 'D2', 'D3'] : ['W1', 'W2', 'W3']).slice(0, st.count);
    try {
      const pages = await Promise.all(ids.map(async id => { const url = `samples/fl/${id}.jpg`; return { thumb: url, data: await blobToUrl(await (await fetch(url)).blob()), sample: true }; }));
      st.type = type; st.contracts = pages.map(p => ({ ...newContract(), pages: [p] })); st.contracts.type = type;
      renderSlots(); window.scrollTo(0, 0);
    } catch { fail('샘플을 불러오지 못했어요.', undefined, { back: ['계약서 올리기로 돌아가기', () => show('s-fl-upload')] }); }
  }));
  const blobToUrl = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });

  // ---------- 분석 ----------
  window.flAbort = () => { st.ctl?.abort('cancel'); };
  $('b-fl-cancel').addEventListener('click', () => { st.ctl?.abort('cancel'); show('s-fl-upload'); });
  $('b-fl-analyze').addEventListener('click', analyze);
  async function analyze() {
    if (!navigator.onLine) return fail('인터넷에 연결되어 있지 않아요. 연결한 뒤 다시 시도해 주세요.', '비교 분석을 하지 못했어요', { retry: analyze, back: ['계약서 올리기로 돌아가기', () => show('s-fl-upload')] });
    const todo = st.contracts.map((c, i) => [c, i]).filter(([c]) => !c.res); // 이미 읽은 계약서는 다시 읽지 않음(비용)
    if (!todo.length) return openCheck(0);
    const ctl = new AbortController(); st.ctl = ctl;
    const to = setTimeout(() => ctl.abort('timeout'), 120000);
    const t0 = Date.now();
    const line = (i, s) => { const el = $('fl-w-' + i); if (el) el.innerHTML = s; };
    $('fl-wait-list').innerHTML = todo.map(([c, i]) => `<div class="item"><div class="k"><span>${esc(nameOf(c, i))}</span><span id="fl-w-${i}">읽는 중…</span></div></div>`).join('');
    st.timer = setInterval(() => { $('fl-wait-sec').textContent = `${Math.round((Date.now() - t0) / 1000)}초`; }, 500);
    show('s-fl-wait');
    try {
      await Promise.all(todo.map(async ([c, i]) => {
        // 가린 장·샘플·'개인정보 없음'으로 확인한 장을 쪽 순서대로 보냄. 가리지도 확인하지도 않은 사진(p.data 없음)은 보내지 않음
        if (!sendable(c)) throw new Error(`${nameOf(c, i)}: 모든 장을 '개인정보 없음'으로 보낼 수는 없어요. 이름·서명이 있는 장을 한 곳 이상 가려 주세요.`);
        const images = c.pages.filter(p => p.data && (p.masked || p.sample || p.skip)).map(p => p.data);
        if (!images.length) throw new Error(`${nameOf(c, i)}에 보낼 장이 없어요. 한 장 이상 가려 주세요.`);
        const res = await fetch('/api/fl/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: st.type, images }), signal: ctl.signal });
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) { const e = new Error(data.error); e.quota = true; throw e; }
        if (!res.ok || !data.result) throw new Error(data.error || (res.status >= 500 ? 'AI 응답이 지연되거나 서버에 잠깐 문제가 생겼어요.' : `요청을 처리하지 못했어요 (${res.status})`));
        // 읽은 조항이 거의 없으면 계약서가 아닌 사진으로 봄
        const n = Object.values(data.result.items ?? {}).filter(f => f?.present).length;
        if (n < 3) throw new Error(`${nameOf(c, i)}에서 계약 조항을 거의 찾지 못했어요. 계약서 사진이 맞는지, 글자가 잘 보이는지 확인해 주세요.`);
        c.res = data; c.flags = { ...(data.flags ?? {}) }; c.keep = false; c.exclude = false; c.edited = {}; c.confirmed = {};
        line(i, '<span class="done">✓ 읽기 완료</span>');
      }));
      await Promise.all(st.contracts.map(c => summarize(c)));
      openCheck(0);
    } catch (e) {
      if (ctl.signal.aborted && ctl.signal.reason === 'cancel') return;
      if (e.quota) return show('s-quota');
      fail(ctl.signal.reason === 'timeout' ? 'AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.'
        : e instanceof TypeError ? '인터넷 연결이 끊겼어요. 연결을 확인하고 다시 시도해 주세요.' : e.message,
      '비교 분석을 하지 못했어요', { retry: analyze, back: ['계약서 올리기로 돌아가기', () => { renderSlots(); show('s-fl-upload'); }] });
    } finally { clearInterval(st.timer); clearTimeout(to); st.ctl = null; }
  }
  // 계약서 하나의 항목별 요약(코드 계산, AI 호출 없음)
  async function summarize(c) {
    const res = await fetch('/api/fl/compare', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: st.type, contracts: [{ result: c.res.result }] }), signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '비교 계산 실패');
    c.rows = data.rows;
  }

  // ---------- ④ 값 확인 ----------
  function openCheck(i) { st.tab = i; st.editMode = false; renderCheck(); show('s-fl-check'); }
  function renderCheck() {
    const cs = st.contracts, c = cs[st.tab], i = st.tab;
    $('fl-tabs').innerHTML = cs.map((x, k) => `<button data-fltab="${k}" class="${k === i ? 'on' : ''}">${ABC[k]} ${esc(nmShort(nameOf(x, k)))}${x.exclude ? ' (뺌)' : ''}</button>`).join('');
    const r = c.res.result, guess = r.type_guess;
    let warn = '';
    if (c.res.typeMismatch && !c.keep && !c.exclude) {
      const others = cs.filter(x => x !== c && !x.exclude).length;
      const out = others >= 2 ? `<button class="btn small" data-flact="exclude">이 계약서 빼고 비교</button>` : `<button class="btn small" data-flact="replace">다른 계약서로 바꾸기</button>`;
      warn = guess === '근로형'
        ? `<div class="qwarn"><p><b>이 계약서는 사실상 근로계약에 가까워 보여요.</b></p><p class="muted">${esc(r.type_reason ?? '')}</p>
            <p class="muted">출퇴근 시간이 정해져 있거나 지시를 받아 일한다면 근로자일 수 있어요.</p>
            <div class="row"><button class="btn small" data-go="s-start">근로계약서 점검하기</button><button class="btn small" data-flact="keep">그대로 비교</button>${out}</div></div>`
        : `<div class="qwarn"><p><b>이 계약서는 '${esc(TYPE_LABEL[guess] ?? guess)}'에 더 가까워 보여요.</b></p><p class="muted">${esc(r.type_reason ?? '')}</p>
            <p class="muted">그래도 '${esc(TYPE_LABEL[st.type])}' 기준으로 비교할까요?</p>
            <div class="row"><button class="btn small" data-flact="keep">그대로 비교</button>${out}</div></div>`;
    }
    if (c.exclude) warn = `<div class="qwarn"><p><b>이 계약서는 비교에서 뺐어요.</b></p><div class="row"><button class="btn small" data-flact="include">다시 넣기</button></div></div>`;
    const nameBox = `<div class="card"><div class="k">계약서 이름</div><input class="f-input" id="fl-nm" maxlength="20" value="${esc(nameOf(c, i))}">
      ${c.res.companyFlag ? '<p class="qwarn">회사 이름을 두 번 다르게 읽었어요. 원본과 같은지 확인해 주세요.</p>' : ''}</div>`;
    const items = (c.rows ?? []).map(row => {
      const cell = row.cells[0], fl = c.flags[row.id];
      const tag = c.edited[row.id] ? '<span class="tag ok">고침</span>' : fl ? '<span class="tag check">확인 필요</span>' : cell.status === 'missing' ? '<span class="tag na">계약서에 없음</span>' : cell.status === 'none' ? '<span class="tag na">적혀 있지 않음</span>' : cell.status === 'unknown' ? '<span class="tag na">확인 못 함</span>' : '';
      const why = fl ? `<div class="why">${[...new Set(fl.map(x => FLAG_TEXT[x] ?? '숫자를 두 번 다르게 읽었어요'))].map(esc).join(' · ')}</div>` : '';
      const v = cell.status === 'unknown' ? `<span class="muted">${esc(cell.notice)}</span>` : cell.status === 'missing' || cell.status === 'none' ? '—' : esc(cell.text || '—') + (cell.same_basis ? ` <span class="muted">(같은 기준 약 ${cell.same_basis.toLocaleString('ko-KR')}원)</span>` : '');
      return `<div class="item ckr${fl ? ' check' : ''}"><div class="k"><span>${esc(row.name)}</span>${tag}</div><div class="v sm">${v}</div>${why}
        <div class="acts"><button class="mini" data-fledit="${row.id}">고치기</button></div></div>`;
    }).join('');
    // 2026-11-23 사용자 선택(대안 4): [수정하기]를 눌러야 줄마다 '고치기'가 보임(근로 값 확인과 같은 방식)
    const on = !!st.editMode;
    $('s-fl-check').classList.toggle('editing', on);
    const head = `<div class="ed-head"><div class="k-label">항목 확인</div><button type="button" class="mini ed-toggle" data-flmode="1" aria-pressed="${on}">${on ? '완료' : '수정하기'}</button></div>`;
    $('fl-check-body').innerHTML = warn + nameBox + head + `<div class="group">${items}</div>`;
    // 진행 막대(UI 개선 ③ 3차 18): 비교에 넣은 계약서 전체에서 확인·고친 항목 수, 확인 필요 수
    const inc = cs.filter(x => !x.exclude), all = inc.flatMap(x => (x.rows ?? []).map(row => [x, row.id]));
    // 2026-11-23 사용자 요청: '원본과 같아요' 버튼 뺌 → 진행은 고친 개수만
    const done = all.filter(([x, id]) => x.edited[id]).length, need = all.filter(([x, id]) => x.flags[id]).length;
    $('fl-progress').textContent = `${all.length}개 중 ${done}개 고침`;
    $('fl-progress-sub').textContent = need ? `확인 필요 ${need}개 · 확인하지 않아도 결과를 볼 수 있어요` : '다 확인하지 않아도 결과를 볼 수 있어요';
  }
  $('fl-tabs').addEventListener('click', e => { const b = e.target.closest('[data-fltab]'); if (b) { st.tab = +b.dataset.fltab; renderCheck(); } });
  $('fl-check-body').addEventListener('input', e => { if (e.target.id === 'fl-nm') { st.contracts[st.tab].name = e.target.value; } });
  $('fl-check-body').addEventListener('change', e => { if (e.target.id === 'fl-nm') renderCheck(); });
  let editing = null;
  $('fl-check-body').addEventListener('click', e => {
    const d = e.target.closest('button')?.dataset ?? {}, c = st.contracts[st.tab];
    if (d.flmode) { st.editMode = !st.editMode; renderCheck(); $('fl-check-body').querySelector('[data-flmode]')?.focus(); return; }
    if (d.flact === 'keep') { c.keep = true; renderCheck(); }
    if (d.flact === 'exclude') { c.exclude = true; renderCheck(); }
    if (d.flact === 'include') { c.exclude = false; c.keep = true; renderCheck(); }
    if (d.flact === 'replace') { Object.assign(c, newContract(), { name: '' }); renderSlots(); show('s-fl-upload'); }
    if (d.fledit) {
      editing = d.fledit;
      const f = c.res.result.items[editing] ?? {}, row = c.rows.find(x => x.id === editing);
      const nums = EDIT[st.type][editing] ?? [];
      $('fl-edit-name').textContent = row?.name ?? '';
      $('fl-edit-body').innerHTML = `<label class="ed-l">계약서에 이 내용이
          <select class="ed" id="fl-ed-present"><option value="1"${f.present ? ' selected' : ''}>있어요</option><option value="0"${f.present ? '' : ' selected'}>없어요</option></select></label>`
        + nums.map(([k, label, unit]) => `<label class="ed-l">${esc(label)} (${unit})<input class="ed" data-k="${k}" type="text" inputmode="decimal" value="${f[k] ?? ''}" placeholder="모르면 비워 두기"></label>`).join('')
        + (nums.length ? '' : '<p class="muted">이 항목은 있음/없음만 고칠 수 있어요.</p>');
      $('fl-edit-ov').hidden = false;
    }
  });
  $('b-fl-edit-cancel').addEventListener('click', () => { $('fl-edit-ov').hidden = true; editing = null; });
  $('b-fl-edit-save').addEventListener('click', async () => {
    const c = st.contracts[st.tab];
    if (!editing) return;
    const f = (c.res.result.items[editing] ??= {});
    f.present = $('fl-ed-present').value === '1';
    $('fl-edit-body').querySelectorAll('[data-k]').forEach(el => { const x = el.value.replace(/[^\d.]/g, ''); f[el.dataset.k] = x === '' ? null : Number(x); });
    f.confidence = 'high';
    c.edited[editing] = true; delete c.flags[editing];
    $('fl-edit-ov').hidden = true; editing = null;
    try { await summarize(c); } catch { /* 계산 실패 시 이전 요약 유지 */ }
    renderCheck();
  });

  // ---------- ⑤ 비교 결과 ----------
  $('b-fl-result').addEventListener('click', openResult);
  async function openResult() {
    const inc = st.contracts.map((c, i) => [c, i]).filter(([c]) => !c.exclude);
    // 2026-11-23 UI/UX 점검 6: 1개만 골랐으면 그 계약서를 표준 기준과 비교(2개 이상 고르고 빼서 1개가 된 경우도 같음)
    if (inc.length < 1) { $('fl-check-body').insertAdjacentHTML('afterbegin', '<p class="qwarn">결과를 보려면 계약서가 1개 이상 있어야 해요.</p>'); window.scrollTo(0, 0); return; }
    try {
      const res = await fetch('/api/fl/compare', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: st.type, contracts: inc.map(([c, i]) => ({ name: nameOf(c, i), result: c.res.result })) }), signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      renderResult(data, inc.map(([, i]) => ABC[i]));
      show('s-fl-result');
    } catch { fail('비교 결과를 계산하지 못했어요. 잠시 후 다시 시도해 주세요.', undefined, { retry: openResult, back: ['값 확인으로 돌아가기', () => show('s-fl-check')] }); }
  }
  function renderResult(d, letters) {
    $('fl-res-title').textContent = d.names.length > 1 ? `계약서 ${d.names.length}개 비교` : '계약서 점검 결과(표준과 비교)';
    $('fl-res-sub').textContent = TYPE_LABEL[d.type];
    const sum = k => d.counts.reduce((a, x) => a + x[k], 0);
    $('fl-stats').innerHTML = `<div class="stat lv-위험"><span>계약서에 없음</span><b>${sum('missing')}개</b></div>
      <div class="stat lv-주의"><span>표준과 다름</span><b>${sum('diff')}개</b></div><div class="stat"><span>비교 항목</span><b>${d.rows.length}개</b></div>`;
    const n = d.names.length;
    // 계약서별 요약 카드(없음·다름 개수)
    $('fl-names').className = `ct-sum g${n}`;
    $('fl-names').innerHTML = d.names.map((nm, k) => `<div><b>${letters[k]} ${esc(nmShort(nm))}</b><span class="r">없음 ${d.counts[k].missing}</span> · <span class="w">다름 ${d.counts[k].diff}</span>${d.counts[k].unknown ? `<br><span class="muted">확인 못 함 ${d.counts[k].unknown}</span>` : ''}</div>`).join('');
    resView = { d, letters, mode: n === 3 ? 'all' : n === 1 ? 'single' : 'pair', pick: [0, 1], open: -1 };
    drawRows();
    const unk = d.counts.some(x => x.unknown) ? '<p class="muted">\'확인 못 함\'은 AI가 확인하지 못한 항목이에요. 계약서에 적혀 있는지 직접 확인해 주세요.</p>' : '';
    $('fl-notes').innerHTML = `<div class="card info-plain">${unk}${d.notes.map(x => `<p class="${x.kind === 'caution' ? 'disclaimer-b' : 'muted'}">${esc(x.text)}</p>`).join('')}
      <p class="muted">기준: ${esc(d.source)} · 예술인 복지법 제4조의4 · 확인일 ${esc(d.checked)}. 어느 계약이 나은지는 직접 판단해 주세요.</p></div>`;
  }
  // 비교 표: 3개면 [한눈에 보기(3열 짧은 글)] / [자세히 비교(2개 골라 2열)], 2개면 바로 2열 자세히
  let resView = null;
  const nmShort = s => String(s).replace(/^\s*(주식회사|\(주\)|㈜)\s*/, '') || String(s); // 좁은 칸용: 앞의 '주식회사'·'(주)'만 뺌
  function cellFull(c) {
    const cls = c.status === 'missing' ? 'miss' : c.status === 'diff' ? 'diff' : c.status === 'none' || c.status === 'unknown' ? 'none' : '';
    const val = c.status === 'missing' ? '계약서에 없음' : c.status === 'none' ? '적혀 있지 않음' : c.status === 'unknown' ? '확인 못 함' : esc(c.text || '—');
    const extra = c.same_basis ? `<span class="sb">(같은 기준 약 ${c.same_basis.toLocaleString('ko-KR')}원)</span>` : '';
    const small = c.status === 'diff' ? `<small>표준과 다름${c.notice ? ` · ${esc(c.notice)}` : ''}</small>` : c.notice ? `<small>${esc(c.notice)}</small>` : '';
    return `<div class="${cls}">${val}${extra}${small}</div>`;
  }
  function cellShort(c) {
    if (c.status === 'missing') return '<div class="miss">없음</div>';
    if (c.status === 'none') return '<div class="none">—</div>';
    if (c.status === 'unknown') return '<div class="none">확인 못 함</div>';
    return `<div class="${c.status === 'diff' ? 'diff' : ''}">${esc(c.short || c.text || '—')}</div>`;
  }
  function drawRows() {
    const { d, letters, mode, pick, open } = resView, n = d.names.length;
    const tabs = n === 3 ? `<div class="vtabs"><button type="button" data-v="all" class="${mode === 'all' ? 'on' : ''}">한눈에 보기 (3개)</button><button type="button" data-v="pair" class="${mode === 'pair' ? 'on' : ''}">2개 자세히 비교</button></div>` : '';
    const law = r => r.law ? '<span class="law">법 필수</span>' : '';
    let body;
    if (mode === 'all') {
      body = `<p class="ct-hint">항목을 누르면 자세히 볼 수 있어요.</p><div class="ct short"><div class="names g3">${d.names.map((nm, k) => `<div><span class="ab">${letters[k]}</span>${esc(nmShort(nm))}</div>`).join('')}</div>` +
        d.rows.map((r, i) => `<button type="button" class="band tap" data-row="${i}" aria-expanded="${open === i}"><b>${esc(r.name)}</b>${law(r)}<span class="chev">${open === i ? '▴' : '▾'}</span></button>
        <div class="vals g3">${r.cells.map(cellShort).join('')}</div>` +
        (open === i ? `<div class="open"><p class="muted">표준: ${esc(r.standard)}${r.law ? ` (${esc(r.clause)})` : ''}</p>${r.cells.map((c, k) => `<p><b>${letters[k]}</b>${c.status === 'missing' ? `<span class="r">계약서에 없음</span>${c.notice ? ` · ${esc(c.notice)}` : ''}` : c.status === 'none' ? '적혀 있지 않음' : c.status === 'unknown' ? '확인 못 함' : esc(c.text || '—')}${c.same_basis ? ` (같은 기준 약 ${c.same_basis.toLocaleString('ko-KR')}원)` : ''}${c.status === 'diff' ? ' <span class="w">· 표준과 다름</span>' : ''}</p>`).join('')}</div>` : '')).join('') +
        '</div><button type="button" class="btn primary" id="b-fl-pair">2개 골라 자세히 비교하기</button>';
    } else if (mode === 'single') {
      // 계약서 1개: 항목마다 표준 기준과 이 계약서 내용을 한 열로
      body = `<div class="ct"><div class="names g1"><div><span class="ab">${letters[0]}</span>${esc(nmShort(d.names[0]))}</div></div>` + d.rows.map(r => `<div class="band"><b>${esc(r.name)}</b>${law(r)}<p>표준: ${esc(r.standard)}${r.law ? ` (${esc(r.clause)})` : ''}</p></div>
        <div class="vals g1">${cellFull(r.cells[0])}</div>`).join('') + '</div>';
    } else {
      const idx = n === 3 ? pick : [0, 1];
      const head = n === 3
        ? `<p class="ct-hint">비교할 계약서 2개를 골라 주세요.</p><div class="ct"><div class="pickrow">${[0, 1].map(s => `<div><select data-slot="${s}" aria-label="비교할 계약서 ${s + 1}">${d.names.map((nm, k) => `<option value="${k}"${k === idx[s] ? ' selected' : ''}${k === idx[1 - s] ? ' disabled' : ''}>${letters[k]} ${esc(nmShort(nm))}</option>`).join('')}</select></div>`).join('')}</div>`
        : `<div class="ct"><div class="names g2">${idx.map(k => `<div><span class="ab">${letters[k]}</span>${esc(nmShort(d.names[k]))}</div>`).join('')}</div>`;
      body = head + d.rows.map(r => `<div class="band"><b>${esc(r.name)}</b>${law(r)}<p>표준: ${esc(r.standard)}${r.law ? ` (${esc(r.clause)})` : ''}</p></div>
        <div class="vals g2">${idx.map(k => cellFull(r.cells[k])).join('')}</div>`).join('') + '</div>';
    }
    $('fl-rows').innerHTML = tabs + body;
  }
  $('fl-rows').addEventListener('click', e => {
    const t = e.target.closest('[data-v],[data-row],#b-fl-pair');
    if (!t || !resView) return;
    if (t.id === 'b-fl-pair') { resView.mode = 'pair'; drawRows(); $('fl-rows').scrollIntoView({ block: 'start' }); return; }
    if (t.dataset.v) { resView.mode = t.dataset.v; drawRows(); return; }
    const i = +t.dataset.row; resView.open = resView.open === i ? -1 : i; drawRows();
  });
  $('fl-rows').addEventListener('change', e => {
    const s = e.target.closest('select[data-slot]');
    if (!s || !resView) return;
    resView.pick[+s.dataset.slot] = +s.value; drawRows();
  });
  $('b-fl-recheck').addEventListener('click', () => openCheck(0));
  $('b-fl-restart').addEventListener('click', () => {
    if (!confirm('올린 계약서와 확인한 값이 모두 지워져요. 처음부터 다시 할까요?')) return; // 2026-11-23 UI/UX 점검 7
    st.contracts = []; openSetup();
  });
})();
