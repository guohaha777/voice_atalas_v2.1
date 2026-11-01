// Local identity for AI composition. Names, makers, row layout and edit timestamps are deliberately excluded.
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { BackgroundBrief } from '@wanwu-v2/contracts/background';
import { compositionToken } from '@wanwu-v2/sound-rules/composition-identity';
import { AI_COMPOSE_RULES } from '@wanwu-v2/sound-rules/ai-compose';
import { timedEvents } from '../creation/arrangementTiming.ts';

/** Source ids remain local; only a content token is sent with the anonymous musical brief. */
export function arrangementIdentity(arrangement: Arrangement): string {
  const sounds = timedEvents(arrangement).map(({ start, end, event, unit }) => ({
    source: unit.sourceId,
    start,
    end,
    clip: [event.clip.startMs, event.clip.endMs],
    shape: [
      unit.shape.pitch,
      unit.shape.duration,
      unit.shape.contour,
      unit.shape.intensity,
      unit.shape.pattern,
    ],
    analysis: unit.analysis ?? null,
  }));
  return `ai:${compositionToken(JSON.stringify(sounds))}`;
}

/** Bump the composition rules version when prompts / note interpretation change, so old results cannot mask them. */
export const backgroundCacheKey = (brief: BackgroundBrief) =>
  JSON.stringify({
    version: brief.version,
    composition: AI_COMPOSE_RULES.version,
    rules: brief.rules,
    identity: brief.identity,
    seconds: brief.seconds,
    mood: brief.mood,
    sounds: brief.sounds,
  });
