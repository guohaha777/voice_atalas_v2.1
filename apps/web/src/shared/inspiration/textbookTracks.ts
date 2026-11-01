// The textbook catalogue shipped with the page: one feature card per song (contract textbook-v1). Only features — no
// audio, score or melody of the song is here. Made 2026-10-30 with the same pipeline teachers will use: numbers measured
// by @wanwu-v2/music-features, then qwen3.8-omni-flash heard a 30 s excerpt and chose the characteristic rhythm, mood
// and the child's line (prompt textbook-features-prompt-v1). Both re-measured the same day once the bass was read:
// 法国号's metre (oom-pah-pah → 3/4; the model then chose its rhythm in 3/4), 小鸟在唱歌's beat (it had been on the
// off-beat; its rhythm is now the program's pick on the real beat — the model's answer contradicted itself). By ear
// (2026-10-30): 小鸟在唱歌 is 2/4 at 96 on that beat; its child line is the audio model's answer for the corrected
// rhythm (the old one described the off-beat bar). Its rhythm, 法国号 and the lines are not yet checked by ear, so
// earChecked stays false. Change a card here, run npm test.
import { TEXTBOOK_CONTRACT_VERSION } from '@wanwu-v2/contracts/textbook';
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import type { InspirationCatalog } from './catalog.ts';

const measured = { numbers: 'code', words: 'ai', confidence: 0.7, earChecked: false } as const;

export const textbookTracks: readonly TextbookTrack[] = [
  {
    version: TEXTBOOK_CONTRACT_VERSION,
    id: 'tb:ry1:u2:birds-singing',
    title: '小鸟在唱歌',
    source: { edition: '人音版', grade: 1, unit: 2, title: '小鸟在唱歌' },
    tempoBpm: 96,
    meter: 2,
    rhythmCell: [0.5, 0.5, 0.5, 0.25, 0.25],
    onsetDensity: 'medium',
    pitchRange: { low: 59, high: 84 },
    brightness: 'mid',
    mode: 'major',
    tonic: 0,
    repetition: 'medium',
    mood: 'lively',
    childLine: '小鸟拍拍翅膀飞起来',
    extraction: measured,
  },
  {
    version: TEXTBOOK_CONTRACT_VERSION,
    id: 'tb:ry1:u7:french-horn',
    title: '法国号',
    source: { edition: '人音版', grade: 1, unit: 7, title: '法国号' },
    tempoBpm: 136,
    meter: 3,
    rhythmCell: [0.75, 0.25, 1, 1],
    onsetDensity: 'medium',
    pitchRange: { low: 58, high: 82 },
    brightness: 'bright',
    mode: 'major',
    tonic: 5,
    repetition: 'low',
    mood: 'lively',
    childLine: '像号角吹出长长的音',
    extraction: measured,
  },
];

export const bundledInspirationCatalog: InspirationCatalog = {
  async list() {
    return { origin: 'catalogue', entries: textbookTracks };
  },
};
