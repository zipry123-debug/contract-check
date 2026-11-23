// 사진 품질 검사(반사·흐림·어두움). 브라우저와 노트북(기준값 잡기)에서 같은 식을 쓴다.
// 입력: 회색조 픽셀 배열(0~255), 가로·세로. 긴 변 512px로 줄인 사진을 넣는다.
//
// 기준값(2026-11-18, 테스트 사진 109장: 합성 80장 + 화면을 찍은 폰 사진 29장)
// - 반사(hot): 가장 밝은 32px 칸 평균 − 칸 평균의 중앙값. 폰 반사·사선 83~105 / 폰 정면·기울어짐 29~57 / 합성 0~22 → 70 초과면 경고
//   (반사·사선 사진은 인식 정확도가 92%·86%로 가장 낮았던 조건)
// - 흐림(sharp): 가장 선명한 2% 가장자리 세기 ÷ 대비. 사진 출처마다 범위가 달라(폰 0.35~0.76, 합성 0.73~2.36) 기준을 잡기 어려움
//   → 아주 흐린 경우만(0.30 미만) 경고. 실제 종이 사진으로 다시 확인 필요
// - 어두움(mean): 어두운 합성 사진(평균 97)도 정확도 98%라 거의 영향 없음 → 아주 어두울 때만(60 미만) 경고
(function (root) {
  const LIMITS = { hot: 70, sharp: 0.30, dark: 60 };

  function qualityMetrics(g, w, h) {
    let sum = 0;
    for (let i = 0; i < g.length; i++) sum += g[i];
    const mean = sum / g.length;
    const s = Uint8Array.from(g).sort();
    const pct = q => s[Math.floor(q * (s.length - 1))];
    const range = Math.max(20, pct(0.98) - pct(0.02));
    // 흐림: 라플라시안 세기 상위 2% 평균 ÷ 대비
    const lap = new Uint16Array((w - 2) * (h - 2));
    let k = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      lap[k++] = Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
    }
    lap.sort();
    const n = Math.max(1, Math.floor(lap.length * 0.02));
    let top = 0;
    for (let i = lap.length - n; i < lap.length; i++) top += lap[i];
    const sharp = top / n / range;
    // 반사: 32px 칸 평균 밝기 중 최댓값 − 중앙값
    const B = 32, bw = Math.floor(w / B), bh = Math.floor(h / B), blocks = [];
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let t = 0;
      for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) t += g[y * w + x];
      blocks.push(t / (B * B));
    }
    blocks.sort((a, b) => a - b);
    const hot = blocks.length ? blocks[blocks.length - 1] - blocks[Math.floor(blocks.length / 2)] : 0;
    return { mean, sharp, hot };
  }

  function judgeQuality(m, L = LIMITS) {
    const issues = [];
    if (m.hot > L.hot) issues.push('빛 반사가 있는 것 같아요. 조명이 계약서에 비치지 않도록 각도를 바꿔 찍어 주세요.');
    if (m.sharp < L.sharp) issues.push('사진이 흐린 것 같아요. 휴대폰을 고정하고 화면을 눌러 초점을 맞춘 뒤 찍어 주세요.');
    if (m.mean < L.dark) issues.push('사진이 어두워요. 밝은 곳에서 찍어 주세요.');
    return issues;
  }

  root.Quality = { qualityMetrics, judgeQuality, LIMITS };
})(typeof window !== 'undefined' ? window : globalThis);
