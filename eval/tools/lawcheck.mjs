// laws.json 조문을 국가법령정보 OPEN API 원문과 비교한다. laws.json은 고치지 않고 보고만 한다.
// 실행: node eval/tools/lawcheck.mjs   (키: service/.dev.vars 의 LAW_OC, 이 PC IP가 API 신청 정보에 등록돼 있어야 함)
// 받은 원문은 eval/.cache/law/ 에 저장(키는 지워서 저장).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const lawsPath = path.join(root, 'service', 'public', 'laws.json');
const cacheDir = path.join(root, 'eval', '.cache', 'law');
fs.mkdirSync(cacheDir, { recursive: true });

const vars = fs.readFileSync(path.join(root, 'service', '.dev.vars'), 'utf8');
const OC = (vars.match(/^\s*LAW_OC\s*=\s*"?([^"\r\n]+)"?/m) || [])[1]?.trim();
if (!OC) { console.error('LAW_OC 없음 (.dev.vars)'); process.exit(1); }
const hide = (s) => s.split(OC).join('***');

async function get(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('JSON 아님: ' + hide(text.slice(0, 200))); }
  if (data.result && !data.LawSearch && !data.법령) throw new Error(hide(data.result + ' ' + (data.msg || '')));
  return data;
}
const api = (p, q) => `https://www.law.go.kr/DRF/${p}?OC=${encodeURIComponent(OC)}&type=JSON&` +
  Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const ymd = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s);

// 비교용 정규화: 공백·개정 표시·따옴표·가운뎃점 차이를 무시
function norm(s) {
  return String(s)
    .replace(/<(개정|신설|전문개정|본조신설|타법개정)[^>]*>/g, '')
    .replace(/\[(전문개정|본조신설|제목개정|종전[^\]]*|시행일[^\]]*)[^\]]*\]/g, '')
    .replace(/\(단서 생략\)/g, '')
    .replace(/[“”"]/g, '"').replace(/[‘’']/g, "'")
    .replace(/[ㆍ·]/g, '·')
    .replace(/\s+/g, '');
}

// 법령 본문 JSON → { '54': '전체 조문 텍스트', ... }
function articlesOf(doc) {
  const units = arr(doc?.법령?.조문?.조문단위).filter((u) => u.조문여부 === '조문');
  const map = {};
  for (const u of units) {
    const key = u.조문번호 + (u.조문가지번호 ? '의' + u.조문가지번호 : '');
    const parts = [String(u.조문내용 || '').replace(/^제\d+조(의\d+)?\([^)]*\)\s*/, '')];
    for (const h of arr(u.항)) {
      parts.push(h.항내용 || '');
      for (const ho of arr(h.호)) {
        parts.push(ho.호내용 || '');
        for (const m of arr(ho.목)) parts.push(arr(m.목내용).flat().join(' '));
      }
    }
    map[key] = { text: parts.join('\n'), eff: u.조문시행일자 };
  }
  return map;
}

async function findLaw(name, target) {
  const r = await get(api('lawSearch.do', { target, query: name, display: 100 }));
  const list = arr(r.LawSearch?.law);
  return list.filter((x) => x.법령명한글 === name);
}

async function loadLaw(mst, target, extra = {}) {
  const file = path.join(cacheDir, `${target}-${mst}${extra.efYd ? '-' + extra.efYd : ''}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = await get(api('lawService.do', { target, MST: mst, ...extra }));
  fs.writeFileSync(file, hide(JSON.stringify(r, null, 1)));
  return r;
}

const laws = JSON.parse(fs.readFileSync(lawsPath, 'utf8'));
const report = [];
const byLaw = {};
for (const a of laws.articles) (byLaw[a.law] ||= []).push(a);

for (const [name, items] of Object.entries(byLaw)) {
  if (name.endsWith('고시')) {
    for (const a of items) report.push({ id: a.id, 결과: '건너뜀(고시 — 행정규칙 API로 별도 확인)' });
    continue;
  }
  let cur;
  try { cur = (await findLaw(name, 'law'))[0]; } catch (e) { report.push({ law: name, 결과: '검색 실패: ' + e.message }); continue; }
  if (!cur) { report.push({ law: name, 결과: '현행 법령 못 찾음' }); continue; }
  const doc = await loadLaw(cur.법령일련번호, 'law');
  const arts = articlesOf(doc);
  const lawEff = ymd(doc.법령?.기본정보?.시행일자);

  // 시행 예정 버전(eflaw) 목록
  let future = [];
  try {
    future = (await findLaw(name, 'eflaw')).filter((x) => x.시행일자 > cur.시행일자);
  } catch (e) { report.push({ law: name, 결과: '시행예정 검색 실패: ' + e.message }); }

  for (const a of items) {
    const no = (a.no.match(/^제(\d+)조(의\d+)?/) || []);
    const key = no[1] + (no[2] || '');
    const art = arts[key];
    if (!art) { report.push({ id: a.id, 결과: `API에 ${a.no} 없음` }); continue; }
    const full = norm(art.text);
    const missing = a.text.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !full.includes(norm(l)));
    report.push({
      id: a.id, law: name, no: a.no,
      'laws.json 시행일': a.version, 'API 법령 시행일': lawEff, 'API 조문 시행일': ymd(art.eff),
      일치: missing.length === 0 ? '일치' : '불일치',
      ...(missing.length ? { '원문에 없는 줄': missing } : {}),
    });

    // 시행 예정 개정 확인
    for (const f of future) {
      const fdoc = await loadLaw(f.법령일련번호, 'eflaw', { efYd: f.시행일자 });
      const fa = articlesOf(fdoc)[key];
      if (!fa) continue;
      const changed = norm(fa.text) !== norm(art.text);
      if (!changed && !a.amended) continue;
      const entry = { id: a.id, '시행예정': ymd(f.시행일자), '조문 바뀜': changed };
      if (a.amended) {
        const miss = a.amended.text.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !norm(fa.text).includes(norm(l)));
        entry['laws.json amended'] = `${a.amended.effective} / ` + (miss.length ? '불일치' : '일치');
        if (miss.length) entry['원문에 없는 줄'] = miss;
      } else entry['laws.json'] = '시행예정 개정 미반영';
      if (changed) entry['예정 원문'] = fa.text;
      report.push(entry);
    }
  }
}

const out = path.join(root, 'eval', 'results', `lawcheck-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('\n저장:', out);
