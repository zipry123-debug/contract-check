// 지어내기(환각) 잡기: ① 두 번 읽기 비교 ② 규칙 검사. AI 없이 코드로 판단한다.
// 서버(service)와 평가 도구(eval)가 같이 쓴다. 의존성: contract.js(항목 정의·값 비교)
import { FIELDS, compareField, normDate, CHECK_FIELDS } from './contract.js';

const BY_NAME = Object.fromEntries(FIELDS.map(f => [f.name, f]));
const isEmpty = v => v === null || v === undefined || v === '';

/**
 * 같은 사진을 두 번(다른 프롬프트로) 읽은 결과를 합친다.
 * 값이 다르면 둘 중 하나는 지어냈거나 잘못 읽은 것 → '확인필요'.
 * 한쪽만 있으면(호출 실패) 그 결과를 그대로 쓰고 single 표시.
 * 반환: { 항목명: { raw_text, value, confidence, status, reasons: [], alt? } }
 */
export function mergeReads(a, b) {
  const out = {};
  for (const f of FIELDS) {
    const x = a?.[f.name], y = b?.[f.name];
    const base = { raw_text: null, value: null, confidence: 'low', status: '확인필요', ...(x ?? y ?? {}) };
    const item = { ...base, reasons: [] };
    if (x && y) {
      // 수습여부: 검증용 c1 프롬프트는 '조항 없음'을 null로 답함(c2는 false로 정의) → false와 null은 같은 뜻으로 봄
      const sameMeaning = f.name === '수습여부' && [x.value, y.value].every(v => v === false || v === null || v === undefined);
      const same = sameMeaning || compareField(f, x.value ?? null, y.value ?? null).ok;
      if (!same) {
        item.reasons.push('두 번 읽은 값이 서로 달라요');
        item.alt = y.value ?? null;
      } else if (x.status === '해당없음' && y.status !== '해당없음' && !isEmpty(y.value)) {
        item.reasons.push('두 번 읽은 결과가 서로 달라요');
      }
      // 두 결과 중 하나라도 확인필요·낮은 확신이면 그대로 알림
      if (y.status === '확인필요' && x.status === 'ok' && !sameMeaning) item.reasons.push('AI가 확실하지 않다고 표시했어요');
    }
    out[f.name] = item;
  }
  return out;
}

const days = v => (typeof v === 'string' ? [...new Set([...v].filter(c => '월화수목금토일'.includes(c)))].length : null);

