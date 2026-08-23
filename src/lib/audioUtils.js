/**
 * audioUtils.js — Helper functions for Web Audio API operations
 */

/** Format seconds as MM:SS.ms */
export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '00:00.000';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Format seconds as MM:SS */
export function formatTimeShort(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Decode an AudioBuffer and compute RMS per window for waveform display.
 * Returns Float32Array of normalized amplitudes [0, 1].
 */
export function computeWaveformData(audioBuffer, numBars = 800) {
  const channelData = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / numBars);
  const waveform = new Float32Array(numBars);
  let maxRms = 0;

  for (let i = 0; i < numBars; i++) {
    let sumSq = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const sample = channelData[start + j] || 0;
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / blockSize);
    waveform[i] = rms;
    if (rms > maxRms) maxRms = rms;
  }

  // Normalize
  if (maxRms > 0) {
    for (let i = 0; i < numBars; i++) {
      waveform[i] /= maxRms;
    }
  }
  return waveform;
}

/**
 * Smart energy and frequency-based section detection.
 * Uses OfflineAudioContext to filter low (kick/bass) and high (cymbals/synths) frequencies.
 * Finds dynamic number of boundaries based on significant energy changes.
 */
export async function detectSectionBoundaries(audioBuffer, duration) {
  const sampleRate = audioBuffer.sampleRate;
  
  // Create offline contexts to process the audio (fast C++ native processing)
  // We use 1 channel for faster processing
  const offlineCtxLow = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, audioBuffer.length, sampleRate);
  const offlineCtxHigh = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, audioBuffer.length, sampleRate);

  // Source nodes
  const sourceLow = offlineCtxLow.createBufferSource();
  // Downmix to mono by just taking channel 0
  const monoBuffer = offlineCtxLow.createBuffer(1, audioBuffer.length, sampleRate);
  monoBuffer.copyToChannel(audioBuffer.getChannelData(0), 0);
  sourceLow.buffer = monoBuffer;

  const sourceHigh = offlineCtxHigh.createBufferSource();
  sourceHigh.buffer = monoBuffer;

  // Lowpass filter for bass/kick
  const lowpass = offlineCtxLow.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 150; 

  // Highpass filter for cymbals/air
  const highpass = offlineCtxHigh.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 4000;

  sourceLow.connect(lowpass);
  lowpass.connect(offlineCtxLow.destination);
  sourceLow.start(0);

  sourceHigh.connect(highpass);
  highpass.connect(offlineCtxHigh.destination);
  sourceHigh.start(0);

  // Render both parallelly
  const [lowBuffer, highBuffer] = await Promise.all([
    offlineCtxLow.startRendering(),
    offlineCtxHigh.startRendering()
  ]);

  const lowData = lowBuffer.getChannelData(0);
  const highData = highBuffer.getChannelData(0);

  // Compute RMS in 0.5s windows
  const windowSec = 0.5;
  const windowSize = Math.floor(sampleRate * windowSec);
  const numWindows = Math.floor(lowData.length / windowSize);

  const combinedEnergy = new Float32Array(numWindows);

  for (let i = 0; i < numWindows; i++) {
    let sumLow = 0;
    let sumHigh = 0;
    const offset = i * windowSize;
    for (let j = 0; j < windowSize; j++) {
      const l = lowData[offset + j] || 0;
      const h = highData[offset + j] || 0;
      sumLow += l * l;
      sumHigh += h * h;
    }
    const rmsLow = Math.sqrt(sumLow / windowSize);
    const rmsHigh = Math.sqrt(sumHigh / windowSize);
    
    // Combine to get a "rhythm/impact" energy signature
    combinedEnergy[i] = rmsLow + (rmsHigh * 1.5); 
  }

  // Smooth lightly (1s moving average = 2 windows on each side)
  const smoothed = new Float32Array(numWindows);
  const smoothK = 2;
  for (let i = 0; i < numWindows; i++) {
    let s = 0, count = 0;
    for (let k = -smoothK; k <= smoothK; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < numWindows) { s += combinedEnergy[idx]; count++; }
    }
    smoothed[i] = s / count;
  }

  // Calculate derivative (change in energy)
  const diffs = new Float32Array(numWindows - 1);
  let maxDiff = 0;
  for (let i = 0; i < numWindows - 1; i++) {
    diffs[i] = Math.abs(smoothed[i + 1] - smoothed[i]);
    if (diffs[i] > maxDiff) maxDiff = diffs[i];
  }

  // Find peaks in diffs that exceed a threshold (top 15% of changes)
  const threshold = maxDiff * 0.15;
  const margin = Math.floor(numWindows * 0.05); // Ignore first/last 5%
  const peaks = [];
  
  for (let i = margin; i < numWindows - 1 - margin; i++) {
    if (diffs[i] > threshold && diffs[i] > diffs[i - 1] && diffs[i] > diffs[i + 1]) {
      peaks.push({ idx: i, val: diffs[i] });
    }
  }

  // Sort by time
  peaks.sort((a, b) => a.idx - b.idx);

  // Filter out peaks that are too close to each other (minimum 8 seconds apart)
  const minGapWindows = Math.floor(8 / windowSec); 
  const filteredPeaks = [];
  for (const peak of peaks) {
    if (filteredPeaks.length === 0) {
      filteredPeaks.push(peak);
    } else {
      const lastPeak = filteredPeaks[filteredPeaks.length - 1];
      if (peak.idx - lastPeak.idx >= minGapWindows) {
        filteredPeaks.push(peak);
      } else {
        // If they are too close, keep the stronger one
        if (peak.val > lastPeak.val) {
          filteredPeaks[filteredPeaks.length - 1] = peak;
        }
      }
    }
  }

  // Convert to seconds
  const boundaries = filteredPeaks.map(c => c.idx * windowSec);
  
  // Fallback if no sections detected but song is long
  if (boundaries.length === 0 && duration > 30) {
    for (let i = 30; i < duration - 10; i += 30) {
      boundaries.push(i);
    }
  }

  return boundaries;
}

