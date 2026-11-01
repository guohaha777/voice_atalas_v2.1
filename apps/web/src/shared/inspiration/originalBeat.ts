// 听原曲 in the 课本灵感 dialog: the song's own recording with its beat on top, so a teacher hears how the beat sits in
// the song. The recording is measured once in the browser (@wanwu-v2/music-features) only for where its first strong
// beat falls — decoded at MEASURE_RATE, like every recording that is measured; tempo and metre come from the song's
// card. The beat is 万物声场's metronome (./beat.ts), from the first strong beat to the end of the recording; a pickup
// or intro before it has no ticks. Opening a 案例's explanation starts this, so 听原曲 is usually ready by the time it is tapped.
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import { MEASURE_RATE, measure } from '@wanwu-v2/music-features';
import { BACKGROUND_RULES } from '@wanwu-v2/sound-rules/rules';
import { loadAudio } from '../audio/loadAudio.ts';
import { renderBeat, songBeat } from './beat.ts';
import { monoOf } from './teachingCard.ts';

export type OriginalWithBeat = {
  original: AudioBuffer;
  beat: AudioBuffer;
  /** Where the beat starts in the recording (its first strong beat), and its level over the recording (rules). */
  beatAt: number;
  beatGain: number;
};

/** A slow connection gives up rather than leave the button waiting. */
const LOAD_TIMEOUT_MS = 20_000;
const made = new Map<string, Promise<OriginalWithBeat>>();

/** Pure: the first strong beat at or after 0 on the bar grid through `downbeat` (seconds). */
export function firstStrongBeat(
  downbeat: number,
  track: Pick<TextbookTrack, 'tempoBpm' | 'meter'>,
) {
  const bar = (60 / track.tempoBpm) * track.meter;
  return ((downbeat % bar) + bar) % bar;
}

/** Loaded, measured and rendered once per recording and song; later taps start at once. */
export function originalWithBeat(track: TextbookTrack, url: string): Promise<OriginalWithBeat> {
  const key = `${url}|${track.tempoBpm}|${track.meter}`;
  let job = made.get(key);
  if (!job) {
    job = (async () => {
      // Decoded once at the measuring rate; the same buffer plays (the audio clock resamples it).
      const original = await loadAudio(url, { timeoutMs: LOAD_TIMEOUT_MS, rate: MEASURE_RATE });
      const { downbeatSeconds } = measure(monoOf(original), original.sampleRate);
      const beatAt = firstStrongBeat(downbeatSeconds, track);
      const beat = await renderBeat(songBeat(track, Math.max(0.1, original.duration - beatAt)));
      return { original, beat, beatAt, beatGain: BACKGROUND_RULES.beat.withOriginal };
    })();
    made.set(key, job);
    job.catch(() => made.delete(key));
  }
  return job;
}
