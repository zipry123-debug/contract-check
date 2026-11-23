// 근로계약서 추출: 항목 정의 → Gemini 출력 양식 + 채점 규칙. 브라우저에서도 쓸 수 있게 의존성 없음(normalize.js의 CER만 사용).
// 항목마다 { raw_text, value, confidence, status } — 지시서 형식. 3단계는 읽기·구조화만, 위법 판정은 하지 않는다.
import { cerParts } from './normalize.js';

// type: date | time | range | int | bool | text | days | day | enum | allowances | str
export const FIELDS = [
  ['사업체명', 'text', '사업주(회사·가게) 이름. 계약서 첫 줄이나 사업주 서명란의 사업체명을 적힌 그대로'],
  ['고용형태', 'enum', '정규직 | 계약직 | 단시간 | 인턴. 계약서 제목과 기간으로 판단(기간의 정함이 없는 표준계약서=정규직, 있는 경우=계약직, 단시간근로자 양식=단시간). 수습은 수습여부로 따로 적음', ['정규직', '계약직', '단시간', '인턴']],
  ['기간의정함', 'bool', '근로계약기간에 종료일이 있으면 true, 근로개시일만 있으면 false'],
  ['계약시작일', 'date', '근로계약기간 시작일 또는 근로개시일. YYYY-MM-DD'],
  ['계약종료일', 'date', '근로계약기간 종료일. YYYY-MM-DD. 기간의 정함이 없으면 null·해당없음'],
  ['수습여부', 'bool', '수습(시용) 조항이 있으면 true'],
  ['수습기간', 'str', '예: "3개월". 수습 조항이 없으면 null·해당없음'],
  ['수습임금비율', 'int', '수습 중 지급 비율(%) 숫자만. 예: 90. 수습 조항이 없으면 null·해당없음'],
  ['근무장소', 'text', '적힌 그대로'],
  ['업무내용', 'text', '적힌 그대로'],
  ['시업시각', 'time', 'HH:MM (24시간)'],
  ['종업시각', 'time', 'HH:MM (24시간)'],
  ['휴게시간', 'range', '"HH:MM-HH:MM"'],
  ['주근무일수', 'int', '주 며칠 근무하는지 숫자만'],
  ['근무요일', 'days', '근무하는 요일을 쉼표로. 예: "월,화,수,목,금"'],
  ['주휴일', 'day', '요일 한 글자. 예: "일"'],
  ['임금형태', 'enum', '시급 | 일급 | 월급. "월(일, 시간)급"에서 표시(밑줄·동그라미 등)된 것', ['시급', '일급', '월급']],
  ['임금액', 'int', '원 단위 숫자만. 예: 2200000'],
  ['상여금', 'int', '상여금 금액(원) 숫자만. "없음"에 표시되어 있으면 0'],
  ['기타수당', 'allowances', '기타급여(제수당) 목록. "없음"에 표시되어 있으면 빈 배열'],
  ['초과근로가산임금률', 'int', '단시간 양식의 "초과근로에 대한 가산임금률"(%) 숫자만. 항목이 없으면 null·해당없음'],
  ['임금지급일', 'str', '예: "매월 10일", "매월 말일"'],
  ['지급방법', 'enum', '직접지급 | 통장입금 (표시된 쪽)', ['직접지급', '통장입금']],
  ['연차유급휴가문구', 'bool', '연차유급휴가 조항이 있으면 true'],
  ['고용보험', 'bool', '사회보험 칸에 체크되어 있으면 true, 빈칸이면 false'],
  ['산재보험', 'bool', '위와 같음'],
  ['국민연금', 'bool', '위와 같음'],
  ['건강보험', 'bool', '위와 같음'],
  ['계약서교부문구', 'bool', '근로계약서 교부 조항이 있으면 true'],
  ['특약사항', 'text', '특약사항 조항의 원문 전체(한 글자도 빼지 않음). 특약 조항이 없으면 null·해당없음'],
  ['사업주서명', 'bool', '사업주 (서명) 칸에 서명·도장이 있으면 true, 비어 있으면 false'],
  ['근로자서명', 'bool', '근로자 (서명) 칸에 서명·도장이 있으면 true, 비어 있으면 false'],
  ['작성일', 'date', '계약서 하단 작성 날짜. YYYY-MM-DD. 빈칸이면 null·확인필요'],
].map(([name, type, desc, options]) => ({ name, type, desc, options }));

// ---------- Gemini 출력 양식 ----------
const VALUE_TYPE = {
  int: { type: 'INTEGER', nullable: true }, bool: { type: 'BOOLEAN', nullable: true },
  allowances: { type: 'ARRAY', nullable: true, items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, amount: { type: 'INTEGER' } }, required: ['name', 'amount'], propertyOrdering: ['name', 'amount'] } },
};
const fieldSchema = f => ({
  type: 'OBJECT', description: f.desc,
  properties: {
    raw_text: { type: 'STRING', nullable: true, description: '계약서에 적힌 원문 그대로(손글씨 포함). 없으면 null' },
    value: f.options ? { type: 'STRING', nullable: true, enum: f.options } : (VALUE_TYPE[f.type] ?? { type: 'STRING', nullable: true }),
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    status: { type: 'STRING', enum: ['ok', '확인필요', '해당없음'] },
  },
  required: ['raw_text', 'value', 'confidence', 'status'],
  propertyOrdering: ['raw_text', 'value', 'confidence', 'status'],
});
export const CONTRACT_SCHEMA = {
  type: 'OBJECT',
  properties: Object.fromEntries(FIELDS.map(f => [f.name, fieldSchema(f)])),
  required: FIELDS.map(f => f.name),
  propertyOrdering: FIELDS.map(f => f.name),
};

