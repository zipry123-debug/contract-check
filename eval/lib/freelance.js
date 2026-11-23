// 프리랜서 계약서 읽기: 유형별 항목 스키마(AI가 읽을 '사실'), 표준과 다름 판정(코드), 두 번 읽기 비교.
// 원칙: AI는 계약서에 적힌 사실만 읽는다. '표준과 다름'은 아래 DIFF 규칙(코드)이 정한다.
// 기준 문구: service/public/freelance.json 의 diff_when 과 짝을 맞출 것.

const S = (description, extra = {}) => ({ type: 'STRING', nullable: true, description, ...extra });
const E = (description, e) => ({ type: 'STRING', nullable: true, enum: e, description });
const I = description => ({ type: 'INTEGER', nullable: true, description });
const B = description => ({ type: 'BOOLEAN', nullable: true, description });
const N = description => ({ type: 'NUMBER', nullable: true, description });
const L = description => ({ type: 'ARRAY', nullable: true, items: { type: 'STRING' }, description });

const DISPUTE = {
  order: S('해결 순서를 짧게(예: "협의 → 조정 → ○○ 관할 법원")'),
  talk: B('먼저 서로 협의한다고 적혀 있으면 true'), mediation: B('조정 기관(위원회·진흥원 등)의 조정을 거친다고 적혀 있으면 true'),
  court: E('법원을 정한 방법: "의뢰인·회사·갑 소재지(주소지) 관할 법원"이면 돈주는쪽주소지, "디자이너·작가·을 주소지"면 작업자쪽주소지, 어느 쪽인지 없이 "관할 법원"이면 관할법원', ['돈주는쪽주소지', '작업자쪽주소지', '관할법원', '언급없음']),
};

