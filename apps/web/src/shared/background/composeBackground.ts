// One pure resolver for current textbook music and saved layers; the sound field does not call this.
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { Inspiration } from '@wanwu-v2/contracts/work';
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import { isTextbookSnapshot } from '@wanwu-v2/contracts/textbook-compose';
import type { TextbookSnapshot } from '@wanwu-v2/contracts/textbook-compose';
import { composeTextbook } from '@wanwu-v2/sound-rules/textbook-compose';
import { backgroundPlan } from '@wanwu-v2/sound-rules/background';
import type { BackgroundPlan } from '@wanwu-v2/sound-rules/background';
import { backgroundInput, inspirationTrack } from './backgroundLayer.ts';
import { textbookInput } from './textbookInput.ts';
export function resolveComposeBackground(
  arrangement: Arrangement,
  inspiration: Inspiration,
  tracks: readonly TextbookTrack[],
  saved?: TextbookSnapshot,
  /** 换一换: another version than the first; a saved piece keeps its own until one is asked for. */
  take = 0,
) {
  const local = () => backgroundPlan(backgroundInput(arrangement, inspiration, tracks));
  const id =
    inspiration.kind === 'textbook'
      ? inspiration.entryId
      : inspiration.kind === 'teaching-music'
        ? inspiration.musicId
        : null;
  if (!id) return { plan: local(), snapshot: null, error: null };
  const track = inspirationTrack(inspiration, tracks);
  if (!take && saved && isTextbookSnapshot(saved) && saved.track.id === id) {
    const input = textbookInput(arrangement, saved.track);
    if (
      saved.inputToken === input.contentToken &&
      saved.mood === input.mood &&
      saved.music.seconds === input.seconds
    )
      return { plan: saved.music as BackgroundPlan, snapshot: saved, error: null };
  }
  if (!track) return { plan: { ...local(), notes: [] }, snapshot: null, error: 'missing-track' };
  const input = textbookInput(arrangement, track, take),
    made = composeTextbook(input);
  if (made.status !== 'ready')
    return { plan: { ...local(), notes: [] }, snapshot: null, error: made.reason };
  const snapshot: TextbookSnapshot = {
    version: 'textbook-snapshot-v1',
    identity: made.identity,
    inputToken: input.contentToken!,
    mood: input.mood,
    track: structuredClone(track),
    references: made.quotes,
    music: { ...made.music, textbook: track.id },
  };
  return { plan: made.music, snapshot, error: null };
}
