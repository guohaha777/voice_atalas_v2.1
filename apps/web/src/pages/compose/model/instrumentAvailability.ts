// Availability follows the same arrangement rule that renders the sound; do not guess from instrument names.
import { orchestrateBackground } from '@wanwu-v2/sound-rules/orchestration';
import type { BackgroundPlan, PlayerRoles, SoundingSpan } from '@wanwu-v2/sound-rules/background';

export type InstrumentUnavailable = 'audio' | 'empty' | 'no-part';

export function instrumentUnavailable(
  plan: BackgroundPlan | null,
  fixedAudio: boolean,
  chosen: readonly PlayerRoles[],
  candidate: PlayerRoles,
  sounding: readonly SoundingSpan[],
): InstrumentUnavailable | null {
  if (fixedAudio) return 'audio';
  if (!plan?.notes.length) return 'empty';
  const selection = [...chosen.filter((item) => item.id !== candidate.id), candidate];
  const arranged = orchestrateBackground(plan, selection, sounding);
  const audible = arranged.plan.notes.some(
    (note) => note.length > 0 && arranged.parts[note.part].includes(candidate.id),
  );
  return audible ? null : 'no-part';
}
