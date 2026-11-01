// What the local background is made from, derived from the work only — the same arrangement data the field, the score
// and the playback read, so the melody's gaps line up with the child's sounds on both pages.
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import { BACKGROUND_REQUEST_VERSION } from '@wanwu-v2/contracts/background';
import type { BackgroundBrief, ComposePlan } from '@wanwu-v2/contracts/background';
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import type { Inspiration } from '@wanwu-v2/contracts/work';
import { briefSound } from '@wanwu-v2/sound-rules/ai-compose';
import type { BackgroundInput } from '@wanwu-v2/sound-rules/background';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';
import { pieceSeconds, timedEvents } from '../creation/arrangementTiming.ts';
import { presetMood } from '../creation/moodCopy.ts';
import { arrangementIdentity } from './compositionIdentity.ts';

/** The card an inspiration points to: a textbook song, or teaching music once its card is made (null until then). */
export function inspirationTrack(inspiration: Inspiration, tracks: readonly TextbookTrack[]) {
  const id =
    inspiration.kind === 'textbook'
      ? inspiration.entryId
      : inspiration.kind === 'teaching-music'
        ? inspiration.musicId
        : null;
  return id ? (tracks.find((track) => track.id === id) ?? null) : null;
}
/** The song the background follows: a free-rhythm one (散板, 山歌) has no tempo or bar to follow, so none. */
const followedTrack = (track: TextbookTrack | null) =>
  track && track.pulse !== 'none' ? track : null;

/** Plan input: the piece's real length, when the child's sounds are heard, the mood and the chosen textbook song. */
export function backgroundInput(
  arrangement: Arrangement,
  inspiration: Inspiration,
  tracks: readonly TextbookTrack[],
): BackgroundInput {
  return {
    seconds: pieceSeconds(arrangement),
    // How each sound sounds, for the melody's answer: the child's choices first, 声音体检's 高低 when 高低 was not chosen.
    sounding: timedEvents(arrangement).map(({ start, end, unit }) => {
      const pitch = unit.shape.pitch ?? unit.analysis?.band;
      const { contour, intensity } = unit.shape;
      return {
        start,
        end,
        ...(pitch ? { pitch } : {}),
        ...(contour ? { contour } : {}),
        ...(intensity ? { intensity } : {}),
      };
    }),
    mood: presetMood(arrangement.mood),
    textbook: followedTrack(inspirationTrack(inspiration, tracks)),
    seed: arrangement.id,
  };
}

/**
 * The anonymous brief an AI background request carries (background-request-v2): the piece's length and mood, and every
 * placed sound with its number (the same sound keeps its number), when it is heard and its features — the child's
 * choices first, the 声音体检 where none was made. No textbook song (an AI background follows the child's piece only),
 * no recordings, sound names, makers or places. `attempt` and `previous` let 换一首 ask for a different piece.
 */
export function backgroundBrief(
  arrangement: Arrangement,
  instruments: readonly string[],
  attempt = 0,
  previous: ComposePlan | null = null,
): BackgroundBrief | null {
  const events = timedEvents(arrangement);
  if (!events.length) return null;
  const numbers = new Map<string, number>();
  const sounds = events.map(({ start, end, unit }) => {
    if (!numbers.has(unit.id)) numbers.set(unit.id, numbers.size + 1);
    return briefSound(numbers.get(unit.id)!, start, end, unit.shape, unit.analysis);
  });
  return {
    version: BACKGROUND_REQUEST_VERSION,
    workId: arrangement.id,
    identity: arrangementIdentity(arrangement),
    seconds: pieceSeconds(arrangement),
    mood: presetMood(arrangement.mood),
    sounds,
    attempt,
    previous,
    instruments: [...instruments],
    rules: { ...RULE_VERSIONS },
  };
}
