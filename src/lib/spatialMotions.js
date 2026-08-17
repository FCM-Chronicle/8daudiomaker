/**
 * spatialMotions.js
 * Per-section PannerNode trajectory calculators.
 * Each function receives (t, duration) and returns { x, y, z }
 * where t is time elapsed in the section (seconds).
 */

export const SECTION_TYPES = [
  'intro', 'verse', 'pre-chorus', 'chorus',
  'post-chorus', 'interlude', 'bridge', 'outro'
];

export const SECTION_COLORS = {
  'intro':       '#6c63ff',
  'verse':       '#00e5ff',
  'pre-chorus':  '#ff6b6b',
  'chorus':      '#f5a623',
  'post-chorus': '#ffd93d',
  'interlude':   '#6bcb77',
  'bridge':      '#ff9ff3',
  'outro':       '#a29bfe',
};

export const SECTION_LABELS = {
  'intro':       'INTRO',
  'verse':       'VERSE',
  'pre-chorus':  'PRE-CHORUS',
  'chorus':      'CHORUS',
  'post-chorus': 'POST-CHORUS',
  'interlude':   'INTERLUDE',
  'bridge':      'BRIDGE',
  'outro':       'OUTRO',
};

export const SECTION_DESCRIPTIONS = {
  'intro':       'Rear pendulum sweep',
  'verse':       'L/R stereo pan',
  'pre-chorus':  'Front → rear pass',
  'chorus':      'Circular orbit R=3',
  'post-chorus': 'Orbit + reverb rise',
  'interlude':   '8-compass cycle',
  'bridge':      '1 rotation + expand',
  'outro':       'Ascent fade Y↑',
};

// Compass positions (XZ plane, Y=0)
const COMPASS = [
  { x:  0, z:  3 }, // N
  { x: -2.1, z:  2.1 }, // NW
  { x: -3, z:  0 }, // W
  { x: -2.1, z: -2.1 }, // SW
  { x:  0, z: -3 }, // S
  { x:  2.1, z: -2.1 }, // SE
  { x:  3, z:  0 }, // E
  { x:  2.1, z:  2.1 }, // NE
];

/**
 * Get position for a section type at time t within the section.
 * @param {string} type - section type key
 * @param {number} t - elapsed time in seconds within section
 * @param {number} duration - total section duration in seconds
 * @returns {{ x: number, y: number, z: number }}
 */
export function getSectionPosition(type, t, duration) {
  const progress = duration > 0 ? Math.min(t / duration, 1) : 0;

  switch (type) {
    case 'intro': {
      // Slow pendulum behind head: Z < 0, X: -2 → 2 (sine wave)
      const period = 4; // seconds per sweep
      const x = 2 * Math.sin((t / period) * Math.PI * 2);
      return { x, y: 0, z: -2 };
    }

    case 'verse': {
      // L/R constant pan X: -3 ↔ 3
      const period = 3;
      const x = 3 * Math.sin((t / period) * Math.PI * 2);
      return { x, y: 0, z: 0.5 };
    }

    case 'pre-chorus': {
      // Front to back: Z: 3 → -3
      const z = 3 - 6 * progress;
      return { x: 0, y: 0, z };
    }

    case 'chorus': {
      // Full circular orbit R=3, front-weighted start
      const angle = (t / 5) * Math.PI * 2; // ~5s per revolution
      return {
        x: 3 * Math.sin(angle),
        y: 0,
        z: 3 * Math.cos(angle),
      };
    }

    case 'post-chorus': {
      // Same orbit as chorus but faster + slight elevation
      const angle = (t / 3.5) * Math.PI * 2;
      return {
        x: 3 * Math.sin(angle),
        y: 0.5 * progress,
        z: 3 * Math.cos(angle),
      };
    }

    case 'interlude': {
      // 8-compass-point step cycle, ~1.5s per point
      const stepDuration = 1.5;
      const idx = Math.floor(t / stepDuration) % 8;
      const nextIdx = (idx + 1) % 8;
      const stepT = (t % stepDuration) / stepDuration;
      // Smooth lerp between steps
      const cur = COMPASS[idx];
      const nxt = COMPASS[nextIdx];
      const lerp = easeInOut(stepT);
      return {
        x: cur.x + (nxt.x - cur.x) * lerp,
        y: 0,
        z: cur.z + (nxt.z - cur.z) * lerp,
      };
    }

    case 'bridge': {
      if (progress < 0.4) {
        // One full rotation in first 40%
        const rotProgress = progress / 0.4;
        const angle = rotProgress * Math.PI * 2;
        return {
          x: 3 * Math.sin(angle),
          y: 0,
          z: 3 * Math.cos(angle),
        };
      } else {
        // Expand Z from -3 to 3, X widens
        const expandProgress = (progress - 0.4) / 0.6;
        const z = -3 + 6 * expandProgress;
        const xSpread = 1 + 2 * expandProgress;
        const x = xSpread * Math.sin(t * 1.5);
        return { x, y: 0, z };
      }
    }

    case 'outro': {
      // Ascend Y: 0 → 5, fade (handled separately)
      const y = 5 * progress;
      const x = 0.5 * Math.sin(t * 0.8);
      return { x, y, z: 0 };
    }

    default:
      return { x: 0, y: 0, z: 1 };
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Get reverb mix for a section type.
 * 0 = dry, 1 = fully wet
 */
export function getSectionReverb(type, t, duration) {
  const progress = duration > 0 ? Math.min(t / duration, 1) : 0;
  switch (type) {
    case 'chorus':      return 0.3;
    case 'post-chorus': return 0.3 + 0.4 * progress;
    case 'bridge':      return 0.4;
    case 'outro':       return 0.2 + 0.5 * progress;
    default:            return 0.15;
  }
}

/**
 * Default section breakdown for a new file (even splits).
 */
export function generateDefaultSections(duration) {
  const names = SECTION_TYPES;
  const count = names.length;
  const segLen = duration / count;
  return names.map((type, i) => ({
    id: i,
    type,
    start: i * segLen,
    end: (i + 1) * segLen,
    enabled: true,
  }));
}
