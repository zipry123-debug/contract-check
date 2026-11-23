// 근로계약서 추출 결과를 정답과 비교해 보고서를 만든다.
// 사용: node evaluate-contract.js --run 계약1차 [--dir ../테스트사진-계약서]
// 사진 파일 이름이 조건: 합성_기울어짐.jpg → "합성/기울어짐", 폰_정면.jpg → "폰/정면"
import fs from 'node:fs';
import path from 'node:path';
import { EVAL_DIR, ROOT_DIR, parseArgs, listProducts, readJSON } from './lib/common.js';
import { FIELDS, NUMERIC, compareField } from './lib/contract.js';

const args = parseArgs();
if (!args.run) { console.error('사용법: node evaluate-contract.js --run 실행이름'); process.exit(1); }
const runDir = path.join(EVAL_DIR, 'results', args.run);
const photoDir = path.resolve(EVAL_DIR, args.dir ?? path.join(ROOT_DIR, '테스트사진-계약서'));
const products = listProducts(photoDir).filter(p => p.truth?.fields);
const combos = fs.readdirSync(runDir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_') && !d.name.includes('__cb')).map(d => d.name); // cb(체크 칸 전용)는 단독 채점 안 함

const condOf = img => { const m = img.replace(/\.[^.]+$/, '').match(/^(합성|폰)_(.+)$/); return m ? `${m[1]}/${m[2]}` : img; };
// '확인필요 표시' = 모델이 스스로 불확실하다고 알린 것 (status 확인필요 또는 confidence가 high가 아님)
const flaggedOf = o => o?.status === '확인필요' || (o?.confidence && o.confidence !== 'high');

const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
const quantile = (arr, q) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const fmt = v => (v === null || v === undefined ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/\|/g, '/').slice(0, 80);
const newAcc = () => ({ n: 0, ok: 0, wrong: 0, risky: 0, missing: 0, flagOnWrong: 0, flagOnOk: 0, statusOk: 0 });
function add(acc, r) {
  acc.n++; if (r.ok) acc.ok++; else if (r.predNull) acc.missing++; else acc.wrong++;
  if (!r.ok && !r.flagged && !r.predNull) acc.risky++;
  if (!r.ok && r.flagged) acc.flagOnWrong++; if (r.ok && r.flagged && !r.truthUnsure) acc.flagOnOk++; // 정답 자체가 확인필요(빈칸)면 표시가 맞음
  if (r.statusOk) acc.statusOk++;
}

const md = [`# 근로계약서 추출 평가 — ${args.run}`, '', `계약서 ${products.length}벌 / ${new Date().toLocaleString('ko-KR')}`, '',
  '- 정확도: 정답과 같은 값의 비율(항목 32개 × 사진). 긴 글(근무장소·업무내용·특약사항)은 글자 오류율 5% 이하면 맞음',
  '- 오답: 값을 냈는데 틀림 / 누락: null로 둠 / **위험 오답**: 틀렸는데 확인필요·낮은 확신도 표시도 없음(사용자가 그대로 믿게 되는 경우)',
  '- 확인필요 표시 = status "확인필요" 또는 confidence가 high가 아님. 틀린 값 중 표시 비율(높을수록 좋음) / 맞은 값 중 괜한 표시 비율(낮을수록 좋음)',
  '- 상태 일치: status(ok/확인필요/해당없음)가 정답과 같은 비율', ''];
const csv = ['combo,photo,condition,hand,field,truth,pred,ok,confidence,status,truth_status'];

for (const combo of combos) {
  const all = newAcc(), byField = {}, byCond = {}, byHand = {}, misreads = [], lat = [];
  let calls = 0, failed = 0;
  for (const p of products) {
    const dir = path.join(runDir, combo, p.id);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const img = file.replace(/\.json$/, ''), out = readJSON(path.join(dir, file)), cond = condOf(img);
      calls++; if (!out.ok) failed++; else lat.push(out.latencyMs);
      const pred = out.ok ? out.result : {};
      const hand = p.truth.contract_type.hand ? '손글씨' : '인쇄체';
      for (const f of FIELDS) {
        const t = p.truth.fields[f.name], o = pred[f.name];
        const pv = o?.value ?? null, predNull = pv === null || pv === '';
        const { ok } = compareField(f, t.value, pv);
        const r = { ok, predNull, flagged: flaggedOf(o), statusOk: o?.status === t.status, truthUnsure: t.status === '확인필요' };
        add(all, r);
        add(byField[f.name] ??= newAcc(), r); add(byCond[cond] ??= newAcc(), r); add(byHand[hand] ??= newAcc(), r);
        if (!ok && NUMERIC.has(f.name) && !predNull) misreads.push({ photo: `${p.id}/${cond}`, field: f.name, gt: t.value, pv, raw: o?.raw_text, conf: o?.confidence, st: o?.status });
        csv.push([combo, `${p.id}/${img}`, cond, hand, f.name, fmt(t.value), fmt(pv), ok, o?.confidence ?? '', o?.status ?? '', t.status].map(x => `"${String(x).replace(/"/g, '""')}"`).join(','));
      }
    }
  }
  const row = (name, a) => `| ${name} | ${a.n} | ${pct(a.ok, a.n)} | ${pct(a.wrong, a.n)} | ${pct(a.missing, a.n)} | **${pct(a.risky, a.n)}** | ${pct(a.flagOnWrong, a.n - a.ok)} | ${pct(a.flagOnOk, a.ok)} | ${pct(a.statusOk, a.n)} |`;
  const head = c => [`| ${c} | 칸 수 | 정확도 | 오답 | 누락 | 위험 오답 | 틀린 값 중 확인필요 표시 | 맞은 값 중 괜한 표시 | 상태 일치 |`, '|---|---|---|---|---|---|---|---|---|'];
  md.push(`## ${combo}`, '', `호출 ${calls}건, 실패 ${failed}건, 응답 중앙값 ${((quantile(lat, 0.5) ?? 0) / 1000).toFixed(1)}초 / 90% ${((quantile(lat, 0.9) ?? 0) / 1000).toFixed(1)}초`, '',
    ...head('전체'), row('전체', all), '',
    '### 촬영 조건별', '', ...head('조건'), ...Object.entries(byCond).sort().map(([k, a]) => row(k, a)), '',
    '### 인쇄체 / 손글씨', '', ...head('글씨'), ...Object.entries(byHand).map(([k, a]) => row(k, a)), '',
    '### 항목별 (정확도 낮은 순)', '', ...head('항목'), ...Object.entries(byField).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([k, a]) => row(k, a)), '',
    `### 숫자(금액·시간·날짜) 오독 사례 ${misreads.length}건`, '', '| 사진 | 항목 | 정답 | 출력 | 원문 | 확신도 | 상태 |', '|---|---|---|---|---|---|---|',
    ...misreads.map(m => `| ${m.photo} | ${m.field} | ${fmt(m.gt)} | ${fmt(m.pv)} | ${fmt(m.raw)} | ${m.conf ?? ''} | ${m.st ?? ''} |`), '');
}
fs.writeFileSync(path.join(runDir, 'report.md'), md.join('\n'), 'utf8');
fs.writeFileSync(path.join(runDir, 'details.csv'), '﻿' + csv.join('\n'), 'utf8');
console.log(md.join('\n').split('### 항목별')[0]);
console.log(`보고서: ${path.join(runDir, 'report.md')} / 항목별 전체: details.csv`);
