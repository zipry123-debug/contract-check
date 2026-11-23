// 2026-11-23 21번 사용자 확정(5번): 처음 접속 서명 효과.
// <head>의 짧은 스크립트가 처음 방문(쿠키 cs_intro 없음)이면 html에 intro-on을 붙임 → 흰 화면에 서명이 그려짐(CSS 애니메이션)
// → 완성되면 홈 왼쪽 위 로고 자리로 이동 → 끝. 화면을 누르면 바로 끝. 한 번 보면 쿠키(1년)와 기기 저장소에 기록해 다시 안 나옴.
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('intro-on')) return;
  const remember = () => {
    try { document.cookie = 'cs_intro=1; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch {}
    try { localStorage.setItem('cs_intro', '1'); } catch {}
  };
  remember();
  const ov = document.getElementById('intro');
  if (!ov) { root.classList.remove('intro-on'); return; }
  const svg = ov.querySelector('svg');
  let done = false, t1 = 0, t2 = 0;
  const end = () => { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); root.classList.remove('intro-on'); ov.remove(); };
  ov.addEventListener('click', end);
  const fly = () => {
    if (done || ov.classList.contains('fly')) return;
    const mark = document.querySelector('#s-home.active .rd-mark .sig-logo, .screen.active .rd-mark .sig-logo');
    const b = mark && mark.getBoundingClientRect();
    if (!b || !b.width) { end(); return; }
    const a = svg.getBoundingClientRect();
    ov.classList.add('fly');
    svg.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})`;
    t2 = setTimeout(end, 650);
  };
  // 서명 그리기(CSS 애니메이션)가 끝나면 0.2초 뒤 이동. 스크립트가 늦게 불려 이미 끝났으면 바로 이동. 못 알아내면 1.65초 뒤.
  const pen = ov.querySelector('.pen');
  const anim = pen && pen.getAnimations ? pen.getAnimations()[0] : null;
  if (anim && anim.finished) anim.finished.then(() => { t1 = setTimeout(fly, 200); }, () => { t1 = setTimeout(fly, 200); });
  else t1 = setTimeout(fly, 1650);
})();
