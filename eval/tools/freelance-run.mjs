// 프리랜서 계약서 읽기 측정: 샘플(테스트사진-프리랜서/*/원본.png)을 f2·f1 두 프롬프트로 읽고 정답.json과 비교, 비용 계산.
// 사용: node tools/freelance-run.mjs --run 이름 [--only D1,W2] [--model gemini-3.1-flash-lite]
// API 키는 service/.dev.vars 에서 읽고 절대 출력하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaFor, itemGuide, judgeItems, crossCheck, KEY_NUMBERS, ITEMS } from '../lib/freelance.js';

const EVAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(EVAL, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const RUN = args.run ?? `freelance-${Date.now()}`;
const MODEL = args.model ?? 'gemini-3.1-flash-lite';
// 공식 단가(100만 토큰당 USD, 유료 표준). 출처: ai.google.dev 가격표(결과보고서 6절, 2026-11-18 확인). 생각 토큰은 출력 단가.
const PRICE = { 'gemini-3.1-flash-lite': [0.25, 1.5], 'gemini-3.5-flash-lite': [0.3, 2.5] }[MODEL];
const LABEL = { 납품형: '만들어 주고 돈 받는 계약', 권리형: '내 작품을 쓰게 하는 계약' };

const key = fs.readFileSync(path.join(ROOT, 'service', '.dev.vars'), 'utf8').match(/^GEMINI_API_KEY\s*=\s*"?([^"\r\n]+)/m)?.[1];
if (!key) { console.error('GEMINI_API_KEY 없음'); process.exit(1); }

const PHOTO = args.photo ? path.resolve(ROOT, args.photo) : path.join(ROOT, '테스트사진-프리랜서'); // --photo 테스트사진-프리랜서-합성
const OUT = path.join(EVAL, 'results', RUN);
fs.mkdirSync(OUT, { recursive: true });

const prompt = (name, type) => fs.readFileSync(path.join(EVAL, 'prompts', `${name}.txt`), 'utf8')
  .replaceAll('{{TYPE}}', type).replaceAll('{{TYPE_LABEL}}', LABEL[type]).replaceAll('{{ITEMS}}', itemGuide(type));

async function read(name, type, images) {
  const body = {
    contents: [{ parts: [
      ...images.map(im => ({ inline_data: { mime_type: im.mime, data: im.b64 }, mediaResolution: { level: 'MEDIA_RESOLUTION_ULTRA_HIGH' } })),
      { text: prompt(name, type) },
    ] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schemaFor(type), maxOutputTokens: 4096 },
  };
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) { await new Promise(r => setTimeout(r, 5000 * attempt)); continue; }
      throw new Error(`${name} HTTP ${res.status}: ${String(data.error?.message).slice(0, 200)}`);
    }
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought && p.text).map(p => p.text).join('');
    const u = data.usageMetadata ?? {};
    const inTok = u.promptTokenCount ?? 0, outTok = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    const usd = (inTok * PRICE[0] + outTok * PRICE[1]) / 1e6;
    let result;
    try { result = JSON.parse(text); }
    catch { // 같은 말 반복 등으로 응답이 잘림 → 비용은 세고 한 번 더 읽음(서비스도 같은 방식으로 처리할 것)
      tot.usd += usd; tot.inTok += inTok; tot.outTok += outTok; tot.calls++; tot.broken++;
      fs.writeFileSync(path.join(OUT, `_broken_${name}_${Date.now()}.txt`), text);
      console.error(`  ${name}: 응답 잘림(finish ${data.candidates?.[0]?.finishReason}, 출력 ${outTok}토큰) → 다시 읽기`);
      if (attempt < 3) continue;
      throw new Error(`${name} 응답 잘림 3회`);
    }
    return { result, latencyMs: Date.now() - t0, inTok, outTok, usd };
  }
}

const norm = v => (typeof v === 'string' ? v.replace(/\s+/g, '') : v ?? null);
const ids = (args.only?.split(',') ?? fs.readdirSync(PHOTO)).filter(d => fs.existsSync(path.join(PHOTO, d, '정답.json')));
var tot = { broken: 0, items: 0, present: 0, diffN: 0, diff: 0, numN: 0, num: 0, company: 0, type: 0, wrongFlagged: 0, wrongSilent: 0, flaggedItems: 0, usd: 0, inTok: 0, outTok: 0, calls: 0 };
const lines = [];