/** 계약서 안의 값끼리 맞는지 검사(AI 판단 없음). 어긋나면 관련 항목에 이유를 단다. */
export function ruleCheck(r) {
  const add = (name, msg) => { if (r[name]) r[name].reasons.push(msg); };
  const v = name => r[name]?.value;

  // 날짜: 시작 < 종료, 작성일과 종료일이 같으면 작성일을 종료일로 착각했을 수 있음
  const s = normDate(v('계약시작일')), e = normDate(v('계약종료일')), w = normDate(v('작성일'));
  if (s && e && s >= e) { add('계약시작일', '시작일이 종료일보다 늦거나 같아요'); add('계약종료일', '시작일이 종료일보다 늦거나 같아요'); }
  if (e && w && e === w) add('계약종료일', '종료일이 작성일과 같아요. 작성일을 잘못 읽었을 수 있어요');
  for (const [n, d] of [['계약시작일', s], ['계약종료일', e], ['작성일', w]]) {
    if (d && (d < '2000-01-01' || d > '2100-12-31')) add(n, '날짜가 이상해요');
  }
  if (v('기간의정함') === false && !isEmpty(v('계약종료일'))) add('계약종료일', '기간이 없는 계약인데 종료일이 있어요');
  if (v('기간의정함') === true && isEmpty(v('계약종료일'))) add('계약종료일', '기간이 있는 계약인데 종료일을 못 읽었어요');

  // 근무일 수 = 근무 요일 개수
  const n = v('주근무일수'), dn = days(v('근무요일'));
  if (Number.isInteger(n) && dn && n !== dn) { add('주근무일수', `근무 요일(${dn}일)과 주 근무일 수(${n}일)가 달라요`); add('근무요일', '주 근무일 수와 요일 개수가 달라요'); }

  // 임금 형태와 금액의 크기가 어울리는지(자릿수 오독 탐지)
  const pay = v('임금액'), kind = v('임금형태');
  if (Number.isFinite(pay)) {
    if (kind === '시급' && (pay < 3000 || pay > 100000)) add('임금액', '시급으로 보기에 금액이 이상해요. 자릿수를 확인해 주세요');
    if (kind === '월급' && (pay < 300000 || pay > 30000000)) add('임금액', '월급으로 보기에 금액이 이상해요. 자릿수를 확인해 주세요');
    if (kind === '일급' && (pay < 20000 || pay > 1000000)) add('임금액', '일급으로 보기에 금액이 이상해요');
  }

  // 수습
  if (v('수습여부') === false && (!isEmpty(v('수습기간')) || !isEmpty(v('수습임금비율')))) add('수습여부', '수습 조항이 없다고 읽었는데 수습 내용이 있어요');
  const rate = v('수습임금비율');
  if (Number.isFinite(rate) && (rate < 10 || rate > 100)) add('수습임금비율', '비율이 이상해요');

  // 상호 대조: 근무장소에 사업체명이 들어 있으면 두 글자가 같아야 함(예: '밀담' vs '밀당')
  const biz = String(v('사업체명') ?? '').replace(/\(주\)|주식회사|\s/g, ''), place = String(v('근무장소') ?? '').replace(/\s/g, '');
  if (biz.length >= 2 && place) {
    const core = biz.slice(0, 2);
    if (place.includes(core) && !place.includes(biz)) add('근무장소', '근무장소의 상호가 사업체명과 조금 달라요');
  }
  return r;
}

/** 이유가 붙은 항목은 '확인필요'로 바꾼다. 최종 결과를 돌려줌 */
export function finalize(r) {
  for (const item of Object.values(r)) {
    if (item.reasons.length && item.status !== '확인필요') { item.status = '확인필요'; item.confidence = 'low'; }
    // AI가 스스로 확인필요·낮은 확신으로 표시한 항목도 이유를 보여 줌(주황색 항목은 항상 이유가 있게)
    if (!item.reasons.length && (item.status === '확인필요' || item.confidence === 'low')) {
      item.reasons.push(isEmpty(item.value) ? '칸이 비어 있거나 글자를 읽지 못했어요' : 'AI가 글자를 확실히 읽지 못했어요');
    }
    if (!item.reasons.length) delete item.reasons;
  }
  return r;
}

/**
 * 체크 칸 전용 다시 읽기(cb) 결과와 대조. 본 결과와 다르면 이유를 달고 다르게 읽힌 값을 보여 줌.
 * cb: { 고용보험: { seen, checked }, ..., bonus_checked: '있음'|'없음'|null, bonus_amount }
 */
export function checkboxCheck(r, cb) {
  if (!cb) return r;
  for (const n of CHECK_FIELDS) {
    const c = cb[n]?.checked, item = r[n];
    if (!item || c === undefined) continue;
    if (c === null) { if (item.value !== null) item.reasons.push('체크 칸을 확대해 봐도 표시가 잘 보이지 않아요'); continue; }
    if (typeof item.value === 'boolean' && item.value !== c) { item.reasons.push('체크 칸만 다시 읽었더니 결과가 달라요'); item.alt = c; }
  }
  const bonus = r['상여금'];
  if (bonus && Number.isFinite(bonus.value)) {
    if (cb.bonus_checked === '있음' && bonus.value === 0) { bonus.reasons.push('상여금 "있음" 칸에 표시가 있는 것 같아요'); if (Number.isFinite(cb.bonus_amount)) bonus.alt = cb.bonus_amount; }
    if (cb.bonus_checked === '없음' && bonus.value > 0) bonus.reasons.push('상여금 "없음" 칸에 표시가 있는 것 같아요');
  }
  return r;
}

export const crossCheck = (a, b, cb = null) => finalize(ruleCheck(checkboxCheck(mergeReads(a, b), cb)));
export { BY_NAME };
