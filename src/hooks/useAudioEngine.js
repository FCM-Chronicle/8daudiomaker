/**
 * useAudioEngine.js
 * Core Web Audio API hook.
 * Manages AudioContext, PannerNode (HRTF), ConvolverNode (reverb),
 * section-aware animation loop, and smooth position transitions.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { getSectionPosition, getSectionReverb } from '../lib/spatialMotions';
import { clamp } from '../lib/audioUtils';

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
    const sections = sectionsRef.current;
    for (const s of sections) {
      if (s.enabled && t >= s.start && t < s.end) return s;
    }
    return null;
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
  };
}
