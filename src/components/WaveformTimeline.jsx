/**
 * WaveformTimeline.jsx
 * Canvas-based waveform with section color overlays and draggable markers.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { SECTION_COLORS, SECTION_LABELS } from '../lib/spatialMotions';
import { formatTimeShort } from '../lib/audioUtils';

const CANVAS_HEIGHT = 120;
const MARKER_WIDTH = 2;
const HANDLE_RADIUS = 7;

export default function WaveformTimeline({
  waveformData,
  sections,
  duration,
  currentTime,
  onSeek,
  onSectionsChange,
  activeSectionId,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(null); // { sectionId, edge: 'start'|'end' }
  const [hoverX, setHoverX] = useState(null);
  const rafRef = useRef(null);
  const stateRef = useRef({ sections, currentTime, hoverX: null, waveformData, duration, activeSectionId });

  // Keep refs in sync
  useEffect(() => {
    stateRef.current = { sections, currentTime, hoverX, waveformData, duration, activeSectionId };
  });

  // ---- Drawing ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { sections, currentTime, hoverX, waveformData, duration, activeSectionId } = stateRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, W, H);

    // Section color fills
    sections.forEach(section => {
      const x1 = (section.start / duration) * W;
      const x2 = (section.end / duration) * W;
      const color = SECTION_COLORS[section.type] || '#888';
      const isActive = section.id === activeSectionId;

      // Section background fill
      ctx.fillStyle = section.enabled
        ? hexToRgba(color, isActive ? 0.14 : 0.07)
        : hexToRgba(color, 0.03);
      ctx.fillRect(x1, 0, x2 - x1, H);

      // Top border line
      ctx.fillStyle = section.enabled ? hexToRgba(color, isActive ? 0.9 : 0.5) : hexToRgba(color, 0.2);
      ctx.fillRect(x1, 0, x2 - x1, 2);

      // Section label
      if (x2 - x1 > 40) {
        ctx.font = `500 9px "Rajdhani", sans-serif`;
        ctx.letterSpacing = '1px';
        ctx.fillStyle = section.enabled ? hexToRgba(color, isActive ? 1 : 0.7) : hexToRgba(color, 0.3);
        ctx.fillText(SECTION_LABELS[section.type] || section.type.toUpperCase(), x1 + 6, 14);
        ctx.letterSpacing = '0px';
      }
    });

    // Waveform bars
    if (waveformData && duration > 0) {
      const numBars = waveformData.length;
      const barW = W / numBars;
      const midY = H / 2;

      for (let i = 0; i < numBars; i++) {
        const barX = i * barW;
        const timeAtBar = (i / numBars) * duration;
        const amp = waveformData[i];
        const barH = Math.max(1, amp * (H * 0.42));

        // Find section for this bar
        let barColor = '#4a5568';
        let alpha = 0.6;
        for (const sec of sections) {
          if (timeAtBar >= sec.start && timeAtBar < sec.end) {
            barColor = sec.enabled ? (SECTION_COLORS[sec.type] || '#4a5568') : '#2d3748';
            alpha = sec.enabled ? (sec.id === activeSectionId ? 0.9 : 0.55) : 0.2;
            break;
          }
        }

        ctx.fillStyle = hexToRgba(barColor, alpha);
        ctx.fillRect(barX, midY - barH, Math.max(barW - 0.5, 0.5), barH * 2);
      }

      // Waveform center line
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, H / 2 - 0.5, W, 1);
    }

    // Section boundary markers (draggable)
    sections.forEach((section, idx) => {
      if (idx === 0) return; // Skip start of first section
      const x = (section.start / duration) * W;
      const color = SECTION_COLORS[section.type] || '#888';

      // Marker line
      ctx.fillStyle = hexToRgba(color, 0.6);
      ctx.fillRect(x - MARKER_WIDTH / 2, 0, MARKER_WIDTH, H);

      // Handle circle
      ctx.beginPath();
      ctx.arc(x, H - 14, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.85);
      ctx.fill();
      ctx.strokeStyle = '#0d0f12';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Playhead
    if (duration > 0) {
      const px = (currentTime / duration) * W;
      ctx.fillStyle = 'rgba(245, 166, 35, 0.9)';
      ctx.fillRect(px - 1, 0, 2, H);
      // Triangle head
      ctx.beginPath();
      ctx.moveTo(px - 6, 0);
      ctx.lineTo(px + 6, 0);
      ctx.lineTo(px, 10);
      ctx.fillStyle = 'var(--amber, #f5a623)';
      ctx.fill();

      // Time label
      const label = formatTimeShort(currentTime);
      ctx.font = '600 10px "Syne Mono", monospace';
      const tw = ctx.measureText(label).width;
      const lx = Math.min(Math.max(px - tw / 2, 2), W - tw - 2);
      ctx.fillStyle = 'rgba(245, 166, 35, 0.95)';
      ctx.fillText(label, lx, H - 4);
    }

    // Hover time indicator
    if (hoverX !== null && duration > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(hoverX, 0, 1, H);
      const t = (hoverX / W) * duration;
      const label = formatTimeShort(t);
      ctx.font = '600 9px "Syne Mono", monospace';
      const tw = ctx.measureText(label).width;
      const lx = Math.min(Math.max(hoverX - tw / 2, 2), W - tw - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(label, lx, H - 4);
    }
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = CANVAS_HEIGHT;
      draw();
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Redraw on state change
  useEffect(() => {
    draw();
  }, [waveformData, sections, currentTime, hoverX, activeSectionId, draw]);

  // ---- Interaction ----
  const getTime = useCallback((clientX) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    return (x / canvas.width) * duration;
  }, [duration]);

  const getPixel = useCallback((clientX) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left;
  }, []);

  const findHandle = useCallback((clientX) => {
    // Check if near a section boundary marker
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const W = canvas.width;

    for (let idx = 1; idx < sections.length; idx++) {
      const section = sections[idx];
      const sx = (section.start / duration) * W;
      if (Math.abs(mx - sx) <= HANDLE_RADIUS + 4) {
        return { sectionIdx: idx, edge: 'start' };
      }
    }
    return null;
  }, [sections, duration]);

  const handleMouseDown = useCallback((e) => {
    const handle = findHandle(e.clientX);
    if (handle) {
      setDragging(handle);
      e.preventDefault();
    } else {
      onSeek(getTime(e.clientX));
    }
  }, [findHandle, onSeek, getTime]);

  const handleMouseMove = useCallback((e) => {
    const px = getPixel(e.clientX);
    setHoverX(px);

    if (dragging) {
      const newTime = getTime(e.clientX);
      const { sectionIdx } = dragging;
      const updated = sections.map((s, i) => {
        if (i === sectionIdx) {
          const minStart = sections[i - 1]?.start + 1 || 0;
          const maxStart = sections[i + 1] ? sections[i + 1].start - 1 : duration - 1;
          const clampedTime = Math.max(minStart, Math.min(maxStart, newTime));
          return { ...s, start: clampedTime };
        }
        if (i === sectionIdx - 1) {
          const minStart = sections[i - 1]?.start + 1 || 0;
          const maxStart = sections[i + 1] ? sections[i + 1].start - 1 : duration - 1;
          const clampedTime = Math.max(minStart, Math.min(maxStart, newTime));
          return { ...s, end: clampedTime };
        }
        return s;
      });
      onSectionsChange(updated);
    }
  }, [dragging, sections, duration, getTime, getPixel, onSectionsChange]);

  const handleMouseUp = useCallback(() => setDragging(null), []);
  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    if (!dragging) setDragging(null);
  }, [dragging]);

  return (
    <div className="waveform-section">
      <div className="waveform-header">
        <span className="panel-title">Timeline</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
          }}>
            {formatTimeShort(duration)} · DRAG MARKERS TO ADJUST
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="waveform-canvas-wrap"
        style={{ cursor: dragging ? 'ew-resize' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: `${CANVAS_HEIGHT}px` }} />
      </div>
    </div>
  );
}

function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)},${alpha})`;
}
