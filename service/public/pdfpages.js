// 사이트 수정 7(2026-11-22): PDF 계약서 → 쪽마다 사진(JPEG)으로 바꿈.
// 바꾸는 일은 이 휴대폰(브라우저) 안에서만 하고, PDF 파일은 어디에도 보내지 않음. 바꾼 사진도 가린 뒤(또는 '개인정보 없음'으로 고른 뒤)에만 AI로 보냄(사진과 같은 흐름).
// PDF.js(Mozilla, Apache-2.0)는 PDF를 고를 때만 불러옴(처음 화면을 느리게 하지 않게).
// 2026-11-22: jsDelivr 대신 우리 사이트(vendor/pdfjs, 4.10.38 그대로)에서 불러옴 → 외부 서버가 막히거나 느려도 변환 가능
'use strict';
(() => {
  const BASE = new URL('vendor/pdfjs/', document.baseURI).href.replace(/\/$/, '');
  let lib = null;
  const load = async () => {
    if (lib) return lib;
    const m = await import(`${BASE}/build/pdf.min.mjs`); // 패키지의 legacy 빌드: 오래된 휴대폰 브라우저까지 지원
    m.GlobalWorkerOptions.workerSrc = `${BASE}/build/pdf.worker.min.mjs`;
    lib = m;
    return lib;
  };
  window.isPdf = f => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  // 앞에서부터 maxPages쪽까지, 긴 변 maxSide px(사진과 같은 기준)로 그려서 돌려줌: { blobs, total }
  window.pdfToImages = async (file, maxPages = 5, maxSide = 2048) => {
    const pdfjs = await load();
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: `${BASE}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${BASE}/standard_fonts/`,
      isEvalSupported: false,
    }).promise;
    try {
      const n = Math.min(doc.numPages, maxPages), blobs = [];
      for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i);
        const v1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(4, maxSide / Math.max(v1.width, v1.height)) });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); // PDF는 배경이 비어 있을 수 있어 흰 바탕부터(안 하면 JPEG가 검게 나옴)
        // intent 'print': 화면 갱신 신호(requestAnimationFrame) 없이 한 번에 그림 → 탭이 뒤로 가거나 절전 중이어도 멈추지 않음(2026-11-22 배포 확인 중 발견)
        await page.render({ canvasContext: x, viewport: vp, intent: 'print' }).promise;
        blobs.push(await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', 0.92)));
        page.cleanup();
      }
      return { blobs, total: doc.numPages };
    } finally { doc.destroy(); }
  };
})();
