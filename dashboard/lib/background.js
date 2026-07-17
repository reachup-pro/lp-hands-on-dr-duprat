// background.js — fundo interativo (constelacao de particulas + brilho no cursor)
// Padrao noir+lilas, leve e performatico. Respeita prefers-reduced-motion.
(function () {
  'use strict';
  const canvas = document.getElementById('bg-canvas');
  const spot = document.querySelector('.bg-spotlight');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LILAC = '244,187,66';
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  let particles = [];
  const mouse = { x: -9999, y: -9999, active: false };
  let raf = null;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const target = Math.min(150, Math.floor(W * H / 11000));
    particles = Array.from({ length: target }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.6 + 0.6
    }));
  }

  function step() {
    ctx.clearRect(0, 0, W, H);
    const linkDist = 128, mouseDist = 170;

    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;

      // interacao com o mouse: leve repulsao
      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < mouseDist * mouseDist && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = (mouseDist - d) / mouseDist * 0.6;
          p.x += (dx / d) * f; p.y += (dy / d) * f;
        }
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${LILAC},0.55)`;
      ctx.fill();
    }

    // linhas entre particulas proximas
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const al = (1 - Math.sqrt(d2) / linkDist) * 0.16;
          ctx.strokeStyle = `rgba(${LILAC},${al.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // linhas ate o cursor (destaque)
      if (mouse.active) {
        const dx = a.x - mouse.x, dy = a.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < mouseDist * mouseDist) {
          const al = (1 - Math.sqrt(d2) / mouseDist) * 0.30;
          ctx.strokeStyle = `rgba(${LILAC},${al.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(step);
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${LILAC},0.4)`; ctx.fill();
    }
  }

  function onMove(x, y) {
    mouse.x = x; mouse.y = y; mouse.active = true;
    if (spot) { spot.style.setProperty('--mx', x + 'px'); spot.style.setProperty('--my', y + 'px'); spot.style.opacity = '1'; }
  }
  window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  window.addEventListener('mouseleave', () => { mouse.active = false; if (spot) spot.style.opacity = '0'; });

  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduce) drawStatic(); }, 150); });

  function start() { if (!raf && !reduce) raf = requestAnimationFrame(step); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

  resize();
  if (reduce) drawStatic(); else start();
})();
