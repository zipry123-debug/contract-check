// 개인정보 형식 찾기(AI 질문·커뮤니티 공용). 브라우저와 서버(Worker)가 같은 파일을 쓴다.
// 형식만 보는 규칙이라 이름·회사명 같은 정보는 거르지 못한다(화면에서 따로 안내).
export const PII_RULES = [
  { kind: '주민등록번호', re: /\d{6}\s*-\s*[1-4]\d{6}/g },
  { kind: '전화번호', re: /(?<![\d-])0\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{4}(?![\d-])/g },
  { kind: '이메일', re: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g },
  { kind: '계좌번호', re: /\d{2,6}-\d{2,6}-\d{4,8}/g },
  { kind: '긴 숫자(전화·계좌 등)', re: /\d{10,}/g },
];

/** 찾은 개인정보 형식 목록 [{kind, text}] (같은 위치는 한 번만) */
export function findPII(s) {
  const out = [], seen = new Set();
  for (const { kind, re } of PII_RULES) {
    for (const m of String(s ?? '').matchAll(re)) {
      if ([...Array(m[0].length).keys()].some(i => seen.has(m.index + i))) continue;
      for (let i = 0; i < m[0].length; i++) seen.add(m.index + i);
      out.push({ kind, text: m[0] });
    }
  }
  return out;
}
