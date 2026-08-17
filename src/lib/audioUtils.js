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
 * Simple energy-based section detection.
 * Finds 7 boundary points (creating 8 segments) by looking for
 * energy troughs after sustained peaks in RMS data.
 */
export function detectSectionBoundaries(audioBuffer, duration, numSections = 8) {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const windowSec = 0.5;
  const windowSize = Math.floor(sampleRate * windowSec);
  const numWindows = Math.floor(channelData.length / windowSize);

  // Compute RMS per window
  const rms = new Float32Array(numWindows);
  for (let i = 0; i < numWindows; i++) {
    let sum = 0;
    const offset = i * windowSize;
    for (let j = 0; j < windowSize; j++) {
      const s = channelData[offset + j] || 0;
      sum += s * s;
    }
    rms[i] = Math.sqrt(sum / windowSize);
  }

  // Smooth RMS (moving average)
  const smoothed = new Float32Array(numWindows);
  const smoothK = 5;
  for (let i = 0; i < numWindows; i++) {
    let s = 0, count = 0;
    for (let k = -smoothK; k <= smoothK; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < numWindows) { s += rms[idx]; count++; }
    }
    smoothed[i] = s / count;
  }

  // Find the (numSections - 1) most significant energy changes
  // as derivative of smoothed RMS
  const diffs = new Float32Array(numWindows - 1);
  for (let i = 0; i < numWindows - 1; i++) {
    diffs[i] = Math.abs(smoothed[i + 1] - smoothed[i]);
  }

  // Find peaks in diffs (local maxima), excluding first/last 5%
  const margin = Math.floor(numWindows * 0.05);
  const peaks = [];
  for (let i = margin; i < numWindows - 1 - margin; i++) {
    if (diffs[i] > diffs[i - 1] && diffs[i] > diffs[i + 1]) {
      peaks.push({ idx: i, val: diffs[i] });
    }
  }

  // Sort by value, take top (numSections - 1) well-spaced ones
  peaks.sort((a, b) => b.val - a.val);
  const minGap = Math.floor(numWindows / (numSections * 2));
  const chosen = [];

  for (const peak of peaks) {
    if (chosen.length >= numSections - 1) break;
    const tooClose = chosen.some(c => Math.abs(c.idx - peak.idx) < minGap);
    if (!tooClose) chosen.push(peak);
  }

  // If we don't have enough boundaries, distribute evenly
  while (chosen.length < numSections - 1) {
    const idealIdx = Math.floor(numWindows * (chosen.length + 1) / numSections);
    chosen.push({ idx: idealIdx, val: 0 });
  }

  // Sort by time
  chosen.sort((a, b) => a.idx - b.idx);

  // Convert to seconds
  const boundaries = chosen.map(c => (c.idx * windowSec));
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
