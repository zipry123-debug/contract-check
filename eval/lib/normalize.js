// 값 파싱·텍스트 정규화·글자 오류율(CER). 브라우저와 Node 양쪽에서 쓸 수 있게 의존성 없음.

export const NUTRIENTS = [
  'calories', 'sodium', 'carbohydrate', 'sugars', 'fat',
  'trans_fat', 'saturated_fat', 'cholesterol', 'protein',
];

export const EXPECTED_UNIT = {
  calories: 'kcal', sodium: 'mg', cholesterol: 'mg',
  carbohydrate: 'g', sugars: 'g', fat: 'g', trans_fat: 'g', saturated_fat: 'g', protein: 'g',
};

const UNIT_ALIASES = {
  'kcal': 'kcal', '㎉': 'kcal', 'kcal.': 'kcal', '킬로칼로리': 'kcal',
  'mg': 'mg', '㎎': 'mg', '밀리그램': 'mg',
  'g': 'g', '그램': 'g',
  'μg': 'μg', 'µg': 'μg', 'ug': 'μg', '㎍': 'μg',
  'ml': 'ml', '㎖': 'ml', 'l': 'l', 'kg': 'kg', '㎏': 'kg',
};

/** "1,200mg", "1g 미만", "0.5 g" → { num, unit, lt } / 해석 불가면 null */
export function parseAmount(s) {
  if (s === null || s === undefined) return null;
  // 소수점 쉼표("2,3 g")는 점으로. 세 자리 쉼표("1,200mg")는 천 단위 구분이라 그대로 둔다.
  const str = String(s).normalize('NFKC').trim().replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
  if (!str) return null;
  const lt = /미만|</.test(str);
  const m = str.match(/(\d[\d,]*(?:\.\d+)?)\s*([a-zA-Zμµ㎉㎎㎍㎖㎏가-힣]*)/);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ''));
  const rawUnit = m[2].replace(/미만$/, '').toLowerCase();
  const unit = UNIT_ALIASES[rawUnit] ?? (rawUnit || null);
  return { num, unit, lt };
}

/** 정답과 예측 값이 같은지. 숫자·단위·'미만' 여부가 모두 같아야 정답. */
export function amountEqual(gt, pred) {
  const a = parseAmount(gt), b = parseAmount(pred);
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs(a.num - b.num) < 1e-9 && a.unit === b.unit && a.lt === b.lt;
}

/** CER 계산용: 유니코드 정규화 + 공백 전부 제거 (한글 띄어쓰기 차이는 오류로 보지 않음) */
export function normText(s) {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, '');
}

export function editDistance(a, b) {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

/** { edits, length } 반환. 여러 제품을 합산해 CER = Σedits / Σlength 로 계산한다. */
export function cerParts(gt, pred) {
  const g = normText(gt), p = normText(pred);
  return { edits: editDistance(g, p), length: [...g].length };
}
