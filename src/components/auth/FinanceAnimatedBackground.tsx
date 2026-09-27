import React, { useEffect, useRef } from 'react';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const FinanceAnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let last = performance.now();
    let elapsed = 0;
    let mouseX = 0;
    let mouseY = 0;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    type Particle = { x: number; y: number; z: number; size: number; speed: number; phase: number };
    let particles: Particle[] = [];

    const buildParticles = () => {
      const mobile = width < 700;
      const count = reduceMotion ? 12 : mobile ? 24 : 54;
      particles = Array.from({ length: count }, (_, i) => ({
        x: Math.random(), y: Math.random(), z: 0.35 + Math.random() * 0.9,
        size: 0.7 + Math.random() * 1.8, speed: 0.006 + Math.random() * 0.018,
        phase: i * 0.71 + Math.random() * 4,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    };

    const drawGlow = (x: number, y: number, radius: number, color: string, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, color.replace('ALPHA', String(alpha)));
      g.addColorStop(1, color.replace('ALPHA', '0'));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    };

    const drawGlobe = (t: number) => {
      if (width < 640) return;
      const r = clamp(Math.min(width, height) * 0.22, 105, 235);
      const cx = width * (width > 1100 ? 0.78 : 0.82) + mouseX * 5;
      const cy = height * 0.44 + mouseY * 3;
      drawGlow(cx, cy, r * 1.85, 'rgba(20,120,255,ALPHA)', 0.15);
      drawGlow(cx + r * 0.35, cy - r * 0.18, r * 1.1, 'rgba(0,217,255,ALPHA)', 0.12);

      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(-0.13);
      ctx.strokeStyle = 'rgba(40,170,255,.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      const rotation = reduceMotion ? 0.2 : (t / 32000) * Math.PI * 2;
      for (let i = -3; i <= 3; i++) {
        const yy = (i / 4) * r * 0.82;
        const rx = Math.sqrt(Math.max(0, r * r - yy * yy));
        ctx.beginPath(); ctx.ellipse(0, yy, rx, r * 0.13, 0, 0, Math.PI * 2);
        ctx.strokeStyle = i === 0 ? 'rgba(0,217,255,.3)' : 'rgba(37,99,235,.2)'; ctx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI + rotation;
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(8, Math.abs(Math.cos(a)) * r), r, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,201,183,.14)'; ctx.stroke();
      }

      const nodes = [[-0.56,-0.18],[-0.28,-0.56],[0.07,-0.42],[0.48,-0.2],[0.58,0.24],[0.2,0.5],[-0.38,0.44],[-0.67,0.18],[0.12,0.05]];
      nodes.forEach(([nx, ny], index) => {
        const pulse = 1 + Math.sin(t * 0.002 + index) * 0.35;
        ctx.fillStyle = index % 4 === 0 ? 'rgba(245,158,11,.9)' : 'rgba(0,217,255,.9)';
        ctx.beginPath(); ctx.arc(nx * r, ny * r, 2.2 * pulse, 0, Math.PI * 2); ctx.fill();
      });

      const arcs: [number, number, number, number, boolean][] = [[-0.56,-0.18,0.48,-0.2,false],[-0.28,-0.56,0.58,0.24,true],[-0.67,0.18,0.2,0.5,false],[0.07,-0.42,-0.38,0.44,false]];
      arcs.forEach(([x1, y1, x2, y2, warm], i) => {
        const sx = x1 * r, sy = y1 * r, ex = x2 * r, ey = y2 * r;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 - r * (0.42 + i * 0.03), ex, ey);
        ctx.strokeStyle = warm ? 'rgba(245,158,11,.34)' : 'rgba(0,217,255,.32)'; ctx.lineWidth = 1.15; ctx.stroke();
      });
      ctx.restore();
    };

    const drawParticles = (t: number) => {
      particles.forEach((p, index) => {
        const drift = Math.sin(t * p.speed * 0.08 + p.phase) * 12 * p.z;
        const x = (p.x * width + drift + mouseX * 5 * p.z + width) % width;
        const y = (p.y * height + Math.cos(t * p.speed * 0.05 + p.phase) * 8 + mouseY * 4 * p.z + height) % height;
        const alpha = 0.16 + 0.42 * p.z;
        ctx.fillStyle = index % 11 === 0 ? `rgba(245,158,11,${alpha * 0.8})` : `rgba(90,210,255,${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, p.size * p.z, 0, Math.PI * 2); ctx.fill();
      });
    };

    const drawMarketChart = (t: number) => {
      if (height < 500) return;
      const baseY = height * 0.70;
      ctx.save(); ctx.globalAlpha = width < 700 ? 0.22 : 0.38;
      ctx.strokeStyle = 'rgba(0,217,255,.6)'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 18) {
        const phase = x * 0.015 + t * 0.00028;
        const y = baseY + Math.sin(phase) * 18 + Math.sin(phase * 0.43 + 1.6) * 34 - (x / Math.max(width, 1)) * 18;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.shadowColor = '#00d9ff'; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore();
    };

    const drawWaves = (t: number) => {
      const mobile = width < 700;
      const rows = mobile ? 3 : 5;
      const colors = ['rgba(0,217,255,.19)','rgba(37,99,235,.18)','rgba(124,92,252,.16)','rgba(0,201,183,.14)','rgba(20,120,255,.12)'];
      for (let row = 0; row < rows; row++) {
        ctx.beginPath();
        for (let x = -30; x <= width + 30; x += mobile ? 34 : 24) {
          const y = height * 0.73 + row * 22 + Math.sin(x * 0.012 + t * (0.00022 + row * 0.000018) + row) * (16 + row * 3);
          if (x === -30) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors[row]; ctx.lineWidth = 1; ctx.stroke();
      }
    };

    const drawCandles = (t: number) => {
      if (width < 800) return;
      const startX = width * 0.05, baseY = height * 0.36;
      ctx.save(); ctx.globalAlpha = 0.17;
      for (let i = 0; i < 18; i++) {
        const x = startX + i * 18;
        const h = 13 + ((i * 7) % 22) + Math.sin(t * 0.0003 + i * 0.9) * 4;
        const up = i % 3 !== 0;
        ctx.strokeStyle = up ? '#00c9b7' : '#7c5cfc'; ctx.fillStyle = up ? 'rgba(0,201,183,.55)' : 'rgba(124,92,252,.5)';
        ctx.beginPath(); ctx.moveTo(x, baseY - h - 8); ctx.lineTo(x, baseY + 8); ctx.stroke();
        ctx.fillRect(x - 2.5, baseY - h, 5, h);
      }
      ctx.restore();
    };

    const draw = (now: number) => {
      if (!running) return;
      const delta = Math.min(40, now - last); last = now;
      if (!reduceMotion) elapsed += delta;
      ctx.clearRect(0, 0, width, height);
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#020817'); bg.addColorStop(0.52, '#050b1c'); bg.addColorStop(1, '#020613');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      drawGlow(width * 0.14, height * 0.25, Math.min(width, height) * 0.45, 'rgba(37,99,235,ALPHA)', 0.10);
      drawGlow(width * 0.74, height * 0.34, Math.min(width, height) * 0.48, 'rgba(0,217,255,ALPHA)', 0.07);
      drawParticles(elapsed); drawCandles(elapsed); drawMarketChart(elapsed); drawGlobe(elapsed); drawWaves(elapsed);
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (width < 768 || reduceMotion) return;
      mouseX = clamp((event.clientX / Math.max(width, 1) - 0.5) * 2, -1, 1);
      mouseY = clamp((event.clientY / Math.max(height, 1) - 0.5) * 2, -1, 1);
      if (layerRef.current) layerRef.current.style.transform = `translate3d(${mouseX * 8}px, ${mouseY * 6}px, 0)`;
    };

    const onVisibility = () => {
      running = !document.hidden;
      if (running && !reduceMotion) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    draw(performance.now());

    return () => {
      running = false; cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div ref={layerRef} className="absolute inset-0 transition-transform duration-300 ease-out will-change-transform">
        <div className="hidden md:block absolute left-[7%] top-[18%] px-3 py-2 rounded-xl border border-cyan-400/15 bg-[#07142b]/35 backdrop-blur-sm shadow-lg shadow-cyan-950/20 animate-[pulse_5s_ease-in-out_infinite]">
          <div className="text-[9px] uppercase tracking-[0.18em] text-cyan-300/65">Global Liquidity</div><div className="text-sm font-mono font-bold text-cyan-100">+2.48%</div>
        </div>
        <div className="hidden lg:block absolute right-[9%] top-[18%] px-3 py-2 rounded-xl border border-amber-400/15 bg-[#111225]/35 backdrop-blur-sm shadow-lg shadow-amber-950/10 animate-[pulse_6s_ease-in-out_infinite]">
          <div className="text-[9px] uppercase tracking-[0.18em] text-amber-300/60">Network Pulse</div><div className="text-sm font-mono font-bold text-amber-100">LIVE</div>
        </div>
        <div className="hidden md:block absolute right-[28%] bottom-[15%] px-3 py-2 rounded-xl border border-violet-400/15 bg-[#0a1028]/30 backdrop-blur-sm animate-[pulse_7s_ease-in-out_infinite]">
          <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300/60">Market Mesh</div><div className="text-sm font-mono font-bold text-violet-100">SYNC</div>
        </div>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,8,23,.08)_45%,rgba(2,8,23,.55)_100%)]" />
    </div>
  );
};