// ---------- 값 정리·비교 ----------
const nfkc = s => String(s).normalize('NFKC');
export function normDate(s) {
  if (s === null || s === undefined || s === '') return null;
  const m = nfkc(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}
export function normTime(s) {
  if (s === null || s === undefined || s === '') return null;
  const m = nfkc(s).match(/(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/);
  return m ? `${m[1].padStart(2, '0')}:${(m[2] ?? '0').padStart(2, '0')}` : null;
}
const normRange = s => {
  if (!s) return null;
  const t = [...nfkc(s).matchAll(/(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/g)].map(m => `${m[1].padStart(2, '0')}:${(m[2] ?? '0').padStart(2, '0')}`);
  return t.length >= 2 ? `${t[0]}-${t[1]}` : null;
};
const DAYS = '월화수목금토일';
const normDays = s => (s ? [...new Set([...nfkc(s)].filter(c => DAYS.includes(c)))].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)).join(',') : null);
const toInt = v => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : Number(nfkc(v).replace(/[^\d.-]/g, '')) || (/\d/.test(v) ? 0 : null));
const toBool = v => (v === null || v === undefined ? null : typeof v === 'boolean' ? v : /^(true|예|있음|o|y)/i.test(String(v)) ? true : /^(false|아니|없음|x|n)/i.test(String(v)) ? false : null);
const squash = s => nfkc(s).replace(/\s+/g, '').replace(/^매월/, ''); // "15일"과 "매월 15일"은 같은 뜻(양식에 '매월'이 인쇄됨)
const normAllow = a => (Array.isArray(a) ? a.map(x => `${nfkc(x.name).replace(/\s+/g, '')}:${toInt(x.amount)}`).sort().join('|') : null);

export const TEXT_OK_CER = 0.05; // 긴 글(장소·업무·특약)은 글자 오류율 5% 이하면 맞음으로 봄

/** 한 항목 비교 → { ok, cer? } */
export function compareField(f, gt, pred) {
  if (gt === null || gt === undefined) return { ok: pred === null || pred === undefined || pred === '' || (Array.isArray(pred) && !pred.length && f.type !== 'allowances') };
  switch (f.type) {
    case 'date': return { ok: normDate(gt) === normDate(pred) };
    case 'time': return { ok: normTime(gt) === normTime(pred) };
    case 'range': return { ok: normRange(gt) === normRange(pred) };
    case 'int': return { ok: toInt(gt) === toInt(pred) };
    case 'bool': return { ok: toBool(gt) === toBool(pred) };
    case 'days': return { ok: normDays(gt) === normDays(pred) };
    case 'day': return { ok: normDays(gt) === normDays(pred) };
    case 'allowances': return { ok: normAllow(gt) === normAllow(pred ?? []) };
    case 'text': {
      if (!pred) return { ok: false, cer: 1 };
      const c = cerParts(gt, pred); const cer = c.edits / (c.length || 1);
      return { ok: cer <= TEXT_OK_CER, cer };
    }
    default: return { ok: squash(gt) === squash(pred ?? '') };
  }
}

/** 숫자가 들어가는 항목(오독 사례 집계용) */
export const NUMERIC = new Set(FIELDS.filter(f => ['date', 'time', 'range', 'int', 'allowances'].includes(f.type) || f.name === '임금지급일').map(f => f.name));

// ---------- 체크박스 전용 다시 읽기(cb 프롬프트) ----------
// 손글씨 V 체크를 '빈칸'으로 읽는 오류가 두 번 읽기로도 안 잡혀서(2차 측정 위험 오답 14칸 중 12칸), 체크 칸만 따로 묻는다
export const CHECK_FIELDS = ['고용보험', '산재보험', '국민연금', '건강보험'];
const box = { type: 'OBJECT', properties: { seen: { type: 'STRING' }, checked: { type: 'BOOLEAN', nullable: true } }, required: ['seen', 'checked'], propertyOrdering: ['seen', 'checked'] };
export const CHECKBOX_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...Object.fromEntries(CHECK_FIELDS.map(n => [n, box])),
    bonus_seen: { type: 'STRING' },
    bonus_checked: { type: 'STRING', nullable: true, enum: ['있음', '없음'] },
    bonus_amount: { type: 'INTEGER', nullable: true },
  },
  required: [...CHECK_FIELDS, 'bonus_seen', 'bonus_checked', 'bonus_amount'],
  propertyOrdering: [...CHECK_FIELDS, 'bonus_seen', 'bonus_checked', 'bonus_amount'],
};
