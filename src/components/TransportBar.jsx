/**
 * TransportBar.jsx — Playback controls with time display and volume
 */

import { useCallback } from 'react';
import { formatTime, formatTimeShort } from '../lib/audioUtils';
import { SECTION_COLORS, SECTION_LABELS } from '../lib/spatialMotions';

function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <polygon points="4,2 16,9 4,16" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <rect x="3" y="2" width="4" height="14" rx="1"/>
      <rect x="11" y="2" width="4" height="14" rx="1"/>
    </svg>
  );
}
function IconRewind() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <polygon points="13,1 6,7 13,13" />
      <rect x="1" y="1" width="3" height="12" rx="1" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 1v8" strokeLinecap="round" />
      <path d="M3.5 6.5L7 10l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.5 12h11" strokeLinecap="round" />
    </svg>
  );
}
function IconVolume({ muted }) {
  return muted ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path d="M1 4h3l4-3v12l-4-3H1V4z" opacity="0.5"/>
      <line x1="10" y1="4" x2="14" y2="10" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="14" y1="4" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path d="M1 4h3l4-3v12l-4-3H1V4z"/>
      <path d="M9 3.5c1.5 1 2 2 2 3.5s-.5 2.5-2 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

export default function TransportBar({
  isPlaying,
  currentTime,
  duration,
  volume,
  onPlay,
  onPause,
  onSeek,
  onSetVolume,
  activeSection,
  fileName,
  onExport,
  isExporting,
}) {
  const handleSeek = useCallback((e) => {
    const t = (parseFloat(e.target.value) / 1000) * duration;
    onSeek(t);
  }, [duration, onSeek]);

  const seekValue = duration > 0 ? (currentTime / duration) * 1000 : 0;

  const sectionColor = activeSection ? SECTION_COLORS[activeSection.type] : null;
  const sectionLabel = activeSection ? SECTION_LABELS[activeSection.type] : 'NO SECTION';

  return (
    <div className="transport-bar">
      {/* Rewind to start */}
      <button
        className="transport-btn"
        onClick={() => onSeek(0)}
        title="Rewind to start"
        id="btn-rewind"
        aria-label="Rewind to start"
      >
        <IconRewind />
      </button>

      {/* Play / Pause */}
      <button
        className={`transport-btn play-btn${isPlaying ? ' is-playing' : ''}`}
        onClick={isPlaying ? onPause : onPlay}
        id="btn-play-pause"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>

      {/* Time display */}
      <div className="transport-time" aria-label="Current playback time">
        {formatTime(currentTime)}
      </div>

      {/* Seek bar */}
      <div className="transport-seek">
        <div className="transport-label">POSITION</div>
        <input
          type="range"
          id="seek-bar"
          min={0}
          max={1000}
          step={1}
          value={seekValue}
          onChange={handleSeek}
          aria-label="Seek playback position"
          style={{ '--amber': 'var(--amber)' }}
        />
      </div>

      {/* Duration */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
      }}>
        {formatTimeShort(duration)}
      </div>

      {/* Volume */}
      <div className="transport-vol-group">
        <button
          className="transport-btn"
          style={{ width: 28, height: 28, border: 'none', background: 'transparent', padding: 0 }}
          onClick={() => onSetVolume(volume > 0 ? 0 : 0.85)}
          id="btn-mute"
          aria-label={volume === 0 ? 'Unmute' : 'Mute'}
        >
          <IconVolume muted={volume === 0} />
        </button>
        <div className="transport-label" style={{ minWidth: 36 }}>VOL</div>
        <input
          type="range"
          id="volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onSetVolume(parseFloat(e.target.value))}
          aria-label="Master volume"
          style={{ width: 80 }}
        />
      </div>

      {/* Active section badge */}
      {activeSection && (
        <div
          className="section-active-badge"
          style={{
            borderColor: hexToRgba(sectionColor, 0.5),
            color: sectionColor,
            background: hexToRgba(sectionColor, 0.1),
          }}
        >
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: sectionColor,
            boxShadow: `0 0 8px ${sectionColor}`,
            display: 'inline-block',
          }} />
          {sectionLabel}
        </div>
      )}

      {/* Export / Download */}
      <button
        className="btn btn-cyan"
        onClick={onExport}
        disabled={isExporting}
        id="btn-export"
        aria-label="Export 8D audio as WAV"
        title="Render and download as WAV"
        style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
      >
        <IconDownload />
        {isExporting ? 'RENDERING…' : 'EXPORT MP3'}
      </button>

      {/* File name */}
      {fileName && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          marginLeft: 'auto',
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {fileName}
        </div>
      )}
    </div>
  );
}

function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(128,128,128,${alpha})`;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)},${alpha})`;
}
