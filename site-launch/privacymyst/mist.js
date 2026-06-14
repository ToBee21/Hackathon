/* PrivacyMyst - hero mist: layered chrome ribbons drifting like the icon's waves */
(function () {
  const canvas = document.getElementById('mist');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  function resize() {
    const host = canvas.parentElement;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = host.clientWidth; H = host.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // Three wave clusters (like the stacked waves in the app icon), each made of
  // several translucent silver ribbons for a smoky, layered look.
  const clusters = [0.34, 0.52, 0.70];
  const RIBBONS = 7;

  function ribbon(t, baseY, phase, amp, k, alpha, thick, hue) {
    ctx.beginPath();
    const segs = 48;
    const cx = W * 0.5;
    for (let i = 0; i <= segs; i++) {
      const x = (i / segs) * W;
      // amplitude tapers toward the edges so ribbons feel like a centered motif
      const edge = Math.sin((i / segs) * Math.PI);
      const y = baseY
        + Math.sin(x * k + t + phase) * amp * edge
        + Math.sin(x * k * 0.5 - t * 0.7 + phase) * amp * 0.4 * edge;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const grad = ctx.createLinearGradient(0, baseY - 50, 0, baseY + 50);
    grad.addColorStop(0, `hsla(${hue},18%,96%,0)`);
    grad.addColorStop(0.5, `hsla(${hue},16%,90%,${alpha})`);
    grad.addColorStop(1, `hsla(${hue},20%,70%,0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 16;
    ctx.shadowColor = `hsla(${hue},30%,80%,${alpha * 0.7})`;
    ctx.stroke();
  }

  let t = 0;
  let mouseX = 0.5, tx = 0.5;

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX / window.innerWidth;
  });

  function frame() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    mouseX += (tx - mouseX) * 0.04;
    const drift = (mouseX - 0.5) * 40;

    clusters.forEach((cy, ci) => {
      const baseY = H * cy;
      const hue = 250 - ci * 4; // faint cool/violet tint in the silver
      for (let r = 0; r < RIBBONS; r++) {
        const f = r / (RIBBONS - 1);
        const amp = 14 + f * 26 + ci * 4;
        const k = 0.0042 + f * 0.0016;
        const phase = ci * 1.7 + r * 0.55;
        const alpha = 0.05 + (1 - Math.abs(f - 0.5) * 2) * 0.10;
        const thick = 1 + f * 2.2;
        ribbon(t * 0.6, baseY + drift * (0.4 + ci * 0.3), phase, amp, k, alpha, thick, hue);
      }
    });

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    t += 0.012;
    if (!reduce) requestAnimationFrame(frame);
  }

  if (reduce) { frame(); } else { requestAnimationFrame(frame); }
})();
