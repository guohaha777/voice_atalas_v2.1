// The beat of a textbook song, for 万物声场 and its 课本灵感 dialog: strong and light metronome ticks at the song's tempo
// and metre (@wanwu-v2/sound-rules beatPlan). Nothing else — the full background is 万物成曲's.
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import { beatPlan } from '@wanwu-v2/sound-rules/background';
import { BACKGROUND_RULES } from '@wanwu-v2/sound-rules/rules';
import type { BeatPlan } from '@wanwu-v2/sound-rules/background';
import { renderBackground } from '../audio/renderBackground.ts';

/**
 * Pure: the song's beat for `seconds`. A song without a steady beat (pulse `none`) has no ticks; one whose strong beats
 * are not sure (`even`) has every tick the same, the light one.
 */
export function songBeat(
  track: Pick<TextbookTrack, 'tempoBpm' | 'meter' | 'pulse'>,
  seconds: number,
): BeatPlan {
  const plan = beatPlan({ seconds, tempo: track.tempoBpm, metre: track.meter });
  if (track.pulse === 'none') return { ...plan, notes: [] };
  if (track.pulse === 'even')
    return {
      ...plan,
      notes: plan.notes.map((note) => ({ ...note, accent: BACKGROUND_RULES.beat.weak })),
    };
  return plan;
}
/** Whether a song has a beat to play (free-rhythm songs do not). */
export const hasBeat = (track: Pick<TextbookTrack, 'pulse'>) => track.pulse !== 'none';

/** Only the metronome, on the rhythm part (the plan has nothing else). */
export const renderBeat = (plan: BeatPlan) =>
  renderBackground(
    plan,
    { chord: [], bass: [], melody: [], rhythm: ['metronome'] },
    { metronome: 'click' },
  );