// 유형별 항목: [id, 읽는 법(프롬프트에 들어감), 사실 칸]
export const ITEMS = {
  납품형: [
    ['amount', '계약 금액(용역 대금 총액)', {
      amount: I('계약 금액 숫자(쉼표·원 빼고)'), vat: E('부가가치세', ['포함', '별도', '언급없음']) }],
    ['pay', '대금을 언제 어떻게 나눠 주는지(계약금·착수금·선급금·중도금·잔금)', {
      advance_pct: I('일을 끝내기 전에(계약 때·착수 때) 먼저 주는 돈의 비율(%). 먼저 주는 돈이 없으면 0. 금액만 있으면 계약 금액 대비 %로 계산'),
      advance_when: S('먼저 주는 돈을 주는 때(원문)'), final_when: S('마지막 돈(잔금·전액)을 주는 때(원문)'),
      advance_days: I('먼저 주는 돈을 계약일부터 며칠 안에 주는지. 계약일 당일이면 0, 먼저 주는 돈이 없거나 기한이 없으면 null'),
      final_after: E('마지막 돈을 주는 기준 시점', ['검수', '납품', '계약', '기타']),
      final_days: I('그 기준 시점부터 며칠 안에 주는지. 기한이 없으면 null') }],
    ['period', '계약 기간, 납품일', {
      start: S('시작. 날짜가 적혀 있으면 YYYY-MM-DD, 날짜 없이 "계약일로부터" 등이면 그 말 그대로 짧게(다른 곳의 날짜로 바꾸지 않음)'),
      end: S('끝. 적는 방법은 start와 같음'), delivery: S('납품일. 적는 방법은 start와 같음') }],
    ['deliverable', '맡은 일의 내용·결과물 목록', { list: L('결과물을 하나씩(예: "로고 1종")') }],
    ['revision', '수정 횟수와 추가 수정·추가 작업 비용', {
      included: I('계약 금액에 포함된 수정 횟수. 정하지 않았으면 null'), unlimited: B('수정 횟수에 제한이 없으면(만족할 때까지 등) true'),
      extra_fee: I('추가 수정 1회당 비용. 금액 없이 "별도 청구"만 있으면 0, 추가 비용 언급이 없으면 null') }],
    ['extra_cost', '계약 금액 밖의 비용(인쇄비·목업 제작비·출장비·유료 서체·이미지 사용료 등)을 누가 내는지. 수정 횟수에 따른 추가 수정비는 여기가 아니라 revision', {
      rule: E('계약 금액 밖 비용을 어떻게 정했는지', ['따로청구', '계약금액에포함', '작업자부담', '기타']) }],
    ['inspect', '검수 절차: 결과물을 받은 쪽이 언제까지·어떻게 확인하고 결과를 알리는지 정한 문장. 대금·지급 조항 안의 "검수 완료일로부터 ○일 이내 지급" 같은 말은 지급 시기를 정한 것이지 검수 절차가 아니므로, 그런 말만 있으면 present=false', {
      deadline_days: I('결과물을 받은 날부터 검수 결과를 알려야 하는 기한(일)'), until_satisfied: B('의뢰인이 만족할 때까지로 정했으면 true') }],
    ['ip', '결과물 저작권·지식재산권이 누구에게 언제 가는지', {
      owner: E('최종 결과물 저작권을 결국 갖는 쪽(이용 허락만 받는 쪽은 갖는 것이 아님)', ['의뢰인', '작업자', '언급없음']),
      transfer: E('최종 결과물 저작권(소유)이 의뢰인에게 넘어가는 때. 저작권은 작업자에게 남고 의뢰인은 쓰기만(이용 허락) 하면 이전안함', ['대금완납후', '계약즉시', '납품시', '이전안함', '기타']),
      unchosen_to: E('채택되지 않은 시안의 권리', ['작업자', '의뢰인', '언급없음']) }],
    ['portfolio', '작업자가 결과물을 포트폴리오·실적증명으로 공개할 수 있는지', {
      rule: E('포트폴리오 사용을 어떻게 정했는지: 조건 없이 쓸 수 있으면 조건없이가능, 의뢰인 공표 뒤 또는 의뢰인 동의를 받아 쓸 수 있으면 공표후또는동의, 쓸 수 없으면 금지', ['조건없이가능', '공표후또는동의', '금지', '기타']) }],
    ['cancel', '계약 해지·해제(중간에 그만두는 경우)', {
      client_cancel_pay: E('의뢰인 쪽 사정으로 해지할 때 작업자가 받는 돈', ['전액', '수행한만큼', '없음', '언급없음']),
      interim_rights: E('해지 때 중간 결과물 권리', ['작업자', '의뢰인', '언급없음']) }],
    ['damages', '손해배상·위약금(잘못으로 생긴 손해를 배상하는 일반 조항). 납품이 늦을 때 날짜당 물어내는 지체상금·지체 배상은 여기가 아니라 delay에만 적음. 조항 제목이 "손해배상"이어도 내용이 납품 지연 배상뿐이면 present=false', {
      who: E('배상할 의무가 있는 쪽', ['양쪽', '작업자만', '의뢰인만']),
      cap: B('배상 금액·비율을 정해 둔 경우 상한이 있으면 true, 없으면 false. 금액·비율을 정하지 않았으면 null') }],
    ['delay', '지체상금: 작업자가 납품을 늦게 할 때 날짜당 물어내는 돈(조항 제목이 손해배상이어도 내용이 납품 지연이면 여기)', {
      rate_pct: N('지체 1일당 계약 금액 대비 비율(%). "0.1%"면 0.1, "1.25/1000"이면 0.125, "1%"면 1'),
      cap_pct: N('총액 상한(계약 금액 대비 %). 상한이 없으면 null') }],
    ['dispute', '분쟁이 생겼을 때 해결 방법(협의·조정·법원)', DISPUTE],
  ],
  권리형: [
    ['fee', '회당 연재료(원고료)', {
      per_episode: I('1회당 금액 숫자'), deducted: B('연재료를 수익 배분액에서 빼면 true, 빼지 않는다고 적혀 있으면 false, 언급 없으면 null') }],
    ['share', '수익 배분(매출을 나누는 비율과 기준 금액)', {
      pct: I('작가 몫 비율(%)'), base: S('배분 기준 금액(원문, 예: "순매출액")'),
      base_defined: B('기준 금액에서 무엇을 빼는지 계약서에 적혀 있으면 true, 이름만 있고 무엇을 빼는지 없으면 false'),
      deduct_costs: L('기준 금액을 계산할 때 빼는 비용을 하나씩(원문 낱말)') }],
    ['settle', '정산 주기와 지급 기한', {
      cycle: E('정산 주기', ['매월', '분기', '반기', '매년', '기타']), pay_by: S('지급 기한(원문, 예: "다음 달 말일까지", "분기 종료 후 90일 이내")') }],
    ['statement', '정산서(정산 내역서)를 주는지', {
      zero_month: B('지급할 돈이 없는 달에도 정산서를 준다고 적혀 있으면 true, 그런 말이 없으면 null'),
      contents: L('정산서 문장에서 정산서에 적는다고 한 내용만 하나씩, 적힌 낱말 그대로(예: "총매출액", "판매 수량", "코인당 단가"). 다른 조항의 낱말은 넣지 않음. 없으면 빈 목록') }],
    ['period', '계약 기간과 연장', {
      length: S('계약 기간(원문 요약)'), years: I('계약 기간(년). 개월이면 null'),
      from: E('years를 어디서부터 세는지: "계약일로부터 3년"이면 계약일, "최종화 연재일 후 2년까지"처럼 연재가 끝난 뒤부터 세면 연재종료', ['계약일', '연재종료', '기타']), auto_renew: B('따로 말하지 않으면 자동으로 연장되면 true, 서면 합의로만 연장하거나 연장 언급이 없으면 false') }],
    ['scope', '작가가 상대에게 주는 이용 권리의 범위', {
      range: S('권리 범위(원문 요약)'), publish: B('출판(종이책 등) 권리 포함이면 true'), offline: B('오프라인 이용 포함이면 true'), overseas: B('해외·외국어 이용 포함이면 true') }],
    ['derivative', '2차적저작물(드라마·영화·게임·굿즈 등) 권리', {
      rule: E('2차적저작물 권리를 어떻게 정했는지', ['포함안함_별도계약', '우선협상권', '양도또는허락', '기타']) }],
    ['moral', '저작인격권: 작가 이름(실명·필명) 표시와, 회사가 작품 제목·내용·형식을 바꿀 때 작가 동의를 받는지', {
      name_display: B('작가 이름(필명)을 표시한다고 적혀 있으면 true'),
      change_consent: B('제목·내용·형식을 바꿀 때 작가 동의를 받는다고 적혀 있으면 true, 동의 없이 바꿀 수 있다고 적혀 있으면 false') }],
    ['length', '1회 분량(컷 수)과 초과 분량 추가금', {
      cuts: S('1회 분량(원문 요약)'), min_cuts: I('최소 컷 수("60컷 내외"면 60)'), max_cuts: I('최대 컷 수("60컷 내외"면 null)'), set_by: E('분량을 정하는 쪽', ['계약서에정함', '회사', '작가', '언급없음']),
      extra_pay: B('정한 분량을 넘으면 추가금을 준다고 적혀 있으면 true, 없으면 false') }],
    ['cost', '비용 부담: 작품 제작·판매·홍보 비용을 누가 내는지, 회사 요청으로 예고편·후기·일러스트 등을 따로 만들면 대가를 주는지', {
      company_pays: B('제작·판매·홍보 비용을 회사가 낸다고 적혀 있으면 true, 작가가 낸다고 적혀 있으면 false'),
      extra_work_paid: B('회사 요청 추가 작업(예고편·후기·일러스트 등)에 대가를 준다고 적혀 있으면 true, 대가 없이 해야 한다고 적혀 있으면 false') }],
    ['rest', '휴재(연재를 쉬는 것)', { per_50: I('연재 50회당 쉴 수 있는 횟수(다른 단위면 50회 기준으로 환산)') }],
    ['cancel', '계약 해지', {
      who: E('해지할 수 있는 쪽', ['양쪽', '회사만', '작가만']), cure_days: I('위반 뒤 고칠 기회를 주는 기간(일). 없으면 null'),
      immediate: B('기회를 주지 않고 즉시 해지할 수 있으면 true'), refund: B('작가가 이미 받은 연재료를 돌려줘야 하면 true') }],
    ['damages', '손해배상·위약벌', {
      who: E('배상할 의무가 있는 쪽', ['양쪽', '작가만', '회사만']), penalty: B('위약벌이나 정해 둔 배상액(몇 배, 얼마)이 있으면 true') }],
    ['secret', '비밀 유지', { exceptions: B('변호사 자문·수사·소송·법령상 신고 같은 예외가 적혀 있으면 true, 없으면 false') }],
    ['review', '계약 전 검토 기간·설명(계약서를 미리 받아 검토할 시간)', { days: I('검토 기간(일)') }],
    ['dispute', '분쟁이 생겼을 때 해결 방법(협의·조정·법원)', DISPUTE],
  ],
};

