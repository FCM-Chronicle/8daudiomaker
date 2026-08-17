/**
 * Visualizer3D.jsx
 * Canvas-based 3D spatial audio visualizer.
 * Shows a top-down (XZ plane) and side (XY plane) view
 * of the sound source position relative to the listener's head.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { SECTION_COLORS } from '../lib/spatialMotions';

const TRAIL_LENGTH = 60;

export default function Visualizer3D({ position3D, activeSection, isPlaying }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const trailRef = useRef([]);
  const rafRef = useRef(null);
  const [view, setView] = useState('top'); // 'top' | 'side' | 'both'
  const stateRef = useRef({ position3D, activeSection, isPlaying, view });

  useEffect(() => {
    stateRef.current = { position3D, activeSection, isPlaying, view };
  });

  // Trail accumulation
  useEffect(() => {
    if (isPlaying) {
      trailRef.current.push({ ...position3D });
      if (trailRef.current.length > TRAIL_LENGTH) {
        trailRef.current.shift();
      }
    }
  }, [position3D, isPlaying]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const { position3D: pos, activeSection, view } = stateRef.current;
    const trail = trailRef.current;
    const sectionColor = activeSection ? SECTION_COLORS[activeSection.type] : '#f5a623';

    ctx.clearRect(0, 0, W, H);

    if (view === 'both') {
      // Split view: top-down left, side view right
      drawView(ctx, trail, pos, sectionColor, 0, 0, W / 2, H, 'top');
      drawView(ctx, trail, pos, sectionColor, W / 2, 0, W / 2, H, 'side');
      // Divider
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(W / 2 - 0.5, 0, 1, H);
    } else {
      drawView(ctx, trail, pos, sectionColor, 0, 0, W, H, view);
    }
  }, []);

  useEffect(() => {
    const loop = () => {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const { x, y, z } = position3D;

  return (
    <div className="visualizer-panel">
      <div className="visualizer-header">
        <span className="panel-title">3D Position</span>
        <div className="view-toggle">
          {[
            { id: 'top', label: 'TOP' },
            { id: 'side', label: 'SIDE' },
            { id: 'both', label: 'BOTH' },
          ].map(v => (
            <button
              key={v.id}
              className={`view-btn${view === v.id ? ' active' : ''}`}
              onClick={() => setView(v.id)}
              id={`view-btn-${v.id}`}
              aria-label={`${v.label} view`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="visualizer-canvas-wrap" style={{ minHeight: 200 }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>

      <div className="coord-readout">
        <div className="coord-item">
          <span className="coord-axis x">X</span>
          <span className="coord-val">{x.toFixed(2)}</span>
        </div>
        <div className="coord-item">
          <span className="coord-axis y">Y</span>
          <span className="coord-val">{y.toFixed(2)}</span>
        </div>
        <div className="coord-item">
          <span className="coord-axis z">Z</span>
          <span className="coord-val">{z.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Drawing helpers ----

function drawView(ctx, trail, pos, color, ox, oy, W, H, view) {
  const cx = ox + W / 2;
  const cy = oy + H / 2;
  const scale = Math.min(W, H) / 10; // 10 units spans half the view

  ctx.save();

  // Background
  ctx.fillStyle = '#0a0b0d';
  ctx.fillRect(ox, oy, W, H);

  // Grid rings
  const ringColors = ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.02)'];
  [3, 2, 1].forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    ctx.strokeStyle = ringColors[i];
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, cy); ctx.lineTo(ox + W, cy);
  ctx.moveTo(cx, oy); ctx.lineTo(cx, oy + H);
  ctx.stroke();

  // Axis labels
  ctx.font = '700 9px "Rajdhani", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  if (view === 'top') {
    ctx.fillText('L', ox + 4, cy - 4);
    ctx.fillText('R', ox + W - 14, cy - 4);
    ctx.fillText('FRONT', cx - 18, oy + 12);
    ctx.fillText('REAR', cx - 12, oy + H - 4);
    ctx.fillText('TOP VIEW (X–Z)', ox + 4, oy + H - 4);
  } else {
    ctx.fillText('L', ox + 4, cy - 4);
    ctx.fillText('R', ox + W - 14, cy - 4);
    ctx.fillText('UP', cx - 8, oy + 12);
    ctx.fillText('DOWN', cx - 16, oy + H - 4);
    ctx.fillText('SIDE VIEW (X–Y)', ox + 4, oy + H - 4);
  }

  // ---- Trail ----
  if (trail.length > 1) {
    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * 0.6;
      const prev = trail[i - 1];
      const curr = trail[i];

      const { px: px1, py: py1 } = project(prev, cx, cy, scale, view);
      const { px: px2, py: py2 } = project(curr, cx, cy, scale, view);

      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.strokeStyle = hexToRgba(color, alpha * 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ---- Sound source particle ----
  const { px: spx, py: spy } = project(pos, cx, cy, scale, view);

  // Outer glow
  const grad = ctx.createRadialGradient(spx, spy, 0, spx, spy, 24);
  grad.addColorStop(0, hexToRgba(color, 0.35));
  grad.addColorStop(1, hexToRgba(color, 0));
  ctx.beginPath();
  ctx.arc(spx, spy, 24, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Core dot
  ctx.beginPath();
  ctx.arc(spx, spy, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  // ---- Head silhouette at center ----
  drawHead(ctx, cx, cy, view);

  ctx.restore();
}

function project(pos, cx, cy, scale, view) {
  if (view === 'top') {
    // X → horizontal, Z → vertical (Z positive = front)
    return {
      px: cx + pos.x * scale,
      py: cy - pos.z * scale,
    };
  } else {
    // X → horizontal, Y → vertical (Y positive = up)
    return {
      px: cx + pos.x * scale,
      py: cy - pos.y * scale,
    };
  }
}

function drawHead(ctx, cx, cy, view) {
  ctx.save();

  if (view === 'top') {
    // Oval head (top-down)
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ears
    ctx.beginPath();
    ctx.ellipse(cx - 11, cy, 3, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx + 11, cy, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nose dot (front indicator)
    ctx.beginPath();
    ctx.arc(cx, cy - 13, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,166,35,0.6)';
    ctx.fill();

  } else {
    // Side view: simple circle head
    ctx.beginPath();
    ctx.ellipse(cx, cy, 11, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Neck
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(cx - 5, cy + 13, 10, 8);

    // Crown dot
    ctx.beginPath();
    ctx.arc(cx, cy - 14, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,229,255,0.6)';
    ctx.fill();
  }

  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)},${alpha})`;
}
