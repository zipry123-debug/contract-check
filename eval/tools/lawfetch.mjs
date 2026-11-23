// 법령 이름으로 현행 원문을 받아 지정한 조문만 출력한다(키는 출력하지 않음).
// 실행: node eval/tools/lawfetch.mjs "예술인 복지법" 2 4의4 5
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const vars = fs.readFileSync(path.join(root, 'service', '.dev.vars'), 'utf8');
const OC = (vars.match(/^\s*LAW_OC\s*=\s*"?([^"\r\n]+)"?/m) || [])[1]?.trim();
if (!OC) { console.error('LAW_OC 없음'); process.exit(1); }
const hide = (s) => String(s).split(OC).join('***');
const api = (p, q) => `https://www.law.go.kr/DRF/${p}?OC=${encodeURIComponent(OC)}&type=JSON&` +
  Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const get = async (u) => { const t = await (await fetch(u)).text(); try { return JSON.parse(t); } catch { throw new Error(hide(t.slice(0, 200))); } };

const [name, ...want] = process.argv.slice(2);
const s = await get(api('lawSearch.do', { target: 'law', query: name }));
const hits = arr(s?.LawSearch?.law);
const hit = hits.find((h) => h.법령명한글 === name) || hits[0];
if (!hit) { console.log('검색 결과 없음'); process.exit(0); }
console.log(`# ${hit.법령명한글} | 시행 ${hit.시행일자} | 공포 ${hit.공포일자} | MST ${hit.법령일련번호}`);
const doc = await get(api('lawService.do', { target: 'law', MST: hit.법령일련번호 }));
fs.mkdirSync(path.join(root, 'eval', '.cache', 'law'), { recursive: true });
fs.writeFileSync(path.join(root, 'eval', '.cache', 'law', `${name}.json`), hide(JSON.stringify(doc)), 'utf8');
for (const u of arr(doc?.법령?.조문?.조문단위)) {
  if (u.조문여부 !== '조문') continue;
  const key = u.조문번호 + (u.조문가지번호 ? '의' + u.조문가지번호 : '');
  if (want.length && !want.includes(key)) continue;
  const out = [u.조문내용];
  for (const h of arr(u.항)) { out.push(h.항내용 || ''); for (const ho of arr(h.호)) { out.push('  ' + (ho.호내용 || '')); for (const m of arr(ho.목)) out.push('    ' + arr(m.목내용).flat().join(' ')); } }
  console.log(`\n[제${key}조 시행 ${u.조문시행일자}]\n` + out.join('\n'));
}
