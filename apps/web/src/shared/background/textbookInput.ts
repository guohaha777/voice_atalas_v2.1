// Anonymous, provenance-aware input for the composition-only textbook core.
import { TEXTBOOK_COMPOSE_VERSION } from '@wanwu-v2/contracts/textbook-compose';
import type { TextbookComposeInput, TextbookSound } from '@wanwu-v2/contracts/textbook-compose';
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import { briefSound } from '@wanwu-v2/sound-rules/ai-compose';
import { pieceSeconds, timedEvents } from '../creation/arrangementTiming.ts';
import { presetMood } from '../creation/moodCopy.ts';
import { arrangementIdentity } from './compositionIdentity.ts';
export function textbookInput(
  arrangement: Arrangement,
  textbook: TextbookTrack,
): TextbookComposeInput {
  // Simultaneous sounds have no temporal order from their visual rows.
  const canonical = {
    ...arrangement,
    events: [...arrangement.events]
      .sort((a, b) => a.at - b.at || a.unitId.localeCompare(b.unitId) || a.id.localeCompare(b.id))
      .map((event) => ({ ...event, row: 0 })),
  };
  const numbers = new Map<string, number>();
  return {
    version: TEXTBOOK_COMPOSE_VERSION,
    seconds: pieceSeconds(arrangement),
    mood: presetMood(arrangement.mood),
    contentToken: arrangementIdentity(canonical),
    textbook,
    sounds: timedEvents(canonical).map(({ start, end, event, unit }): TextbookSound => {
      if (!numbers.has(unit.id)) numbers.set(unit.id, numbers.size + 1);
      const analysis = unit.analysis && !unit.analysis.silent ? unit.analysis : undefined;
      const shape = unit.shape;
      const chosen = unit.input === 'example-preset' ? ('preset' as const) : ('child' as const);
      return {
        ...briefSound(numbers.get(unit.id)!, start, end, shape, analysis),
        eventId: event.id,
        sources: {
          pitch: shape.pitch ? chosen : analysis ? 'measurement' : 'default',
          length: shape.duration ? chosen : analysis ? 'measurement' : 'default',
          contour: shape.contour ? chosen : 'unknown',
          intensity: shape.intensity ? chosen : analysis ? 'measurement' : 'default',
          pattern: shape.pattern ? chosen : 'default',
          kind: analysis ? 'measurement' : 'default',
          brightness: analysis ? 'measurement' : 'default',
        },
      };
    }),
  };
}
