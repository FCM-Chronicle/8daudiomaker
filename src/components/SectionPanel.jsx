/**
 * SectionPanel.jsx — Per-section controls list
 */

import { useCallback } from 'react';
import { SECTION_TYPES, SECTION_COLORS, SECTION_LABELS, SECTION_DESCRIPTIONS } from '../lib/spatialMotions';
import { formatTimeShort } from '../lib/audioUtils';

function Toggle({ checked, onChange, id }) {
  return (
    <label className="toggle-switch" htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        aria-label={`Toggle section ${id}`}
      />
      <span className="toggle-track" />
    </label>
  );
}

export default function SectionPanel({ sections, activeSectionId, onSectionsChange }) {
  const handleTypeChange = useCallback((id, newType) => {
    onSectionsChange(sections.map(s => s.id === id ? { ...s, type: newType } : s));
  }, [sections, onSectionsChange]);

  const handleToggle = useCallback((id, enabled) => {
    onSectionsChange(sections.map(s => s.id === id ? { ...s, enabled } : s));
  }, [sections, onSectionsChange]);

  return (
    <div className="section-panel">
      <div className="section-panel-header">
        <span className="panel-title">Sections</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
        }}>
          {sections.filter(s => s.enabled).length}/{sections.length} ACTIVE
        </span>
      </div>

      <div className="sections-list" role="list">
        {sections.map((section, idx) => {
          const color = SECTION_COLORS[section.type] || '#888';
          const isActive = section.id === activeSectionId;
          return (
            <div
              key={section.id}
              className={`section-item${isActive ? ' active' : ''}`}
              role="listitem"
              style={{
                borderColor: isActive ? hexToRgba(color, 0.5) : 'transparent',
                background: isActive ? hexToRgba(color, 0.08) : undefined,
                opacity: section.enabled ? 1 : 0.45,
              }}
            >
              {/* Color indicator */}
              <div
                className="section-color-bar"
                style={{
                  background: section.enabled ? color : hexToRgba(color, 0.3),
                  boxShadow: isActive ? `0 0 8px ${color}` : 'none',
                }}
              />

              {/* Info */}
              <div className="section-info">
                <div className="section-name" style={{ color: isActive ? color : 'var(--text-primary)' }}>
                  {SECTION_LABELS[section.type]}
                </div>
                <div className="section-meta">
                  {formatTimeShort(section.start)} → {formatTimeShort(section.end)}
                  {' · '}
                  {SECTION_DESCRIPTIONS[section.type]}
                </div>
              </div>

              {/* Type selector */}
              <select
                className="section-type-select"
                value={section.type}
                onChange={(e) => handleTypeChange(section.id, e.target.value)}
                aria-label={`Section ${idx + 1} type`}
                id={`section-type-${section.id}`}
                onClick={e => e.stopPropagation()}
              >
                {SECTION_TYPES.map(t => (
                  <option key={t} value={t}>{SECTION_LABELS[t]}</option>
                ))}
              </select>

              {/* Toggle */}
              <Toggle
                id={`section-toggle-${section.id}`}
                checked={section.enabled}
                onChange={(enabled) => handleToggle(section.id, enabled)}
              />
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        padding: '8px var(--space-md)',
        borderTop: '1px solid var(--border-dim)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        flexShrink: 0,
      }}>
        {SECTION_TYPES.map(type => (
          <div key={type} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.58rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: 1,
              background: SECTION_COLORS[type],
            }} />
            {SECTION_LABELS[type]}
          </div>
        ))}
      </div>
    </div>
  );
}

function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)},${alpha})`;
}