export function schemaFor(type) {
  const items = {};
  for (const [id, , facts] of ITEMS[type]) {
    items[id] = {
      type: 'OBJECT',
      properties: {
        present: { type: 'BOOLEAN', description: '이 내용을 다룬 조항(문장)이 계약서에 있으면 true' },
        raw_text: S('해당 조항 원문 그대로(여러 문장이면 모두). 없으면 null'),
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        ...facts,
      },
      required: ['present', 'confidence', ...Object.keys(facts)], // 사실 칸을 빠뜨리지 않게(없으면 null로 채움)
    };
  }
  return {
    type: 'OBJECT',
    properties: {
      company: S('계약 상대 회사·가게 이름(계약서에 적힌 그대로). 가려져 있거나 없으면 null'),
      type_guess: E('이 계약서의 성격', ['납품형', '권리형', '전속형', '근로형', '기타']),
      type_reason: S('그렇게 본 이유 한 문장'),
      items: { type: 'OBJECT', properties: items, required: Object.keys(items) },
    },
    required: ['company', 'type_guess', 'items'],
  };
}

/** 프롬프트에 넣을 항목 안내 */
export function itemGuide(type) {
  return ITEMS[type].map(([id, how, facts]) =>
    `- ${id}: ${how}\n` + Object.entries(facts).map(([k, v]) => `    · ${k}: ${v.description}${v.enum ? ` (${v.enum.join('/')})` : ''}`).join('\n')).join('\n');
}

// 지급 기한이 '다음 달 말일'보다 늦은지(원문 해석). 판단 못 하면 null
function payLate(t) {
  if (!t) return null;
  if (/다음\s*달\s*(말일|\d{1,2}\s*일)/.test(t) || /익월\s*(말일|\d{1,2}\s*일)/.test(t)) return false;
  const d = t.match(/(\d+)\s*일\s*(이내|안에|까지)/);
  if (d) return +d[1] > 31;
  if (/(\d+)\s*개월/.test(t)) return +t.match(/(\d+)\s*개월/)[1] > 1;
  return null;
}
const nonStdCost = list => (list ?? []).some(c => !/세|수수료/.test(c));

