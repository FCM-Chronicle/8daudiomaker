/**
 * DropZone.jsx — File upload drop zone component
 */

import { useState, useRef, useCallback } from 'react';

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac',
                        'audio/flac', 'audio/mp4', 'audio/webm', 'audio/x-m4a'];

function WaveformIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="14" width="2" height="8" rx="1" fill="currentColor" opacity="0.4"/>
      <rect x="5" y="10" width="2" height="16" rx="1" fill="currentColor" opacity="0.6"/>
      <rect x="9" y="6" width="2" height="24" rx="1" fill="currentColor" opacity="0.8"/>
      <rect x="13" y="3" width="2" height="30" rx="1" fill="currentColor"/>
      <rect x="17" y="8" width="2" height="20" rx="1" fill="currentColor"/>
      <rect x="21" y="4" width="2" height="28" rx="1" fill="currentColor"/>
      <rect x="25" y="9" width="2" height="18" rx="1" fill="currentColor" opacity="0.8"/>
      <rect x="29" y="12" width="2" height="12" rx="1" fill="currentColor" opacity="0.6"/>
      <rect x="33" y="15" width="2" height="6" rx="1" fill="currentColor" opacity="0.4"/>
    </svg>
  );
}

export default function DropZone({ onFileLoaded }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const processFile = useCallback((file) => {
    if (!file) return;
    setError('');

    const isAudio = ACCEPTED_TYPES.includes(file.type) ||
      /\.(mp3|wav|ogg|aac|flac|m4a|webm)$/i.test(file.name);

    if (!isAudio) {
      setError('Unsupported file format. Please use MP3, WAV, OGG, FLAC, AAC, or M4A.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      onFileLoaded({
        arrayBuffer: e.target.result,
        fileName: file.name,
        fileSize: file.size,
      });
    };
    reader.readAsArrayBuffer(file);
  }, [onFileLoaded]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleClick = useCallback(() => inputRef.current?.click(), []);

  const handleInputChange = useCallback((e) => {
    processFile(e.target.files[0]);
    e.target.value = '';
  }, [processFile]);

  return (
    <div className="drop-zone-wrapper">
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''} animate-fadeInUp`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Upload audio file"
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleInputChange}
          id="audio-file-input"
          aria-label="Choose audio file"
        />

        <div className="drop-zone-icon">
          <WaveformIcon />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div className="drop-zone-title">
            Drop Your Track
          </div>
          <div style={{ marginTop: '6px' }}>
            <span className="drop-zone-sub">
              or click to browse files
            </span>
          </div>
        </div>

        <div className="drop-zone-formats">
          {['MP3', 'WAV', 'FLAC', 'AAC', 'OGG', 'M4A'].map(fmt => (
            <span key={fmt} className="format-tag">{fmt}</span>
          ))}
        </div>

        {error && (
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: '#ff6b6b',
            letterSpacing: '0.08em',
            textAlign: 'center',
          }}>
            {error}
          </p>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '8px',
          width: '100%',
          padding: '0 var(--space-md)',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dim)' }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>
            HRTF · Web Audio API
          </span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dim)' }} />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '8px',
          width: '100%',
          padding: '0 var(--space-sm)',
        }}>
          {[
            { label: '8 Sections', desc: 'Spatial zones' },
            { label: 'HRTF', desc: 'Binaural engine' },
            { label: '3D Orbit', desc: 'Live visualizer' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--amber)',
                letterSpacing: '0.05em',
              }}>
                {item.label}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                marginTop: '2px',
              }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
