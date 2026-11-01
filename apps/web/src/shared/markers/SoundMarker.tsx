import type { ReactNode } from 'react';
import { ArtPicture } from '../media/ArtPicture.tsx';
import { markerFor, markerNumber } from './markers.ts';
import { spiritPoses } from './spiritPoses.ts';
import styles from './SoundMarker.module.css';

const INK = '#111510';

/**
 * Marker artwork with a live label overlaid: by default the number, or the maker's `name` when the card has one, or the
 * caller's content (e.g. 声音诞生's editable name).
 * Pass `label={null}` for small sizes where a label would not be legible. Size comes from the caller's class (width).
 * `face` gives the marker the sound character's eyes (same places as on 声音诞生): `calm` looks out and blinks now and
 * then, `happy` closes into ^ ^ — for "this one is sounding now". Decorative only.
 */
export function SoundMarker({
  index,
  className = '',
  label,
  name,
  face,
}: {
  index: number;
  className?: string;
  label?: ReactNode;
  name?: string | null;
  face?: 'calm' | 'happy';
}) {
  const marker = markerFor(index);
  const pose = spiritPoses[marker.id];
  const { crop } = marker;
  return (
    <span className={`${styles.marker} ${className}`} data-marker={marker.id} data-face={face}>
      <ArtPicture
        variants={marker.variants}
        className={styles.art}
        fallback={<span className={styles.shape} />}
      />
      {face && pose && (
        <svg
          className={styles.face}
          viewBox={`${crop.left} ${crop.top} ${crop.width} ${crop.height}`}
          aria-hidden="true"
        >
          {pose.eyes.map(([x, y, angle, rx, ry], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
              {face === 'happy' ? (
                <path
                  d={`M${-rx * 0.8} ${ry * 0.25}Q0 ${-ry * 0.8} ${rx * 0.8} ${ry * 0.25}`}
                  fill="none"
                  stroke={INK}
                  strokeWidth="22"
                  strokeLinecap="round"
                />
              ) : (
                <g className={styles.eye}>
                  <ellipse
                    cx="8"
                    cy="2"
                    rx={rx}
                    ry={ry * (pose.openness ?? 1)}
                    fill="#777a72"
                    opacity=".45"
                  />
                  <ellipse rx={rx} ry={ry * (pose.openness ?? 1)} fill="#fffefa" />
                  <ellipse
                    cx="2"
                    cy={ry * 0.08}
                    rx={rx * 0.48}
                    ry={ry * 0.5 * (pose.openness ?? 1)}
                    fill={INK}
                  />
                </g>
              )}
            </g>
          ))}
        </svg>
      )}
      {label !== null && (
        <span className={styles.label}>
          {label ?? (name ? <span className={styles.name}>{name}</span> : markerNumber(index))}
        </span>
      )}
    </span>
  );
}
