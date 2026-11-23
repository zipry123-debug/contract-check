// 같은 실행(run)의 c2·c1 결과를 서비스와 똑같이 합쳐(crossCheck: 두 번 읽기 비교 + 규칙 검사) 새 조합으로 저장한다.
// 저장 위치: results/{run}/{모델}__c2+c1교차__{보정}/  → evaluate-contract.js가 다른 조합과 함께 채점
// 사용: node tools/make-crosscheck.mjs --run 계약2차
import fs from 'node:fs';
import path from 'node:path';
import { EVAL_DIR, parseArgs, readJSON, writeJSON } from '../lib/common.js';
import { crossCheck } from '../lib/crosscheck.js';

const args = parseArgs();
const runDir = path.join(EVAL_DIR, 'results', args.run);
const combos = fs.readdirSync(runDir).filter(d => d.includes('__c2__'));
for (const main of combos) {
  const check = main.replace('__c2__', '__c1__');
  if (!fs.existsSync(path.join(runDir, check))) continue;
  const out = main.replace('__c2__', '__c2+c1교차__');
  let n = 0;
  for (const id of fs.readdirSync(path.join(runDir, main))) {
    for (const f of fs.readdirSync(path.join(runDir, main, id))) {
      const a = readJSON(path.join(runDir, main, id, f));
      const bf = path.join(runDir, check, id, f);
      const b = fs.existsSync(bf) ? readJSON(bf) : null;
      const A = a.ok ? a.result : null, B = b?.ok ? b.result : null;
      if (!A && !B) { writeJSON(path.join(runDir, out, id, f), { ok: false, error: '두 호출 모두 실패' }); continue; }
      writeJSON(path.join(runDir, out, id, f), {
        ok: true, result: crossCheck(A ?? B, A && B ? B : null),
        latencyMs: Math.max(a.latencyMs ?? 0, b?.latencyMs ?? 0), // 동시에 보내므로 느린 쪽 시간
      });
      // 체크 칸 전용 다시 읽기(cb1)가 있으면 그것까지 합친 조합도 저장
      const cf = path.join(runDir, main.replace('__c2__', '__cb1__'), id, f);
      const cbr = fs.existsSync(cf) ? readJSON(cf) : null;
      if (cbr) writeJSON(path.join(runDir, main.replace('__c2__', '__c2+c1+cb1교차__'), id, f), {
        ok: true, result: crossCheck(A ?? B, A && B ? B : null, cbr.ok ? cbr.result : null),
        latencyMs: Math.max(a.latencyMs ?? 0, b?.latencyMs ?? 0, cbr.latencyMs ?? 0),
      });
      n++;
    }
  }
  console.log(`${out}: ${n}장`);
}
