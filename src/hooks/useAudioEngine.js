/**
 * useAudioEngine.js
 * Core Web Audio API hook.
 * Manages AudioContext, PannerNode (HRTF), ConvolverNode (reverb),
 * section-aware animation loop, and smooth position transitions.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { getSectionPosition, getSectionReverb } from '../lib/spatialMotions';
import { clamp } from '../lib/audioUtils';
import { bufferToMp3Blob, downloadBlob, deriveExportFilename } from '../lib/audioExport';

// Create impulse response for reverb convolver
function createImpulseResponse(ctx, duration = 2.5, decay = 2.5) {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

// Find which section is active at time t within a given sections array
function findActiveSection(sections, t) {
  for (const s of sections) {
    if (s.enabled && t >= s.start && t < s.end) return s;
  }
  return null;
}

export function useAudioEngine() {
  const ctxRef = useRef(null);
  const sourceRef = useRef(null);
  const pannerRef = useRef(null);
  const convolverRef = useRef(null);
  const dryGainRef = useRef(null);
  const wetGainRef = useRef(null);
  const masterGainRef = useRef(null);
  const bufferRef = useRef(null);
  const rafRef = useRef(null);
  const startTimeRef = useRef(0);   // AudioContext time when play started
  const startOffsetRef = useRef(0); // Buffer offset when play started
  const sectionTimeRef = useRef(0); // Time within current section

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [position3D, setPosition3D] = useState({ x: 0, y: 0, z: 1 });
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Sections ref (updated externally)
  const sectionsRef = useRef([]);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  const buildGraph = useCallback((ctx) => {
    // Master gain
    if (!masterGainRef.current || masterGainRef.current.context !== ctx) {
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.value = volume;
      masterGainRef.current.connect(ctx.destination);
    }

    // Panner (HRTF)
    pannerRef.current = ctx.createPanner();
    pannerRef.current.panningModel = 'HRTF';
    pannerRef.current.distanceModel = 'inverse';
    pannerRef.current.refDistance = 1;
    pannerRef.current.maxDistance = 20;
    pannerRef.current.rolloffFactor = 0.5;
    pannerRef.current.coneInnerAngle = 360;
    pannerRef.current.coneOuterAngle = 0;
    pannerRef.current.coneOuterGain = 0;

    // Dry gain
    dryGainRef.current = ctx.createGain();
    dryGainRef.current.gain.value = 0.85;

    // Convolver (reverb)
    convolverRef.current = ctx.createConvolver();
    convolverRef.current.buffer = createImpulseResponse(ctx);

    // Wet gain
    wetGainRef.current = ctx.createGain();
    wetGainRef.current.gain.value = 0.15;

    // Graph: source → panner → dryGain → master
    //                       → convolver → wetGain → master
    pannerRef.current.connect(dryGainRef.current);
    dryGainRef.current.connect(masterGainRef.current);

    pannerRef.current.connect(convolverRef.current);
    convolverRef.current.connect(wetGainRef.current);
    wetGainRef.current.connect(masterGainRef.current);
  }, [volume]);

  const loadBuffer = useCallback(async (arrayBuffer) => {
    const ctx = ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    bufferRef.current = decoded;
    setDuration(decoded.duration);
    setCurrentTime(0);
    startOffsetRef.current = 0;
    setActiveSectionId(null);
    return decoded;
  }, [ensureContext]);

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (_) {}
      try { sourceRef.current.disconnect(); } catch (_) {}
      sourceRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** Get active section at time t */
  const getActiveSection = useCallback((t) => {
    return findActiveSection(sectionsRef.current, t);
  }, []);

  /** Smooth position set using AudioParam ramps */
  const smoothSetPosition = useCallback((panner, x, y, z, rampTime = 0.3) => {
    const ctx = ctxRef.current;
    if (!ctx || !panner) return;
    const now = ctx.currentTime;
    const end = now + rampTime;

    if (panner.positionX) {
      panner.positionX.cancelScheduledValues(now);
      panner.positionX.linearRampToValueAtTime(clamp(x, -10, 10), end);
      panner.positionY.cancelScheduledValues(now);
      panner.positionY.linearRampToValueAtTime(clamp(y, -10, 10), end);
      panner.positionZ.cancelScheduledValues(now);
      panner.positionZ.linearRampToValueAtTime(clamp(z, -10, 10), end);
    } else {
      panner.setPosition(
        clamp(x, -10, 10),
        clamp(y, -10, 10),
        clamp(z, -10, 10)
      );
    }
  }, []);

  /** Main animation loop */
  const startAnimLoop = useCallback(() => {
    let lastSection = null;
    let lastSectionStart = 0; // AudioContext time when section changed

    const tick = () => {
      const ctx = ctxRef.current;
      const panner = pannerRef.current;
      if (!ctx || !panner) return;

      const ctxNow = ctx.currentTime;
      const playedSec = ctxNow - startTimeRef.current + startOffsetRef.current;
      const dur = bufferRef.current?.duration || 0;

      if (playedSec >= dur) {
        setIsPlaying(false);
        setCurrentTime(dur);
        stopSource();
        return;
      }

      setCurrentTime(playedSec);

      const section = getActiveSection(playedSec);
      const sectionType = (section?.enabled ? section.type : null) || 'verse';

      // Track section changes
      if (section !== lastSection) {
        lastSection = section;
        lastSectionStart = ctxNow;
      }

      const sectionElapsed = ctxNow - lastSectionStart;
      const sectionDur = section ? section.end - section.start : 10;

      // Get target position
      const pos = getSectionPosition(sectionType, sectionElapsed, sectionDur);
      smoothSetPosition(panner, pos.x, pos.y, pos.z, 0.15);
      setPosition3D(pos);
      setActiveSectionId(section?.id ?? null);

      // Update reverb mix
      const reverbMix = getSectionReverb(sectionType, sectionElapsed, sectionDur);
      if (wetGainRef.current && dryGainRef.current) {
        wetGainRef.current.gain.setTargetAtTime(reverbMix, ctx.currentTime, 0.3);
        dryGainRef.current.gain.setTargetAtTime(1 - reverbMix * 0.5, ctx.currentTime, 0.3);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getActiveSection, smoothSetPosition, stopSource]);

  const play = useCallback(async (offset = null) => {
    const ctx = ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!bufferRef.current) return;

    stopSource();
    buildGraph(ctx);

    const startFrom = offset !== null ? offset : startOffsetRef.current;
    startOffsetRef.current = startFrom;
    startTimeRef.current = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;
    source.connect(pannerRef.current);
    source.start(0, startFrom);
    sourceRef.current = source;

    setIsPlaying(true);
    startAnimLoop();
  }, [ensureContext, stopSource, buildGraph, startAnimLoop]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const playedSec = ctx.currentTime - startTimeRef.current + startOffsetRef.current;
    startOffsetRef.current = playedSec;
    stopSource();
    setIsPlaying(false);
  }, [stopSource]);

  const seek = useCallback((time) => {
    const wasPlaying = isPlaying;
    const dur = bufferRef.current?.duration || 0;
    const t = clamp(time, 0, dur);
    startOffsetRef.current = t;
    setCurrentTime(t);
    if (wasPlaying) play(t);
  }, [isPlaying, play]);

  const setVolume = useCallback((val) => {
    setVolumeState(val);
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(val, ctxRef.current?.currentTime || 0, 0.05);
    }
  }, []);

  const setSections = useCallback((sections) => {
    sectionsRef.current = sections;
  }, []);

  /**
   * Render the full spatial mix offline and download it as a WAV file.
   * Reuses the exact same panner/reverb graph as live playback, but
   * schedules every position + reverb keyframe in advance (since
   * OfflineAudioContext can't be driven by requestAnimationFrame) and
   * renders faster than real time.
   */
  const exportAudio = useCallback(async (fileName) => {
    const sourceBuffer = bufferRef.current;
    if (!sourceBuffer) return;

    setIsExporting(true);
    setExportError(null);

    try {
      const sampleRate = sourceBuffer.sampleRate;
      const numChannels = 2;
      const totalDuration = sourceBuffer.duration;
      const length = Math.ceil(totalDuration * sampleRate);

      const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate);

      // Rebuild the identical processing graph inside the offline context
      const panner = offlineCtx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 20;
      panner.rolloffFactor = 0.5;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 0;
      panner.coneOuterGain = 0;

      const dryGain = offlineCtx.createGain();
      dryGain.gain.value = 0.85;

      const convolver = offlineCtx.createConvolver();
      convolver.buffer = createImpulseResponse(offlineCtx);

      const wetGain = offlineCtx.createGain();
      wetGain.gain.value = 0.15;

      const masterGain = offlineCtx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(offlineCtx.destination);

      panner.connect(dryGain);
      dryGain.connect(masterGain);
      panner.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(masterGain);

      // Copy the source buffer into a fresh buffer usable by the offline context
      const offlineSourceBuffer = offlineCtx.createBuffer(
        sourceBuffer.numberOfChannels,
        sourceBuffer.length,
        sourceBuffer.sampleRate
      );
      for (let c = 0; c < sourceBuffer.numberOfChannels; c++) {
        offlineSourceBuffer.copyToChannel(sourceBuffer.getChannelData(c), c);
      }

      const source = offlineCtx.createBufferSource();
      source.buffer = offlineSourceBuffer;
      source.connect(panner);

      // Schedule position + reverb automation ahead of time, mirroring
      // the logic in startAnimLoop() but driven by a fixed time step
      // instead of rAF, since we know the whole timeline in advance.
      const sections = sectionsRef.current;
      const STEP = 0.05; // 50ms keyframes — smooth enough, cheap enough

      panner.positionX.setValueAtTime(0, 0);
      panner.positionY.setValueAtTime(0, 0);
      panner.positionZ.setValueAtTime(1, 0);
      wetGain.gain.setValueAtTime(0.15, 0);
      dryGain.gain.setValueAtTime(0.85, 0);

      let lastSectionId = null;
      let lastSectionStart = 0;

      for (let t = 0; t < totalDuration; t += STEP) {
        const section = findActiveSection(sections, t);
        const sectionType = (section?.enabled ? section.type : null) || 'verse';

        if ((section?.id ?? null) !== lastSectionId) {
          lastSectionId = section?.id ?? null;
          lastSectionStart = t;
        }

        const sectionElapsed = t - lastSectionStart;
        const sectionDur = section ? section.end - section.start : 10;

        const pos = getSectionPosition(sectionType, sectionElapsed, sectionDur);
        const reverbMix = getSectionReverb(sectionType, sectionElapsed, sectionDur);

        panner.positionX.linearRampToValueAtTime(clamp(pos.x, -10, 10), t);
        panner.positionY.linearRampToValueAtTime(clamp(pos.y, -10, 10), t);
        panner.positionZ.linearRampToValueAtTime(clamp(pos.z, -10, 10), t);

        wetGain.gain.linearRampToValueAtTime(reverbMix, t);
        dryGain.gain.linearRampToValueAtTime(1 - reverbMix * 0.5, t);
      }

      source.start(0);
      const renderedBuffer = await offlineCtx.startRendering();

      const wavBlob = bufferToMp3Blob(renderedBuffer, 192);
      downloadBlob(wavBlob, deriveExportFilename(fileName, 'mp3'));
    } catch (err) {
      console.error('Export failed:', err);
      setExportError(err?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [volume]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopSource();
      ctxRef.current?.close();
    };
  }, [stopSource]);

  return {
    loadBuffer,
    play,
    pause,
    seek,
    isPlaying,
    currentTime,
    duration,
    volume,
    setVolume,
    position3D,
    activeSectionId,
    setSections,
    setCurrentTime,
    exportAudio,
    isExporting,
    exportError,
  };
}
