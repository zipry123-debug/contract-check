// 4단계: 추출한 계약 항목을 법 기준과 비교(코드 계산, AI 판단 없음).
// 법률 자문이 아니라 '문제가 될 수 있는 조항'을 짚는 안내. 조문·수치는 2026-11-18 확인(출처: 인수인계 문서 참고).
// 입력: crossCheck 결과 { 항목명: { value, status, ... } } / 출력: [{ level, title, detail, law, fields, unsure }]

// 최저임금(시간급). 2026년 10,320원, 2027년 10,700원(2026-07 최저임금위원회 의결, 언론 보도 2곳 이상 확인)
export const MIN_WAGE = { 2026: 10320, 2027: 10700 };
const WEEKS_PER_MONTH = 365 / 7 / 12; // 4.345주

const LAW = {
  minwage: '최저임금법 제6조(최저임금의 효력)',
  probation: '최저임금법 제5조 제2항, 같은 법 시행령 제3조(수습 중 감액)',
  hours: '근로기준법 제50조(근로시간)·제53조(연장 근로의 제한)',
  rest: '근로기준법 제54조(휴게)',
  holiday: '근로기준법 제55조(휴일)·제18조 제3항(초단시간근로자)',
  penalty: '근로기준법 제20조(위약 예정의 금지)',
  fullpay: '근로기준법 제43조(임금 지급)',
  discipline: '근로기준법 제95조(제재 규정의 제한)',
  premium: '근로기준법 제56조(연장·야간 및 휴일 근로)',
  written: '근로기준법 제17조(근로조건의 명시)',
};
const SMALL = ' 상시 근로자 5명 미만 사업장에는 이 조항이 적용되지 않을 수 있어요.';

const minutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? ''); return m ? +m[1] * 60 + +m[2] : null; };
const won = n => `${Math.round(n).toLocaleString('ko-KR')}원`;

