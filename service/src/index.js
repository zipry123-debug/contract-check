// 근로계약서 점검 서비스 — 서버(Cloudflare Worker)
// 역할: Gemini API 키 보관, 사진 → 항목 추출 중계, 하루 사용량 상한.
// 지어내기 잡기: 같은 사진을 두 프롬프트(c2·c1)로 동시에 읽어 값이 다르면 '확인필요' + 규칙 검사.
// 개인정보는 브라우저에서 가린 뒤 보내며, 서버는 사진을 저장하지 않는다.
import PROMPT_MAIN from '../../eval/prompts/c2.txt';
import PROMPT_CHECK from '../../eval/prompts/c1.txt';
import { CONTRACT_SCHEMA, FIELDS } from '../../eval/lib/contract.js';
import { crossCheck } from '../../eval/lib/crosscheck.js';
import { judge, HELP } from '../../eval/lib/legal.js';
import { ask } from './ask.js';
import { comm } from './comm.js';
import { freelance } from './freelance.js';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 브라우저에서 2048px JPEG로 줄여 보내므로 보통 1MB 이하
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// 한국 날짜 (하루 상한 기준)
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
}

/** 하루 상한 확인 후 1 증가. 기록은 D1 usage 표(2026-11-21 KV에서 옮김: KV는 같은 키 1초 1회·무료 하루 쓰기 1,000회 제한 → 동시 사용 시 오류)
 *  기록이 실패해도 분석은 막지 않음(비용은 Google 예산 알림이 2차 안전장치).
 *  2026-11-23 보안 점검: '읽고 비교한 뒤 따로 올리기'는 동시 요청이 한꺼번에 통과할 수 있었음 →
 *  '상한 미만일 때만 1 올리고 그 값을 받는' 한 문장으로 바꿈(값이 안 오면 상한 도달). 동시에 보내도 상한을 넘지 않음
 *  kind: 'extract'(계약서 분석) | 'ask'(AI 질문) — 상한을 따로 센다 */
const USAGE_TTL_MS = 48 * 3600e3;
async function checkQuota(env, ip, kind = 'extract') {
  try {
    const day = kstDay();
    const p = kind === 'ask' ? 'ask-' : '';
    const [dayLimit, ipLimit] = kind === 'ask' ? [env.ASK_DAILY_LIMIT, env.ASK_PER_IP_LIMIT] : [env.DAILY_LIMIT, env.PER_IP_LIMIT];
    const allKey = `${p}all:${day}`, ipKey = `${p}ip:${day}:${await sha256(`${env.IP_SALT ?? ''}:${ip}`)}`; // 접속 주소는 서버 비밀 값을 섞은 해시로만 저장(48시간 뒤 삭제)
    const exp = Date.now() + USAGE_TTL_MS;
    const take = (k, limit) => env.DB.prepare('INSERT INTO usage (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 WHERE n < ? RETURNING n')
      .bind(k, exp, +limit).first();
    if (!(await take(ipKey, ipLimit))) return '오늘 이 기기의 사용 횟수를 넘었어요. 내일 다시 시도해 주세요.';
    if (!(await take(allKey, dayLimit))) {
      await env.DB.prepare('UPDATE usage SET n = MAX(n - 1, 0) WHERE k = ?').bind(ipKey).run(); // 전체 상한에 걸리면 이 기기 몫은 되돌림
      return '오늘 서비스 사용량이 다 찼어요. 내일 다시 시도해 주세요.';
    }
  } catch (e) { console.log('usage 기록 실패(분석은 계속):', String(e?.message ?? e).slice(0, 120)); }
  return null;
}
/** 48시간 지난 사용량 기록 삭제(하루 한 번 cron) */
async function cleanUsage(env) { await env.DB.prepare('DELETE FROM usage WHERE exp < ?').bind(Date.now()).run(); }