// 표준과 다름 판정(코드). freelance.json 의 diff_when 과 같은 뜻. 판정할 수 없는 항목은 null
export const DIFF = {
  납품형: {
    pay: f => f.advance_pct === 0 || (f.advance_pct == null && !f.final_when && !f.final_after),
    revision: f => f.unlimited === true || f.extra_fee == null,
    inspect: f => f.until_satisfied === true || f.deadline_days == null || f.deadline_days > 14,
    ip: f => f.owner !== '의뢰인' || f.transfer !== '대금완납후' || f.unchosen_to === '의뢰인',
    cancel: f => f.client_cancel_pay !== '전액' || f.interim_rights === '의뢰인',
    damages: f => f.who !== '양쪽', // 상한 기준은 표준 제9조에 없어 뺌(사용자 결정 2026-11-20)
    extra_cost: f => f.rule !== '따로청구',                                   // 제4조
    portfolio: f => f.rule !== '공표후또는동의',                              // 제11조② (조건 없이 가능도 '다름', 유리할 수 있음)
    delay: f => f.rate_pct == null || f.rate_pct > 0.125 || f.cap_pct == null || f.cap_pct > 10, // 제14조①
  },
  권리형: {
    share: f => f.base_defined !== true || nonStdCost(f.deduct_costs),
    settle: f => f.cycle !== '매월' || payLate(f.pay_by) === true,
    // 표준 제10조⑤: 대가 유무와 관계없이 제공 + 5가지(총매출·코인당 단가·비용 내역·순매출·실제 지급액) (사용자 결정 2026-11-20)
    statement: f => f.zero_month !== true || stmtWords(f.contents).length < STMT.length,
    period: f => f.auto_renew === true,
    scope: f => f.publish === true || f.offline === true || f.overseas === true,
    derivative: f => f.rule !== '포함안함_별도계약',
    moral: f => f.name_display !== true || f.change_consent !== true,          // 제16조②③
    cost: f => f.company_pays !== true || f.extra_work_paid !== true,         // 제12조②③
    length: f => f.set_by === '회사' || f.extra_pay !== true,
    rest: f => f.per_50 == null || f.per_50 < 2,
    cancel: f => f.who !== '양쪽' || f.immediate === true || f.refund === true,
    damages: f => f.who !== '양쪽' || f.penalty === true,
    secret: f => f.exceptions !== true,
    review: f => f.days == null || f.days < 15,
  },
};

/** AI 결과 → 항목별 { present, diff } (diff: 표준과 다름, 판정 없는 항목·없는 항목은 null) */
export function judgeItems(type, result) {
  const out = {};
  for (const [id] of ITEMS[type]) {
    const f = result?.items?.[id] ?? {};
    const rule = DIFF[type][id];
    out[id] = { present: f.present === true, diff: f.present === true && rule ? !!rule(f) : null };
  }
  return out;
}

// 채점·두 번 읽기 비교에 쓰는 핵심 숫자 칸 [항목, 사실 칸, 정답 파일 value 칸]
export const KEY_NUMBERS = {
  납품형: [['amount', 'amount', 'amount'], ['amount', 'vat', 'vat'], ['pay', 'advance_pct', 'advance_pct'], ['revision', 'included', 'included'], ['revision', 'extra_fee', 'extra_fee'], ['delay', 'rate_pct', 'rate_pct'], ['delay', 'cap_pct', 'cap_pct']],
  권리형: [['fee', 'per_episode', 'per_episode'], ['fee', 'deducted', 'deducted'], ['share', 'pct', 'pct'], ['rest', 'per_50', 'per_50'], ['cancel', 'cure_days', 'cure_days']],
};

/** 조항 문장(raw_text)과 AI가 정리한 값이 서로 어긋나는지 코드로 검사(true면 '확인필요').
 *  두 번 읽기가 같은 방향으로 틀리면 교차 확인으로 못 잡음 → 문장 속 낱말로 한 번 더 확인(2026-11-21, 10차 D3_기울어짐 저작권 무경고 오답 대응) */
const NOT_KO = '(?<![가-힣])';
export const CONTRA = {
  납품형: {
    ip: f => {
      const t = (f?.raw_text ?? '').replace(/\s+/g, ' ');
      const toWorker = new RegExp(`(저작권|지식재산권|권리)[^.]{0,25}(디자이너|작업자|공급자|수급인|${NOT_KO}을)에게 ?(있|귀속|유보)`).test(t);
      const toClient = new RegExp(`(저작권|지식재산권|권리)[^.]{0,25}(의뢰인|수요자|발주자|${NOT_KO}갑)에게 ?(있|귀속|양도|이전)`).test(t);
      return (toWorker && !toClient && f.owner === '의뢰인') || (toClient && !toWorker && f.owner === '작업자');
    },
  },
  권리형: {},
};

