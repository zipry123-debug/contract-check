// 행정규칙(고시) 검색·본문·첨부 목록 출력(키는 출력하지 않음).
// 실행: node eval/tools/admrulfetch.mjs "디자인용역 표준계약서"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const vars = fs.readFileSync(path.join(root, 'service', '.dev.vars'), 'utf8');
const OC = (vars.match(/^\s*LAW_OC\s*=\s*"?([^"\r\n]+)"?/m) || [])[1]?.trim();
const hide = (s) => String(s).split(OC).join('***');
const api = (p, q) => `https://www.law.go.kr/DRF/${p}?OC=${encodeURIComponent(OC)}&type=JSON&` +
  Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const get = async (u) => { const t = await (await fetch(u)).text(); try { return JSON.parse(t); } catch { throw new Error(hide(t.slice(0, 300))); } };

const q = process.argv[2];
const s = await get(api('lawSearch.do', { target: 'admrul', query: q }));
const hits = arr(s?.AdmRulSearch?.admrul);
for (const h of hits.slice(0, 10)) console.log(`- ${h.행정규칙명} | ${h.소관부처명} | 발령 ${h.발령일자} | 시행 ${h.시행일자} | ${h.현행연혁구분} | ID ${h.행정규칙일련번호}`);
const pick = hits.find((h) => h.현행연혁구분 === '현행') || hits[0];
if (!pick) process.exit(0);
const d = await get(api('lawService.do', { target: 'admrul', ID: pick.행정규칙일련번호 }));
const body = d?.AdmRulService || d;
fs.mkdirSync(path.join(root, 'eval', '.cache', 'law'), { recursive: true });
fs.writeFileSync(path.join(root, 'eval', '.cache', 'law', `admrul-${pick.행정규칙일련번호}.json`), hide(JSON.stringify(d)), 'utf8');
console.log('\n# 본문');
console.log(arr(body?.조문내용).flat().join('\n').slice(0, 3000));
console.log('\n# 첨부');
console.log(hide(JSON.stringify(body?.첨부파일 ?? body?.별표 ?? Object.keys(body || {}), null, 1)).slice(0, 2000));
