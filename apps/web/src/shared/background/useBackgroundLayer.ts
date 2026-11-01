import type { TextbookSnapshot } from '@wanwu-v2/contracts/textbook-compose';
import { resolveComposeBackground } from './composeBackground.ts';
import { renderArrangedBackground } from '@wanwu-v2/audio-engine/orchestration';
import { useMemo, useRef } from 'react';
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import type { ComposeSettings } from '@wanwu-v2/contracts/work';
import { assignParts, backgroundPlan } from '@wanwu-v2/sound-rules/background';
import { MIX_RULES } from '@wanwu-v2/sound-rules/mix';
import { renderBackground } from '../audio/renderBackground.ts';
import { backgroundInput, inspirationTrack } from './backgroundLayer.ts';
import type { Instrument } from './instruments.ts';

/** Renders kept at once (a few lengths and arrangements); older ones are let go. */
const KEEP = 6;

/**
 * The background layer both pages play under the child's sounds: who plays it (instruments split the parts, none =
 * the original voice), the textbook song it borrows from, its level, and its renders (cached per plan input). The
 * notes come from the local rules (@wanwu-v2/sound-rules/background); the arrangement is read when it is played.
 */
export function useBackgroundLayer(
  settings: ComposeSettings,
  instruments: readonly Instrument[],
  tracks: readonly TextbookTrack[],
  arranged = false,
  saved?: TextbookSnapshot,
) {
  const { background, inspiration } = settings;
  const renders = useRef(new Map<string, Promise<AudioBuffer>>());
  /** Instruments playing the background; none chosen = the original voice. */
  const chosen = useMemo(
    () => background.instruments.flatMap((id) => instruments.filter((item) => item.id === id)),
    [background.instruments, instruments],
  );
  const parts = useMemo(() => assignParts(chosen), [chosen]);
  /** How each chosen instrument sounds (by id), for the renderer. */
  const voices = useMemo(
    () => Object.fromEntries(chosen.map((item) => [item.id, item.recipe])),
    [chosen],
  );
  const track = inspirationTrack(inspiration, tracks);
  const gain = background.enabled ? background.volume * MIX_RULES.backgroundMaxGain : 0;
  /** Changes when who plays it or what it borrows changes (the arrangement is read at play time). */
  const key = `${chosen.map((item) => item.id).join('+') || 'original'}|${JSON.stringify(track) ?? '-'}|${saved?.identity ?? '-'}`;
  const resolved = useMemo(
    () => new WeakMap<Arrangement, ReturnType<typeof resolveComposeBackground>>(),
    [key, inspiration, tracks, saved],
  );
  const resolve = (arrangement: Arrangement) => {
    let result = resolved.get(arrangement);
    if (!result) {
      result = resolveComposeBackground(arrangement, inspiration, tracks, saved);
      resolved.set(arrangement, result);
    }
    return result;
  };
  const plan = (arrangement: Arrangement) =>
    arranged
      ? resolve(arrangement).plan
      : backgroundPlan(backgroundInput(arrangement, inspiration, tracks));
  /** The one place that picks the renderer: 成曲 arranges the chosen instruments, the sound field keeps the raw one. */
  const render = (background: ReturnType<typeof backgroundPlan>, arrangement: Arrangement) =>
    arranged
      ? renderArrangedBackground(
          background,
          chosen,
          backgroundInput(arrangement, inspiration, tracks).sounding,
        )
      : renderBackground(background, parts, voices);
  const buffer = (arrangement: Arrangement) => {
    const input = backgroundInput(arrangement, inspiration, tracks);
    const music = plan(arrangement);
    const cacheKey = `${key}|${JSON.stringify(input)}|${JSON.stringify(music)}`;
    const cache = renders.current;
    let made = cache.get(cacheKey);
    // Rendered once per input; a failed render is forgotten; only the last KEEP are kept.
    if (!made) {
      made = render(music, arrangement);
      cache.set(cacheKey, made);
      made.catch(() => cache.delete(cacheKey));
      while (cache.size > KEEP) cache.delete(cache.keys().next().value!);
    }
    return made;
  };
  return {
    enabled: background.enabled,
    chosen,
    parts,
    voices,
    track,
    gain,
    key,
    plan,
    buffer,
    render,
    resolve,
  };
}
export type BackgroundLayer = ReturnType<typeof useBackgroundLayer>;
