/**
 * App.jsx — 8Daudiomaker main application
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import './index.css';
import './App.css';
import DropZone from './components/DropZone';
import WaveformTimeline from './components/WaveformTimeline';
import TransportBar from './components/TransportBar';
import SectionPanel from './components/SectionPanel';
import Visualizer3D from './components/Visualizer3D';
import { useAudioEngine } from './hooks/useAudioEngine';
import { computeWaveformData, detectSectionBoundaries, assignSectionTypes } from './lib/audioUtils';
import { generateDefaultSections, SECTION_TYPES } from './lib/spatialMotions';
import { convertAudioToWav } from './lib/ffmpegUtils';

function StatusDot({ status }) {
  const cls = status === 'playing' ? 'playing' : status === 'loaded' ? 'active' : '';
  return <span className={`status-dot ${cls}`} />;
}

function AnalyzingOverlay({ mode = 'analyzing' }) {
  const title = mode === 'converting' ? 'Converting format...' : 'Analyzing audio structure…';
  const subtitle = mode === 'converting'
    ? 'Using local WASM engine to prepare unsupported format'
    : 'Detecting section boundaries via energy analysis';

  return (
    <div className="analyzing-overlay" role="status" aria-live="polite">
      <div className="analyzing-ring" />
      <div className="analyzing-text">{title}</div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
      }}>
        {subtitle}
      </div>
    </div>
  );
}

export default function App() {
  const engine = useAudioEngine();

  const [appState, setAppState] = useState('empty'); // 'empty' | 'analyzing' | 'ready'
  const [waveformData, setWaveformData] = useState(null);
  const [sections, setSections] = useState([]);
  const [fileName, setFileName] = useState('');
  const [decodedBuffer, setDecodedBuffer] = useState(null);

  // Keep engine sections in sync
  useEffect(() => {
    engine.setSections(sections);
  }, [sections, engine.setSections]);

  const activeSection = sections.find(s => s.id === engine.activeSectionId) || null;

  const handleFileLoaded = useCallback(async ({ arrayBuffer, fileName }) => {
    setAppState('analyzing');
    setFileName(fileName);
    setWaveformData(null);
    setSections([]);

    let audioBuffer;
    try {
      // Decode audio natively
      audioBuffer = await engine.loadBuffer(arrayBuffer.slice(0));
    } catch (err) {
      console.warn('Native decoding failed, attempting WASM conversion...', err);
      try {
        setAppState('converting');
        const wavBuffer = await convertAudioToWav(arrayBuffer.slice(0), fileName);
        setAppState('analyzing');
        audioBuffer = await engine.loadBuffer(wavBuffer);
      } catch (conversionErr) {
        console.error('WASM Conversion also failed:', conversionErr);
        setAppState('ready'); // Fallback or show error
        return;
      }
    }

    try {
      setDecodedBuffer(audioBuffer);

      // Compute waveform display data
      const wfData = computeWaveformData(audioBuffer, 900);
      setWaveformData(wfData);

      // Detect section boundaries (now async and returns dynamic number of boundaries)
      const boundaries = await detectSectionBoundaries(audioBuffer, audioBuffer.duration);

      // Intelligently assign section types based on energy and position
      const newSections = assignSectionTypes(boundaries, audioBuffer);

      setSections(newSections);
      setAppState('ready');
    } catch (err) {
      console.error('Audio analysis failed:', err);
      // Fallback: equal sections
      if (engine.duration > 0) {
        setSections(generateDefaultSections(engine.duration));
      }
      setAppState('ready');
    }
  }, [engine]);

  const handleSectionsChange = useCallback((updated) => {
    setSections(updated);
  }, []);

  const handleSeek = useCallback((time) => {
    engine.seek(time);
  }, [engine]);

  const handlePlay = useCallback(() => {
    engine.play();
  }, [engine]);

  const handlePause = useCallback(() => {
    engine.pause();
  }, [engine]);

  const handleExport = useCallback(() => {
    engine.exportAudio(fileName);
  }, [engine, fileName]);

  const handleNewFile = useCallback(() => {
    engine.pause();
    setAppState('empty');
    setWaveformData(null);
    setSections([]);
    setFileName('');
    setDecodedBuffer(null);
  }, [engine]);

  const engineStatus = engine.isPlaying ? 'playing' : appState === 'ready' ? 'loaded' : 'idle';

  return (
    <div className="app-wrapper">
      {/* Header */}
      <header className="app-header" role="banner">
        <div className="header-logo">
          <span className="logo-mark">8D</span>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-primary)',
            }}>
              audiomaker
            </div>
            <div className="logo-sub">Spatial Audio Production Studio</div>
          </div>
        </div>

        <div className="header-status">
          <div className="status-indicator">
            <StatusDot status={engineStatus} />
            <span>
              {engine.isPlaying
                ? 'PLAYING'
                : appState === 'ready'
                  ? 'LOADED'
                  : appState === 'analyzing'
                    ? 'ANALYZING'
                    : 'STANDBY'}
            </span>
          </div>

          {appState === 'ready' && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-cyan" onClick={handleNewFile} id="btn-new-file">
                ↑ Load New
              </button>
            </div>
          )}

          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            paddingLeft: '8px',
            borderLeft: '1px solid var(--border-dim)',
          }}>
            HRTF Engine
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="app-main" role="main">
        {appState === 'empty' && (
          <DropZone onFileLoaded={handleFileLoaded} />
        )}

        {appState === 'ready' && (
          <div className="studio-layout">

            {/* Transport Bar */}
            <TransportBar
              isPlaying={engine.isPlaying}
              currentTime={engine.currentTime}
              duration={engine.duration}
              volume={engine.volume}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
              onSetVolume={engine.setVolume}
              activeSection={activeSection}
              fileName={fileName}
              onExport={handleExport}
              isExporting={engine.isExporting}
            />

            {/* Waveform Timeline */}
            <WaveformTimeline
              waveformData={waveformData}
              sections={sections}
              duration={engine.duration}
              currentTime={engine.currentTime}
              onSeek={handleSeek}
              onSectionsChange={handleSectionsChange}
              activeSectionId={engine.activeSectionId}
            />

            {/* Bottom: Section Panel + 3D Visualizer */}
            <div className="studio-bottom">
              <SectionPanel
                sections={sections}
                activeSectionId={engine.activeSectionId}
                onSectionsChange={handleSectionsChange}
              />

              <Visualizer3D
                position3D={engine.position3D}
                activeSection={activeSection}
                isPlaying={engine.isPlaying}
              />
            </div>
          </div>
        )}
      </main>

      {/* Analyzing overlay */}
      {(appState === 'analyzing' || appState === 'converting') && <AnalyzingOverlay mode={appState} />}
    </div>
  );
}