/** 두 번 읽기 비교: 있음/없음·표준과 다름·핵심 숫자가 다르면 그 항목을 '확인필요' */
export function crossCheck(type, a, b) {
  const ja = judgeItems(type, a), jb = b ? judgeItems(type, b) : null;
  const flags = {};
  for (const [id] of ITEMS[type]) {
    const why = [];
    if (jb) {
      if (ja[id].present !== jb[id].present) why.push('있음/없음');
      else if (ja[id].diff !== jb[id].diff) why.push('표준과 다름');
      for (const [item, k] of KEY_NUMBERS[type]) if (item === id && (a.items?.[id]?.[k] ?? null) !== (b.items?.[id]?.[k] ?? null)) why.push(k);
    }
    if (a.items?.[id]?.confidence && a.items[id].confidence !== 'high') why.push('AI가 불확실하다고 표시');
    const contra = CONTRA[type]?.[id];
    if (contra && [a, b].some(r => r?.items?.[id]?.present && contra(r.items[id]))) why.push('문장과 해석이 다름');
    if (why.length) flags[id] = why;
  }
  const companyFlag = jb && (a.company ?? null) !== (b.company ?? null);
  const typeFlag = jb && a.type_guess !== b.type_guess;
  return { judged: ja, flags, companyFlag, typeFlag };
}

// ───────── 비교(코드만) ─────────
const won = n => (n == null ? null : `${Number(n).toLocaleString('ko-KR')}원`);
const has = v => v !== null && v !== undefined && v !== '';
const join = (...xs) => xs.filter(has).join(' · ');
const MAP = {
  transfer: { 대금완납후: '돈을 다 받은 뒤 넘김', 계약즉시: '계약하자마자 넘김', 납품시: '납품할 때 넘김', 이전안함: '넘기지 않음', 기타: '기타' },
  cancelPay: { 전액: '전액 받음', 수행한만큼: '한 만큼만 받음', 없음: '돈을 못 받음', 언급없음: '받는 돈 언급 없음' },
  derivative: { 포함안함_별도계약: '포함 안 함(필요하면 별도 계약)', 우선협상권: '회사가 우선 협상권을 가짐', 양도또는허락: '이 계약으로 넘김', 기타: '기타' },
};
// 화면 요약은 AI가 옮긴 글자를 그대로 쓰지 않고 정해진 말 + 숫자·날짜만 쓴다(오독 글자가 화면에 나오지 않게, 사용자 결정 2026-11-20)
const finalDays = f => f.final_days ?? null;
const AFTER = { 검수: '검수 끝나고', 납품: '납품하고', 계약: '계약하고', 기타: '정한 때부터' };
const dayText = (after, d) => (d == null ? `${AFTER[after] ?? ''} (기한 없음)`.trim() : d === 0 ? `${AFTER[after] ?? ''} 바로`.trim() : `${AFTER[after] ?? ''} ${d}일 안`.trim());
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOr = t => (!has(t) ? null : DATE.test(t) ? t : /계약/.test(t) ? '계약일' : /납품/.test(t) ? '납품 때' : '날짜 없음');
const COST = [[/세/, '세금'], [/앱|마켓|스토어/, '앱마켓 수수료'], [/결제|PG/i, '결제 수수료'], [/운영/, '운영비'], [/마케팅|광고|홍보|프로모션/, '마케팅비']];
const costWords = list => [...new Set((list ?? []).map(c => COST.find(([re]) => re.test(c))?.[1] ?? '그 밖의 비용'))];
// 웹툰 표준 제10조⑤ 정산서 5가지. 판매 수량은 1호(총매출)에 포함. 순매출을 먼저 검사(총매출과 섞이지 않게)
const STMT = [[/순\s*매출/, '순매출'], [/총\s*매출|판매\s*(수량|량|수)|수량/, '총매출'], [/코인|단가|회차별\s*가격/, '코인당 단가'],
  [/비용|수수료|공제/, '비용 내역'], [/실제\s*지급|지급\s*(금)?액|수익\s*분배금|원고료|차감액|이월/, '실제 지급액']];
const stmtWords = list => [...new Set((list ?? []).map(c => STMT.find(([re]) => re.test(c))?.[1]).filter(Boolean))];
function payByText(t) {
  if (!t) return '지급일 없음';
  let m;
  if (/(다음|익)\s*달\s*말일/.test(t)) return '다음 달 말일까지';
  if ((m = t.match(/(다음|익)\s*달\s*(\d{1,2})\s*일/))) return `다음 달 ${m[2]}일까지`;
  if ((m = t.match(/(\d+)\s*일\s*(이내|안에|까지)/))) return `정산 기간 끝나고 ${m[1]}일 안`;
  return '지급일 적힘(원문 확인)';
}
const COURT = { 돈주는쪽주소지: '법원(상대 쪽 주소지)', 작업자쪽주소지: '법원(내 쪽 주소지)', 관할법원: '법원' };
const disputeText = f => [f.talk ? '협의' : null, f.mediation ? '조정' : null, COURT[f.court] ?? null].filter(Boolean).join(' → ') || '방법이 구체적이지 않음';