export function judge(r) {
  const out = [];
  const val = n => r[n]?.value ?? null;
  const unsureOf = names => names.some(n => r[n]?.status === '확인필요');
  const add = (level, title, detail, law, fields) => out.push({ level, title, detail, law, fields, unsure: unsureOf(fields) });

  // ---------- 근로시간 계산 ----------
  const s = minutes(val('시업시각')), e0 = minutes(val('종업시각'));
  const br = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(val('휴게시간') ?? '');
  const breakMin = br ? ((minutes(br[2]) - minutes(br[1]) + 1440) % 1440) : null;
  const e = s !== null && e0 !== null ? (e0 <= s ? e0 + 1440 : e0) : null;
  const span = s !== null && e !== null ? e - s : null;                 // 출근~퇴근(분)
  const dailyMin = span !== null ? span - (breakMin ?? 0) : null;       // 하루 근로시간(분)
  const days = Number.isInteger(val('주근무일수')) ? val('주근무일수') : null;
  const weekly = dailyMin !== null && days ? dailyMin * days / 60 : null; // 1주 근로시간
  const hourFields = ['시업시각', '종업시각', '휴게시간', '주근무일수'];

  // 휴게시간(5명 미만 사업장도 적용)
  if (dailyMin !== null) {
    const need = span - (breakMin ?? 0) >= 480 ? 60 : span - (breakMin ?? 0) >= 240 ? 30 : 0;
    if (need && (breakMin ?? 0) < need) add('위험', '휴게시간이 부족할 수 있어요',
      `하루 ${dailyMin / 60}시간 일하는데 휴게시간이 ${breakMin ?? 0}분이에요. 4시간 근로에 30분, 8시간 근로에 1시간 이상 쉬는 시간을 근로시간 도중에 줘야 해요.${need === 30 ? ' 다만 2026년 12월 10일부터는 근로시간이 4시간인 경우 근로자 본인이 쉬지 않겠다고 직접 요청하면 휴게를 주지 않아도 됩니다. 본인이 요청하지 않았다면 해당하지 않아요.' : ''}`, LAW.rest, ['휴게시간']);
  }
  // 근로시간 한도
  if (weekly !== null) {
    if (weekly > 52) add('위험', '일주일 근로시간이 52시간을 넘어요',
      `하루 ${dailyMin / 60}시간 × 주 ${days}일 = 주 ${weekly}시간이에요. 기본 40시간에 연장근로를 더해도 주 52시간까지만 허용됩니다.${SMALL}`, LAW.hours, hourFields);
    else if (weekly > 40 || dailyMin > 480) add('주의', '기본 근로시간(하루 8시간·주 40시간)을 넘어요',
      `주 ${weekly}시간이에요. 넘는 시간은 연장근로이며, 연장근로에는 통상임금의 50% 이상을 더 받아야 해요.${SMALL}`, `${LAW.hours}, ${LAW.premium}`, hourFields);
  }
  // 주휴일·초단시간
  if (weekly !== null && weekly < 15) add('참고', '주 15시간 미만이라 주휴일·연차가 적용되지 않아요',
    `주 ${weekly}시간이에요. 4주 평균 주 15시간 미만이면 유급 주휴일과 연차유급휴가 규정이 적용되지 않아요.`, LAW.holiday, hourFields);
  else if (weekly !== null && weekly >= 15 && !val('주휴일')) add('주의', '주휴일이 적혀 있지 않아요',
    `1주 근로시간이 ${weekly}시간(15시간 이상)이라 정해진 근무일을 모두 나가면 유급 주휴일(주휴수당)을 받을 수 있어요.`, LAW.holiday, ['주휴일']);
  else if (weekly !== null && weekly >= 15 && weekly < 40) add('참고', '주휴수당을 받을 수 있어요',
    `1주 근로시간이 ${weekly}시간(15시간 이상)이에요. 정해진 근무일을 1주 동안 모두 나가면 유급 주휴일(주휴수당)이 생깁니다.`, LAW.holiday, hourFields);

  // ---------- 최저임금 ----------
  const pay = val('임금액'), kind = val('임금형태');
  const allow = Array.isArray(val('기타수당')) ? val('기타수당').reduce((a, x) => a + (+x.amount || 0), 0) : 0;
  let hourly = null, hourlyWithAllow = null, basis = '';
  if (Number.isFinite(pay) && pay > 0) {
    if (kind === '시급') { hourly = pay; hourlyWithAllow = pay; basis = '시급'; }
    else if (kind === '월급' && weekly) {
      // 월 기준시간 = (주 근로시간 + 주휴시간) × 4.345주. 연장근로도 1배로만 쳐서 계산(사업주에게 유리하게 본 하한)
      const juhyu = weekly >= 15 ? Math.min(8, weekly / 5) : 0;
      const monthHours = (weekly + juhyu) * WEEKS_PER_MONTH;
      hourly = pay / monthHours; hourlyWithAllow = (pay + allow) / monthHours;
      basis = `월급 ÷ 월 ${Math.round(monthHours)}시간(주휴 포함)`;
    } else if (kind === '일급' && dailyMin) { hourly = pay / (dailyMin / 60); hourlyWithAllow = hourly; basis = '일급 ÷ 하루 근로시간'; }
  }
  const startY = +String(val('계약시작일') ?? '').slice(0, 4) || null;
  const endY = +String(val('계약종료일') ?? '').slice(0, 4) || null;
  const years = startY ? Object.keys(MIN_WAGE).map(Number).filter(y => y >= startY && (!endY || y <= endY)) : [];
  const wageFields = ['임금액', '임금형태', '계약시작일', '계약종료일', ...(kind === '월급' ? hourFields : [])];
  for (const y of years) {
    if (hourly === null) break;
    const mw = MIN_WAGE[y];
    if (hourlyWithAllow < mw) add('위험', `${y}년 최저임금(시급 ${won(mw)})보다 낮을 수 있어요`,
      `${basis} 기준 시간당 약 ${won(hourlyWithAllow)}이에요.${kind === '월급' && weekly > 40 ? ' 연장근로 가산을 빼고 계산해도 낮아요.' : ''} ${y > startY ? `${y}년 1월 1일부터는` : `${y}년에는`} 시간당 ${won(mw)} 이상이어야 해요.`, LAW.minwage, wageFields);
    else if (hourly < mw) add('참고', `기본급만으로는 ${y}년 최저임금보다 낮아요`,
      `기본급만 보면 시간당 약 ${won(hourly)}이지만 매달 주는 수당(${won(allow)})을 합치면 약 ${won(hourlyWithAllow)}이에요. 매월 정기적으로 주는 수당은 최저임금 계산에 들어갑니다.`, LAW.minwage, [...wageFields, '기타수당']);
    if (kind === '월급' && weekly > 40 && hourlyWithAllow >= mw) {
      // 연장근로 가산까지 반영한 필요 월급
      const need = ((40 + 8) + (weekly - 40) * 1.5) * WEEKS_PER_MONTH * mw;
      if (pay + allow < need) add('주의', '연장근로 수당이 충분히 들어 있는지 확인이 필요해요',
        `주 ${weekly}시간 일하면 ${y}년 기준 연장근로 가산(50%)까지 포함해 월 약 ${won(need)} 이상이어야 해요. 계약서 월급은 ${won(pay + allow)}이에요.${SMALL}`, `${LAW.minwage}, ${LAW.premium}`, wageFields);
    }
  }
  if (startY && years.length === 0 && hourly !== null) add('참고', '해당 연도 최저임금 정보가 없어 비교하지 못했어요', `계약 시작 연도 ${startY}년의 최저임금이 서비스에 등록되어 있지 않아요.`, LAW.minwage, ['계약시작일']);

  // 가산임금률(단시간 양식)
  const prem = val('초과근로가산임금률');
  if (Number.isFinite(prem) && prem < 50) add('위험', '초과근로 가산임금률이 50%보다 낮아요', `계약서에 ${prem}%로 적혀 있어요. 연장근로에는 50% 이상을 더 줘야 해요.${SMALL}`, LAW.premium, ['초과근로가산임금률']);

  // ---------- 수습 ----------
  const rate = val('수습임금비율');
  if (val('수습여부') === true && Number.isFinite(rate) && rate < 100 && hourly !== null && years.length) {
    const mw = MIN_WAGE[years[0]], probHourly = hourlyWithAllow * rate / 100;
    const contractYears = val('기간의정함') === false ? Infinity
      : (startY && val('계약종료일') ? (new Date(val('계약종료일')) - new Date(val('계약시작일'))) / (365 * 864e5) + 1 / 365 : 0);
    const months = +String(val('수습기간') ?? '').match(/(\d+)\s*개월/)?.[1] || null;
    if (probHourly < mw) {
      const allowed = contractYears >= 1 && (months === null || months <= 3) && probHourly >= mw * 0.9;
      if (!allowed) add('위험', '수습 중 임금이 최저임금 감액 한도보다 낮을 수 있어요',
        `수습 중 시간당 약 ${won(probHourly)}이에요. 수습 감액은 1년 이상 계약, 수습 3개월 이내, 최저임금의 90%(${won(mw * 0.9)}) 이상일 때만 가능하며 단순노무 업무는 감액할 수 없어요.`, LAW.probation, ['수습임금비율', '수습기간', '임금액', '계약종료일']);
      else add('주의', '수습 중 최저임금의 90%까지 감액돼요',
        `수습 중 시간당 약 ${won(probHourly)}이에요. 1년 이상 계약·3개월 이내·90% 이상이라 감액 요건은 맞지만, 단순노무 업무라면 감액할 수 없어요.`, LAW.probation, ['수습임금비율', '수습기간', '업무내용']);
    }
  }

  // ---------- 특약 문구 ----------
  const sp = String(val('특약사항') ?? '');
  if (sp) {
    if (/위약금|배상|손해/.test(sp) || /(퇴사|그만|계약.*만료.*전).{0,40}(지급|반환|변상)/.test(sp)) add('위험', '위약금·손해배상을 미리 정한 조항이 있어요',
      '퇴사나 계약 위반에 대비해 위약금·배상액을 미리 정하는 계약은 할 수 없고, 이런 약정은 효력이 없어요. 실제 들어간 교육비를 반환하는 약정은 예외로 인정되는 경우도 있어 구체적 사정을 확인해야 해요.', LAW.penalty, ['특약사항']);
    if (/공제/.test(sp)) add(/지각|결근/.test(sp) ? '주의' : '위험', '임금에서 돈을 빼는 조항이 있어요',
      /지각|결근/.test(sp)
        ? '실제로 일하지 않은 시간만큼 임금을 덜 주는 것은 가능하지만, 그보다 더 빼는 것은 감급(징계)이며 한 번에 하루 평균임금의 절반, 한 달 임금 총액의 10분의 1을 넘을 수 없어요.'
        : '임금은 원칙적으로 전액을 지급해야 해요. 유니폼·교육비 등을 근로자 동의 없이 임금에서 빼는 것은 문제가 될 수 있어요.',
      /지각|결근/.test(sp) ? `${LAW.fullpay}, ${LAW.discipline}` : LAW.fullpay, ['특약사항']);
    if (/(연장|야간|휴일).{0,20}(포함|포괄)/.test(sp)) add('주의', '연장·야간·휴일 수당을 월급에 포함한 조항(포괄임금)이 있어요',
      '근로시간을 계산하기 어려운 경우가 아니면 포괄임금 약정이 인정되지 않을 수 있어요. 실제 연장근로 시간에 대한 법정 수당이 월급에 든 금액보다 많으면 차액을 받을 수 있으니 출퇴근 기록을 남겨 두세요.', LAW.premium, ['특약사항']);
  }

  // ---------- 서면 명시·서명·사회보험 ----------
  const missing = [['임금액', '임금'], ['시업시각', '근로시간'], ['주휴일', '휴일']].filter(([n]) => val(n) === null).map(([, l]) => l);
  if (val('연차유급휴가문구') === false) missing.push('연차유급휴가');
  if (missing.length) add('주의', `필수로 적어야 할 내용이 보이지 않아요: ${missing.join(', ')}`,
    '임금(구성·계산·지급방법), 소정근로시간, 휴일, 연차유급휴가는 서면으로 명시해 근로자에게 줘야 해요. 사진에서 읽지 못한 것일 수도 있으니 원본을 확인해 주세요.', LAW.written, ['임금액', '시업시각', '주휴일', '연차유급휴가문구']);
  const noSign = [['사업주서명', '사업주'], ['근로자서명', '근로자']].filter(([n]) => val(n) === false).map(([, l]) => l);
  if (noSign.length) add('주의', `${noSign.join('·')} 서명이 없어요`, '서명(또는 날인)이 없으면 나중에 계약 내용을 두고 다툼이 생길 때 불리할 수 있어요. 양쪽 서명을 받은 계약서를 한 부 받아 두세요.', LAW.written, ['사업주서명', '근로자서명']);
  if (val('작성일') === null) add('참고', '계약서 작성일이 비어 있어요', '작성일이 없으면 언제 맺은 계약인지 다툼이 생길 수 있어요.', LAW.written, ['작성일']);
  const ins = ['고용보험', '산재보험', '국민연금', '건강보험'];
  const unchecked = ins.filter(n => val(n) === false);
  const monthHours = weekly ? weekly * WEEKS_PER_MONTH : null;
  if (unchecked.length) {
    const pension = unchecked.filter(n => n === '국민연금' || n === '건강보험');
    const parts = [];
    if (unchecked.includes('산재보험')) parts.push('산재보험은 근로자를 1명이라도 쓰면 원칙적으로 적용되며 근로자 본인 부담이 없어요');
    if (unchecked.includes('고용보험')) {
      const short = (weekly !== null && weekly < 15) || (monthHours !== null && monthHours < 60);
      parts.push(short
        ? '고용보험은 주 15시간 미만 또는 한 달 60시간 미만이면 제외될 수 있지만, 3개월 이상 계속 일하면 적용됩니다(2027년 1월 1일부터는 시간 대신 소득 기준으로 바뀝니다)'
        : '고용보험은 주 15시간 이상·한 달 60시간 이상 일하면 원칙적으로 적용됩니다(2027년 1월 1일부터는 시간 대신 소득 기준으로 바뀝니다)');
    }
    if (pension.length && (monthHours === null || monthHours >= 60)) parts.push(`${pension.join('·')}은 한 달 60시간 이상 일하면 원칙적으로 직장가입 대상이에요`);
    if (parts.length) add('주의', `사회보험이 체크되지 않았어요: ${unchecked.join(', ')}`, parts.join('. ') + '. 가입 여부를 사업주에게 확인해 보세요.', '고용보험법·산업재해보상보험법·국민연금법·국민건강보험법', unchecked);
  }

  const order = { 위험: 0, 주의: 1, 참고: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

// 대응 방법(고정 문구): AI가 지어내지 않도록 코드에 둔다
export const HELP = [
  { title: '고용노동부 고객상담센터', detail: '전화 1350 (평일 9시~18시). 근로계약·임금·근로시간 상담' },
  { title: '임금체불·근로조건 위반 신고', detail: '사업장 관할 지방고용노동청에 진정을 낼 수 있어요(고용노동부 누리집 민원 신청).' },
  { title: '증거 남기기', detail: '근로계약서 사본, 출퇴근 기록, 급여명세서·통장 입금 내역, 업무 지시 메시지를 보관해 두세요.' },
];