/** Clamp a value between min and max */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Linear interpolation */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Intelligent section labeling based on RMS energy of each section.
 * Replaces the rigid sequential assignment.
 */
export function assignSectionTypes(boundaries, audioBuffer) {
  const allBoundaries = [0, ...boundaries, audioBuffer.duration];
  const numSections = allBoundaries.length - 1;
  const sections = [];
  
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  let maxEnergy = 0;
  
  // 1. Calculate average RMS energy for each section
  for (let i = 0; i < numSections; i++) {
    const startIdx = Math.floor(allBoundaries[i] * sampleRate);
    const endIdx = Math.floor(allBoundaries[i+1] * sampleRate);
    let sumSq = 0;
    // Step by 100 samples to keep it fast
    const step = 100;
    let count = 0;
    for (let j = startIdx; j < endIdx; j += step) {
      const val = channelData[j] || 0;
      sumSq += val * val;
      count++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    if (rms > maxEnergy) maxEnergy = rms;
    
    sections.push({
       id: i,
       start: allBoundaries[i],
       end: allBoundaries[i+1],
       energy: rms,
       enabled: true,
       type: 'verse' // Default, will be replaced
    });
  }
  
  // 2. Normalize energy (0 to 1)
  sections.forEach(s => s.energy = maxEnergy > 0 ? s.energy / maxEnergy : 0);
  
  // 3. Assign types using heuristics
  const CHORUS_THRESHOLD = 0.75; // Top 25% energy is usually chorus
  let chorusFound = false;
  
  for (let i = 0; i < numSections; i++) {
    const s = sections[i];
    const isFirst = i === 0;
    const isLast = i === numSections - 1;
    const prev = i > 0 ? sections[i-1] : null;
    const next = i < numSections - 1 ? sections[i+1] : null;
    
    if (isFirst) {
      s.type = s.energy > CHORUS_THRESHOLD ? 'chorus' : 'intro';
      if (s.type === 'chorus') chorusFound = true;
    } else if (isLast) {
      s.type = 'outro';
    } else if (s.energy > CHORUS_THRESHOLD) {
      s.type = 'chorus';
      chorusFound = true;
    } else {
      // Lower energy sections
      if (prev && prev.type === 'chorus') {
        // Drop in energy after chorus -> usually 2nd verse or interlude
        s.type = 'verse'; 
      } else if (next && next.energy > CHORUS_THRESHOLD && s.energy > (prev ? prev.energy : 0)) {
        // Energy rising before a chorus
        s.type = 'pre-chorus';
      } else if (prev && prev.type === 'chorus' && s.energy > 0.6) {
        // High-ish energy after chorus but not chorus
        s.type = 'post-chorus';
      } else {
        // Late in the song, low/medium energy, different from verse -> bridge
        if (chorusFound && i >= numSections * 0.6 && i < numSections - 1) {
          s.type = 'bridge';
        } else {
          s.type = 'verse';
        }
      }
    }
  }
  
  return sections;
}
