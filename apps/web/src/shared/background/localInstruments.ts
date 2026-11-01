// The instrument library of this version (decided 2026-10-30): three instruments synthesised in the browser (no audio
// files, no licence needed), shipped with the page; more are shown as "coming" (not playable).
import type { BackgroundLibrary } from './library.ts';
import { LOCAL_INSTRUMENTS } from '@wanwu-v2/audio-engine/instruments';

/** Names of instruments planned for later, shown greyed as 即将开放 (not playable). */
export const comingInstruments = ['钢琴', '笛子', '沙锤'] as const;

export const localBackgroundLibrary: BackgroundLibrary = {
  async list() {
    return { origin: 'example', instruments: LOCAL_INSTRUMENTS, coming: comingInstruments };
  },
};