for (const id of ids) {
  const truth = JSON.parse(fs.readFileSync(path.join(PHOTO, id, '정답.json'), 'utf8'));
  const type = truth.type; // 사용자가 정답 유형을 골랐다고 가정
  const imgs = fs.readdirSync(path.join(PHOTO, id)).filter(f => /\.(png|jpe?g)$/i.test(f)).map(f => ({ b64: fs.readFileSync(path.join(PHOTO, id, f)).toString('base64'), mime: /\.png$/i.test(f) ? 'image/png' : 'image/jpeg' }));
  const [a, b] = await Promise.all([read('f2', type, imgs), read('f1', type, imgs)]);
  fs.writeFileSync(path.join(OUT, `${id}__f2.json`), JSON.stringify(a, null, 2));
  fs.writeFileSync(path.join(OUT, `${id}__f1.json`), JSON.stringify(b, null, 2));
  for (const r of [a, b]) { tot.usd += r.usd; tot.inTok += r.inTok; tot.outTok += r.outTok; tot.calls++; }

  const cc = crossCheck(type, a.result, b.result);
  const j = cc.judged;
  const errs = [];
  for (const [iid] of ITEMS[type]) {
    const t = truth.items[iid], g = j[iid];
    tot.items++;
    const bad = [];
    if (g.present === t.present) tot.present++; else bad.push(`있음/없음(정답 ${t.present ? '있음' : '없음'})`);
    if (t.present && t.diff !== null) { tot.diffN++; if (g.diff === t.diff) tot.diff++; else bad.push(`표준과 다름(정답 ${t.diff ? '다름' : '같음'})`); }
    for (const [item, k, tk] of KEY_NUMBERS[type]) {
      if (item !== iid || !t.present) continue;
      let tv = t.value?.[tk] ?? null; if (tk === 'included' && typeof tv === 'string') tv = null; // '제한 없음'
      const gv = a.result.items?.[iid]?.[k] ?? null;
      tot.numN++; if (norm(gv) === norm(tv)) tot.num++; else bad.push(`${k}: ${gv} (정답 ${tv})`);
    }
    if (cc.flags[iid]) tot.flaggedItems++;
    if (bad.length) { cc.flags[iid] ? tot.wrongFlagged++ : tot.wrongSilent++; errs.push(`  ${iid}: ${bad.join(', ')}${cc.flags[iid] ? ` [확인필요: ${cc.flags[iid].join('·')}]` : ' [표시 없음]'}`); }
  }
  const compOk = norm(a.result.company) === norm(truth.company); if (compOk) tot.company++;
  const typeOk = a.result.type_guess === truth.type; if (typeOk) tot.type++;
  lines.push(`${id} 회사 ${a.result.company}${compOk ? '' : ` ✗(정답 ${truth.company})`} / 유형 ${a.result.type_guess}${typeOk ? '' : ` ✗(정답 ${truth.type})`} — ${a.result.type_reason ?? ''}`);
  lines.push(...errs);
  const flaggedOk = Object.keys(cc.flags).filter(k => !errs.some(e => e.startsWith(`  ${k}:`)));
  if (flaggedOk.length) lines.push(`  (맞았지만 확인필요 표시: ${flaggedOk.map(k => `${k}[${cc.flags[k].join('·')}]`).join(', ')})`);
  lines.push(`  시간 f2 ${(a.latencyMs / 1000).toFixed(1)}초 / f1 ${(b.latencyMs / 1000).toFixed(1)}초, 비용 $${(a.usd + b.usd).toFixed(5)}`);
}

const p = (x, n) => `${x}/${n} (${n ? (100 * x / n).toFixed(1) : '-'}%)`;
const summary = [
  `실행 ${RUN}, 모델 ${MODEL}, 계약서 ${ids.length}개, 호출 ${tot.calls}건`,
  `있음/없음 ${p(tot.present, tot.items)}`,
  `표준과 다름 ${p(tot.diff, tot.diffN)}`,
  `핵심 숫자 ${p(tot.num, tot.numN)}`,
  `회사 이름 ${p(tot.company, ids.length)}, 유형 ${p(tot.type, ids.length)}`,
  `틀린 항목 중 확인필요 표시됨 ${tot.wrongFlagged}, 표시 없이 틀림 ${tot.wrongSilent} / 확인필요 표시 항목 수 ${tot.flaggedItems}/${tot.items}`,
  `응답 잘림(다시 읽음) ${tot.broken}건`,
  `비용 $${tot.usd.toFixed(5)} (입력 ${tot.inTok}·출력 ${tot.outTok} 토큰), 계약서 1개(두 번 읽기)당 평균 $${(tot.usd / ids.length).toFixed(5)}`,
];
const report = [...summary, '', ...lines].join('\n');
fs.writeFileSync(path.join(OUT, '_report.txt'), report);
console.log(report);
