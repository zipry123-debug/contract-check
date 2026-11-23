// 프리랜서 계약서 비교 — 서버
// POST /api/fl/extract : 계약서 1개(사진 1~3장)를 두 번 읽기(f2·f1) → 항목 사실 + 표준과 다름(코드) + 확인필요 표시. 하루 한도 1건.
// POST /api/fl/compare : 사용자가 확인·수정한 결과 2~3개를 나란히 비교(코드만, AI 호출 없음)
// 개인정보는 브라우저에서 가린 뒤 보내며, 서버는 사진을 저장하지 않는다.
import PROMPT_MAIN from '../../eval/prompts/f2.txt';
import PROMPT_CHECK from '../../eval/prompts/f1.txt';
import FL from '../public/freelance.json';
import { schemaFor, itemGuide, crossCheck, compare } from '../../eval/lib/freelance.js';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 3;
const TYPES = ['납품형', '권리형'];
const LABEL = { 납품형: '만들어 주고 돈 받는 계약', 권리형: '내 작품을 쓰게 하는 계약' };

const prompt = (tpl, type) => tpl.replaceAll('{{TYPE}}', type).replaceAll('{{TYPE_LABEL}}', LABEL[type]).replaceAll('{{ITEMS}}', itemGuide(type));

async function callGemini(env, model, text, images, type, timeoutMs) {
  const body = {
    contents: [{ parts: [
      ...images.map(([mime, data]) => ({ inline_data: { mime_type: mime, data }, mediaResolution: { level: 'MEDIA_RESOLUTION_ULTRA_HIGH' } })),
      { text },
    ] }],
    // 출력 상한 4096: 같은 말 반복으로 길어지는 응답을 빨리 끊음(정상 응답은 약 1,100토큰, 측정 2026-11-20)
    generationConfig: { responseMimeType: 'application/json', responseSchema: schemaFor(type), maxOutputTokens: 4096 },
  };
  const t0 = Date.now();
  const res = await fetch(`${GEMINI}/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message ?? `HTTP ${res.status}`); e.status = res.status; throw e; }
  const out = (data.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought && p.text).map(p => p.text).join('');
  return { result: JSON.parse(out), model, latencyMs: Date.now() - t0 }; // 잘린 응답은 JSON.parse에서 실패 → 다른 모델로 다시 읽음
}

async function extract(request, env, { json, checkQuota }) {
  if (!env.GEMINI_API_KEY) return json({ error: '서버에 API 키가 설정되지 않았어요.' }, 500);
  const { type, images } = await request.json().catch(() => ({}));
  if (!TYPES.includes(type)) return json({ error: '계약 유형이 올바르지 않아요.' }, 400);
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) return json({ error: `사진은 1~${MAX_IMAGES}장이어야 해요.` }, 400);
  const parts = [];
  for (const img of images) {
    const m = typeof img === 'string' && img.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) return json({ error: '사진 형식이 올바르지 않아요.' }, 400);
    if (m[2].length * 0.75 > MAX_IMAGE_BYTES) return json({ error: '사진이 너무 큽니다.' }, 413);
    parts.push([m[1], m[2]]);
  }

  // 사용자 결정(2026-11-20): 계약서 1개 = 분석 1건, 근로계약서 분석과 같은 하루 한도
  const why = await checkQuota(env, request.headers.get('cf-connecting-ip') ?? 'local');
  if (why) return json({ error: why }, 429);

  const readOnce = async tpl => {
    const text = prompt(tpl, type);
    try { return await callGemini(env, env.MODEL, text, parts, type, 40000); }
    catch (e1) { const r = await callGemini(env, env.FALLBACK_MODEL, text, parts, type, 50000); return { ...r, fallbackReason: String(e1.message).slice(0, 120) }; }
  };
  const t0 = Date.now();
  const [main, check] = await Promise.allSettled([readOnce(PROMPT_MAIN), readOnce(PROMPT_CHECK)]);
  const a = main.status === 'fulfilled' ? main.value : null, b = check.status === 'fulfilled' ? check.value : null;
  if (!a && !b) { console.log('AI 응답 실패:', String(main.reason?.message).slice(0, 200)); return json({ error: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502); } // AI 오류 원문은 서버 기록에만(2026-11-21)
  const result = (a ?? b).result;
  const cc = crossCheck(type, result, a && b ? b.result : null);
  return json({
    type, result, judged: cc.judged, flags: cc.flags,
    companyFlag: !!cc.companyFlag, typeFlag: !!cc.typeFlag,
    typeMismatch: result.type_guess !== type, // 사용자가 고른 유형과 AI 추정이 다름 → 화면에서 [그대로 비교]/[빼고 비교]
    reads: [a, b].filter(Boolean).length, models: [a?.model, b?.model].filter(Boolean), latencyMs: Date.now() - t0,
  });
}

function compareApi(body, { json }) {
  const { type, contracts } = body ?? {};
  if (!TYPES.includes(type)) return json({ error: '계약 유형이 올바르지 않아요.' }, 400);
  // 1개: 값 확인 화면에서 계약서 하나의 항목 요약을 다시 계산할 때 씀(AI 호출 없음)
  if (!Array.isArray(contracts) || contracts.length < 1 || contracts.length > 3) return json({ error: '계약서는 1~3개여야 해요.' }, 400);
  if (contracts.some(c => !c || typeof c.result !== 'object' || !c.result?.items)) return json({ error: '형식 오류' }, 400);
  return json(compare(FL, type, contracts));
}

export async function freelance(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return ctx.json({ error: '없는 주소이에요.' }, 404);
  if (url.pathname === '/api/fl/extract') return extract(request, env, ctx);
  if (url.pathname === '/api/fl/compare') {
    const text = await request.text();
    if (text.length > 200000) return ctx.json({ error: '요청이 너무 큽니다.' }, 413);
    let body; try { body = JSON.parse(text); } catch { return ctx.json({ error: '형식 오류' }, 400); }
    return compareApi(body, ctx);
  }
  return ctx.json({ error: '없는 주소이에요.' }, 404);
}