// 2026-11-22: 여러 장(한 계약서의 연속된 쪽)을 한 번에. 한 장이면 예전과 똑같은 요청(정확도 검증 조건 그대로)
const MULTI_NOTE = n => `\n\n[참고] 위 사진 ${n}장은 한 근로계약서의 연속된 쪽입니다(1쪽부터 순서대로). 모든 쪽을 함께 읽어 항목을 채우고, 같은 항목이 여러 쪽에 있으면 계약 내용(특약 포함)에 맞게 판단하세요.`;
async function callGemini(env, model, prompt, imgs, timeoutMs) {
  const body = {
    contents: [{ parts: [
      ...imgs.map(({ b64, mime }) => ({ inline_data: { mime_type: mime, data: b64 }, mediaResolution: { level: 'MEDIA_RESOLUTION_ULTRA_HIGH' } })),
      { text: imgs.length > 1 ? prompt + MULTI_NOTE(imgs.length) : prompt },
    ] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: CONTRACT_SCHEMA, maxOutputTokens: 8192 },
  };
  const t0 = Date.now();
  const res = await fetch(`${GEMINI}/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message ?? `HTTP ${res.status}`); e.status = res.status; throw e; }
  const text = (data.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought && p.text).map(p => p.text).join('');
  return { result: JSON.parse(text), model, latencyMs: Date.now() - t0 };
}

async function extract(request, env) {
  if (!env.GEMINI_API_KEY) return json({ error: '서버에 API 키가 설정되지 않았어요.' }, 500);
  const body = await request.json().catch(() => ({}));
  // images(1~3장, 2026-11-22) 또는 예전 image(1장)
  const list = Array.isArray(body.images) ? body.images : [body.image];
  if (list.length < 1 || list.length > 3) return json({ error: '사진은 1~3장이어야 해요.' }, 400);
  const imgs = [];
  for (const image of list) {
    const m = typeof image === 'string' && image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) return json({ error: '사진 형식이 올바르지 않아요.' }, 400);
    if (m[2].length * 0.75 > MAX_IMAGE_BYTES) return json({ error: '사진이 너무 큽니다.' }, 413);
    imgs.push({ mime: m[1], b64: m[2] });
  }

  const why = await checkQuota(env, request.headers.get('cf-connecting-ip') ?? 'local');
  if (why) return json({ error: why }, 429);

  // 한 번 읽기: 기본 모델이 느리거나(무료 등급 혼잡) 실패하면 다른 모델로 한 번 더
  const readOnce = async prompt => {
    try { return await callGemini(env, env.MODEL, prompt, imgs, 30000 + (imgs.length - 1) * 10000); }
    catch (e1) { const r = await callGemini(env, env.FALLBACK_MODEL, prompt, imgs, 40000 + (imgs.length - 1) * 10000); return { ...r, fallbackReason: String(e1.message).slice(0, 120) }; }
  };
  const t0 = Date.now();
  const [main, check] = await Promise.allSettled([readOnce(PROMPT_MAIN), readOnce(PROMPT_CHECK)]);
  const a = main.status === 'fulfilled' ? main.value : null, b = check.status === 'fulfilled' ? check.value : null;
  if (!a && !b) { console.log('AI 응답 실패:', String(main.reason?.message).slice(0, 200)); return json({ error: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502); } // AI 오류 원문은 서버 기록에만(2026-11-21)
  // 두 결과 비교 + 규칙 검사(한쪽만 왔으면 그쪽 결과 + 규칙 검사만)
  const result = crossCheck((a ?? b).result, a && b ? b.result : null);
  // 4단계: 법 기준 비교(코드 계산)
  const findings = judge(result);
  const schema = FIELDS.map(({ name, type, options }) => ({ name, type, options }));
  return json({ result, findings, help: HELP, schema, pages: imgs.length, reads: [a, b].filter(Boolean).length, models: [a?.model, b?.model].filter(Boolean), latencyMs: Date.now() - t0 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // AI를 부르는 요청은 이 서비스 화면에서 온 것만 받음(다른 사이트·프로그램에서 서버로 바로 보내 가리기 화면을 건너뛰는 흔한 경로 차단).
    // 브라우저는 POST에 Origin을 붙임. 작정하고 꾸미면 뚫릴 수 있어 완전한 차단은 아님 → 소개서 한계에 기재(2026-11-21, 사용자 결정)
    const AI_PATHS = ['/api/extract', '/api/ask', '/api/fl/extract'];
    if (request.method === 'POST' && AI_PATHS.includes(url.pathname) && request.headers.get('origin') !== url.origin)
      return json({ error: '이 서비스 화면에서만 이용할 수 있어요.' }, 403);
    // 커뮤니티 쓰기(글·댓글·공감·신고·수정·삭제)도 이 서비스 화면에서 온 것만(2026-11-23 보안 점검).
    // 다른 사이트에 숨긴 코드가 방문자 브라우저로 신고 3번을 보내 남의 글을 숨기는 경로를 막음.
    // content-type이 application/json이 아니면 거절 → 다른 사이트에서 보내려면 브라우저 사전 확인(CORS)을 거쳐야 해서 막힘
    if (request.method === 'POST' && url.pathname.startsWith('/api/comm/') &&
        (request.headers.get('origin') !== url.origin || !(request.headers.get('content-type') ?? '').startsWith('application/json')))
      return json({ error: '이 서비스 화면에서만 이용할 수 있어요.' }, 403);
    if (url.pathname === '/api/extract' && request.method === 'POST') return extract(request, env);
    if (url.pathname === '/api/ask' && request.method === 'POST') return ask(request, env, { json, checkQuota });
    if (url.pathname.startsWith('/api/comm/')) return comm(request, env, { json });
    if (url.pathname.startsWith('/api/fl/')) return freelance(request, env, { json, checkQuota });
    // 사용자가 결과를 고친 뒤 판정만 다시 계산(AI 호출 없음)
    if (url.pathname === '/api/judge' && request.method === 'POST') {
      const text = await request.text();
      if (text.length > 100000) return json({ error: '요청이 너무 큽니다.' }, 413);
      let body; try { body = JSON.parse(text); } catch { return json({ error: '형식 오류' }, 400); }
      if (!body?.result || typeof body.result !== 'object') return json({ error: '형식 오류' }, 400);
      return json({ findings: judge(body.result), help: HELP });
    }
    if (url.pathname === '/api/health') return json({ ok: true, model: env.MODEL, hasKey: !!env.GEMINI_API_KEY });
    return json({ error: '없는 주소이에요.' }, 404);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(cleanUsage(env)); },
};
