'use client';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Phase } from './voice';

// Tilted latitude rings, projected onto a sphere. Bright forward arcs and
// dim rear arcs give the mesh depth without a 3D engine or texture assets.
export default function Orb({ phase, level }: { phase: Phase; level: RefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    function draw(time: number) {
      if (!ctx) return;
      const size = Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2));
      if (canvas.width !== size) canvas.width = canvas.height = size;
      ctx.setTransform(size / 400, 0, 0, size / 400, 0, 0);
      ctx.clearRect(0, 0, 400, 400);
      const t = reduce ? 0 : time * (phase === 'Speaking' ? .00044 : .00015);
      const amp = phase === 'Listening' ? level.current * 0.08 : 0;
      const glow = ctx.createRadialGradient(191, 189, 4, 200, 200, 158);
      glow.addColorStop(0, '#563c85'); glow.addColorStop(.78, '#291d50'); glow.addColorStop(1,'#151226');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(200,200,151,0,Math.PI*2); ctx.fill();
      for (let i = 0; i <= 108; i++) {
        const lat = (i / 108 - .5) * Math.PI;
        ctx.beginPath();
        for (let j = 0; j <= 144; j++) {
          const lon = j / 144 * Math.PI * 2;
          const wave = Math.cos(lat) * Math.sin(lon * 2 + lat * 3 + t);
          const a = lat + wave * .27;
          const r = 151 * (1 + (.05 + amp) * wave);
          const x = Math.cos(a) * Math.cos(lon) * r;
          const y = (Math.sin(a) * .87 + Math.cos(a) * Math.sin(lon) * .49) * r;
          const px = 200 + x * .92 - y * .39, py = 200 + y * .92 + x * .39;
          if (!j) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        const band = .5 + .5 * Math.sin(lat * 5 + .55 * Math.sin(t));
        ctx.strokeStyle = 'hsla(' + (244 + 35 * band) + ', 95%, ' + (58 + 25 * band) + '%, .78)';
        ctx.lineWidth = .85; ctx.stroke();
      }
      if (!reduce) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [phase, level]);
  return <canvas ref={ref} aria-hidden="true" />;
}