// 항목별 한 줄 요약(화면 칸에 보여 줄 글). f = AI(또는 사용자 수정) 사실 칸
// 한눈에 보기(3칸)용 짧은 글: 정해진 말 + 숫자만, 한 칸 10자 안팎(2026-11-20)
const man = n => (n == null ? null : n >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만원` : `${n.toLocaleString('ko-KR')}원`);
const ymd = t => (DATE.test(t ?? '') ? t.slice(2).replace(/-/g, '.') : null);
export const SHORT = {
  납품형: {
    amount: f => join(man(f.amount), f.vat === '포함' ? 'VAT포함' : null),
    pay: f => (f.advance_pct > 0 ? `먼저 ${f.advance_pct}%` : '전액 나중'),
    period: f => (ymd(f.end) ? `~${ymd(f.end)}` : ymd(f.delivery) ? `납품 ${ymd(f.delivery)}` : '날짜 없음'),
    deliverable: f => { const l = f.list ?? []; return l.length ? `${l.reduce((s, x) => s + (+(String(x).match(/(\d+)\s*(종|개|건|점|장|가지)/)?.[1] ?? 1)), 0)}가지` : null; },
    revision: f => (f.unlimited ? '무제한' : join(f.included != null ? `${f.included}회` : null, f.extra_fee > 0 || f.extra_fee === 0 ? '추가 유료' : '추가비 없음')),
    extra_cost: f => ({ 따로청구: '따로 청구', 계약금액에포함: '금액에 포함', 작업자부담: '작업자 부담' })[f.rule] ?? '기타',
    inspect: f => (f.until_satisfied ? '만족할 때까지' : f.deadline_days != null ? `${f.deadline_days}일 안` : '기한 없음'),
    ip: f => (f.owner === '작업자' ? '작업자 보유' : ({ 대금완납후: '완납 후 이전', 계약즉시: '즉시 이전', 납품시: '납품 때 이전', 이전안함: '이전 안 함' })[f.transfer] ?? '기타'),
    portfolio: f => ({ 조건없이가능: '사용 가능', 공표후또는동의: '공표 후 가능', 금지: '금지' })[f.rule] ?? '기타',
    cancel: f => ({ 전액: '전액 받음', 수행한만큼: '한 만큼', 없음: '못 받음' })[f.client_cancel_pay] ?? '언급 없음',
    damages: f => ({ 양쪽: '양쪽 배상', 작업자만: '작업자만', 의뢰인만: '의뢰인만' })[f.who] ?? null,
    delay: f => join(f.rate_pct != null ? `하루 ${f.rate_pct}%` : null, f.cap_pct != null ? `상한 ${f.cap_pct}%` : '상한 없음'),
    dispute: f => (f.mediation ? '조정 있음' : f.court && f.court !== '언급없음' ? '법원만' : '협의만'),
  },
  권리형: {
    fee: f => join(man(f.per_episode), f.deducted === true ? '수익서 뺌' : null),
    share: f => join(f.pct != null ? `${f.pct}%` : null, f.base_defined === true && !nonStdCost(f.deduct_costs) ? null : f.base_defined === true ? '비용 넓게 뺌' : '빼는 것 미정'),
    settle: f => join(f.cycle ?? null, (payByText(f.pay_by) || '').replace('정산 기간 끝나고 ', '').replace('까지', '')),
    statement: f => (f.zero_month ? `${stmtWords(f.contents).length}/5가지` : '정산서만'),
    period: f => join(f.years != null ? `${f.years}년` : null, f.auto_renew ? '자동연장' : null),
    scope: f => ([f.publish && '출판', f.offline && '오프라인', f.overseas && '해외'].filter(Boolean).length ? '범위 넓음' : '온라인만'),
    derivative: f => ({ 포함안함_별도계약: '별도 계약', 우선협상권: '우선협상권', 양도또는허락: '넘김' })[f.rule] ?? '기타',
    moral: f => (f.name_display === true && f.change_consent === true ? '동의 필요' : f.change_consent === false ? '동의 없이 변경' : '일부만'),
    length: f => join(f.min_cuts != null ? `${f.min_cuts}${f.max_cuts != null ? `~${f.max_cuts}` : ''}컷` : f.set_by === '회사' ? '회사가 정함' : null, f.extra_pay ? '추가금' : null),
    cost: f => (f.company_pays === true && f.extra_work_paid === true ? '회사 부담' : '일부만'),
    rest: f => (f.per_50 != null ? `50회당 ${f.per_50}회` : null),
    cancel: f => (f.who === '양쪽' && !f.immediate && !f.refund ? `양쪽·${f.cure_days ?? '?'}일` : join(f.who ?? null, f.immediate ? '즉시' : null, f.refund ? '반환' : null)),
    damages: f => join(f.who ?? null, f.penalty ? '정액' : null),
    secret: f => (f.exceptions ? '예외 있음' : '예외 없음'),
    review: f => (f.days != null ? `${f.days}일` : null),
    dispute: f => (f.mediation ? '조정 있음' : f.court && f.court !== '언급없음' ? '법원만' : '협의만'),
  },
};

const SUMMARY = {
  납품형: {
    amount: f => join(won(f.amount), f.vat && f.vat !== '언급없음' ? `부가세 ${f.vat}` : '부가세 언급 없음'),
    pay: f => (f.advance_pct > 0
      ? join(`먼저 ${f.advance_pct}%(${f.advance_days == null ? '계약 때' : f.advance_days === 0 ? '계약일' : `계약 후 ${f.advance_days}일 안`})`, `나머지 ${dayText(f.final_after, finalDays(f))}`)
      : `한꺼번에 ${dayText(f.final_after, finalDays(f))}`),
    period: f => join(has(f.start) || has(f.end) ? `${dateOr(f.start) ?? '?'} ~ ${dateOr(f.end) ?? '?'}` : null, f.delivery ? `납품 ${dateOr(f.delivery)}` : null),
    // "메뉴판 2종"처럼 개수가 적힌 것은 그 수만큼 셈(로고 1종·메뉴판 2종·컵 1종 → 4가지)
    deliverable: f => { const l = f.list ?? []; if (!l.length) return null; const n = l.reduce((s, x) => s + (+(String(x).match(/(\d+)\s*(종|개|건|점|장|가지)/)?.[1] ?? 1)), 0); return `결과물 ${n}가지`; },
    revision: f => (f.unlimited ? '제한 없이 수정' : join(f.included != null ? `${f.included}회 포함` : null, f.extra_fee > 0 ? `추가 1회 ${won(f.extra_fee)}` : f.extra_fee === 0 ? '추가는 별도 청구' : '추가 비용 없음')),
    inspect: f => (f.until_satisfied ? '의뢰인이 만족할 때까지' : f.deadline_days != null ? `받은 뒤 ${f.deadline_days}일 안에 결과 통보` : '검수 기한 없음'),
    ip: f => join(f.owner === '작업자' ? '저작권은 작업자가 갖고 의뢰인은 이용' : MAP.transfer[f.transfer], f.unchosen_to && f.unchosen_to !== '언급없음' ? `고르지 않은 시안: ${f.unchosen_to}` : null),
    cancel: f => join(`의뢰인 사정으로 끝내면 ${MAP.cancelPay[f.client_cancel_pay] ?? '받는 돈 언급 없음'}`, f.interim_rights && f.interim_rights !== '언급없음' ? `중간 결과물: ${f.interim_rights}` : null),
    damages: f => join(f.who ? `${f.who} 배상` : null, f.cap === true ? '상한 있음' : f.cap === false ? '상한 없음' : null),
    extra_cost: f => ({ 따로청구: '계약 금액 밖 비용은 따로 청구', 계약금액에포함: '모든 비용이 계약 금액에 포함', 작업자부담: '비용은 작업자 부담', 기타: '기타(원문 확인)' })[f.rule] ?? null,
    portfolio: f => ({ 조건없이가능: '조건 없이 사용 가능', 공표후또는동의: '공표 뒤 또는 동의 받아 사용 가능', 금지: '사용 금지', 기타: '기타(원문 확인)' })[f.rule] ?? null,
    delay: f => join(f.rate_pct != null ? `하루 ${f.rate_pct}%` : '비율 없음', f.cap_pct != null ? `최대 ${f.cap_pct}%` : '상한 없음'),
    dispute: disputeText,
  },
  권리형: {
    fee: f => join(f.per_episode != null ? `회당 ${won(f.per_episode)}` : null, f.deducted === true ? '수익에서 뺌' : f.deducted === false ? '수익에서 안 뺌' : null),
    share: f => join(f.pct != null ? `작가 ${f.pct}%` : null,
      f.base_defined === true && (f.deduct_costs ?? []).length ? `매출에서 빼는 것: ${costWords(f.deduct_costs).join(', ')}` : '매출에서 무엇을 빼는지 정하지 않음'),
    settle: f => join(f.cycle ? `${f.cycle} 정산` : null, payByText(f.pay_by)),
    statement: f => { const c = stmtWords(f.contents); return join(f.zero_month ? '돈이 없는 달에도 줌' : '정산서 줌', c.length ? `적는 내용: 표준 5가지 중 ${c.length}가지(${c.join(', ')})` : '적는 내용 정하지 않음'); },
    period: f => join(f.years != null ? (f.from === '연재종료' ? `연재 끝나고 ${f.years}년까지` : `계약 후 ${f.years}년`) : '기간 적힘(원문 확인)', f.auto_renew ? '자동 연장' : '자동 연장 없음'),
    scope: f => { const x = [f.publish && '출판', f.offline && '오프라인', f.overseas && '해외'].filter(Boolean); return x.length ? `온라인 연재 + ${x.join('·')}` : '온라인 연재만'; },
    derivative: f => MAP.derivative[f.rule] ?? null,
    moral: f => join(f.name_display === true ? '이름 표시' : '이름 표시 없음', f.change_consent === true ? '바꿀 때 작가 동의' : f.change_consent === false ? '동의 없이 바꿀 수 있음' : '바꿀 때 동의 언급 없음'),
    cost: f => join(f.company_pays === true ? '제작·홍보 비용은 회사' : f.company_pays === false ? '비용을 작가가 냄' : '비용 부담 언급 없음', f.extra_work_paid === true ? '추가 작업 대가 있음' : f.extra_work_paid === false ? '추가 작업 대가 없음' : null),
    length: f => join(f.min_cuts != null && f.max_cuts != null ? `${f.min_cuts}~${f.max_cuts}컷` : f.min_cuts != null ? `${f.min_cuts}컷 내외` : f.set_by === '회사' ? '회사가 정함' : '분량 정하지 않음', f.extra_pay ? '넘으면 추가금' : '넘어도 추가금 없음'),
    rest: f => (f.per_50 != null ? `50회당 ${f.per_50}회` : null),
    cancel: f => join(f.who ? `${f.who} 해지 가능` : null, f.cure_days ? `${f.cure_days}일 고칠 기회` : null, f.immediate ? '즉시 해지' : null, f.refund ? '받은 연재료 돌려줌' : null),
    damages: f => join(f.who ? `${f.who} 배상` : null, f.penalty ? '정해 둔 배상액 있음' : null),
    secret: f => (f.exceptions ? '예외 있음(자문·소송 등)' : '예외 없음'),
    review: f => (f.days != null ? `${f.days}일` : '검토 기간 정하지 않음'),
    dispute: disputeText,
  },
};

/**
 * 계약서 2~3개 비교. fl = freelance.json, contracts = [{ name, result }]
 * 반환: rows(항목별 칸), notes(부가세 환산·작업 범위 차이 경고), legend
 */
export function compare(fl, type, contracts) {
  const def = fl.types[type];
  const judged = contracts.map(c => judgeItems(type, c.result));
  const rows = def.items.map(item => {
    const cells = contracts.map((c, i) => {
      const f = c.result.items?.[item.id] ?? {};
      const j = judged[i][item.id];
      if (!j.present && item.missing_as_note) return { status: 'none', text: '적혀 있지 않음' }; // 빨강 대신 아래 참고 안내(사용자 결정 2026-11-20)
      if (!j.present) {
        // 법 필수 6항목(예술인 복지법 제4조의4②)만 조건부 '법으로' 문구. 상대 업종은 묻지 않음(사용자 결정 2026-11-20)
        return { status: 'missing', text: '계약서에 없음', notice: item.common ? fl.law_notice.law : fl.law_notice.general };
      }
      const cell = { status: j.diff ? 'diff' : 'ok', text: SUMMARY[type][item.id]?.(f) ?? '', short: SHORT[type][item.id]?.(f) || '—' }; // AI 원문(raw_text)은 화면에 보내지 않음
      // 수익 배분은 빼는 비용을 적어 둔 경우만(아예 안 정한 경우엔 '합의로 바꿀 수 있음' 안내가 맞지 않음)
      if (j.diff && item.diff_note && !(item.id === 'share' && f.base_defined !== true)) cell.notice = item.diff_note; // 표준이 합의로 바꾸는 것을 허용하는 항목의 안내(예: 수익 배분 제10조③)
      if (item.id === 'amount' && f.vat === '포함' && f.amount) cell.same_basis = Math.round(f.amount / 1.1);
      if (item.id === 'pay') cell.final_days = finalDays(f);
      return cell;
    });
    const texts = cells.map(c => `${c.status}|${c.text}`);
    return {
      id: item.id, name: item.name, standard: item.standard, clause: item.clause,
      law: !!item.common, differs: new Set(texts).size > 1, cells,
    };
  });

  const notes = [];
  const amountRow = rows.find(r => r.id === 'amount');
  if (amountRow?.cells.some(c => c.same_basis)) notes.push({ kind: 'vat', text: '부가세가 포함된 금액은 ÷1.1로 바꾼 "같은 기준 금액"을 함께 보여 줘요(비교용 참고).' });
  if (type === '납품형') {
    const lists = contracts.map(c => (c.result.items?.deliverable?.list ?? []).map(s => s.replace(/\s+/g, '')).sort().join('|'));
    if (lists.some(Boolean) && new Set(lists).size > 1) notes.push({ kind: 'scope', text: '작업 범위가 달라 금액을 그대로 비교하기 어려워요.' });
  }
  for (const r of rows) {
    const item = def.items.find(i => i.id === r.id);
    if (item.missing_note && r.cells.some(c => c.status === 'none')) notes.push({ kind: 'missing_note', text: item.missing_note });
  }
  // 노랑의 뜻(사용자 결정 2026-11-20: 유리한 차이도 노랑으로 두고 안내를 강화)
  notes.push({ kind: 'caution', text: '노랑은 "표준과 다름"이라는 뜻이에요. 표준계약서는 정부가 권하는 기준이라, 다르다고 항상 불리하거나 위법인 것은 아니고 오히려 유리할 수도 있어요.' });

  return {
    type, label: def.label, source: fl.sources[def.source]?.name, checked: fl.checked,
    names: contracts.map((c, i) => c.name || `${'ABC'[i]} 계약서`),
    rows, notes,
    legend: { missing: '계약서에 없음', diff: '표준과 다름', ok: '표준과 같음', none: '적혀 있지 않음(참고)' },
    counts: contracts.map((_, i) => ({ missing: rows.filter(r => r.cells[i].status === 'missing').length, diff: rows.filter(r => r.cells[i].status === 'diff').length })),
  };
}
