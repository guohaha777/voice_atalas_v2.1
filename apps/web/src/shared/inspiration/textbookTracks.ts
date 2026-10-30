// The textbook catalogue shipped with the page: one feature card per song (contract textbook-v1). Only features — no
// audio, score or melody of the song is here. Made 2026-10-30 with the same pipeline teachers will use: numbers measured
// by @wanwu-v2/music-features, then qwen3.8-omni-flash heard a 30 s excerpt and chose the characteristic rhythm, mood
// and the child's line (prompt textbook-features-prompt-v1). Not yet checked by ear. Change a card here, run npm test.
import {TEXTBOOK_CONTRACT_VERSION} from '@wanwu-v2/contracts/textbook';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {InspirationCatalog} from './catalog';

const measured={numbers:'code',words:'ai',confidence:.7,earChecked:false} as const;

export const textbookTracks:readonly TextbookTrack[]=[
 {version:TEXTBOOK_CONTRACT_VERSION,id:'tb:ry1:u2:birds-singing',title:'小鸟在唱歌',source:{edition:'人音版',grade:1,unit:2,title:'小鸟在唱歌'},
  tempoBpm:96,meter:2,rhythmCell:[.5,.5,1],onsetDensity:'medium',pitchRange:{low:59,high:84},brightness:'mid',mode:'major',tonic:0,repetition:'medium',
  mood:'lively',childLine:'小鸟拍拍翅膀，飞一下停一下',extraction:measured},
 {version:TEXTBOOK_CONTRACT_VERSION,id:'tb:ry1:u7:french-horn',title:'法国号',source:{edition:'人音版',grade:1,unit:7,title:'法国号'},
  tempoBpm:136,meter:2,rhythmCell:[.75,.25,1],onsetDensity:'medium',pitchRange:{low:58,high:82},brightness:'bright',mode:'major',tonic:5,repetition:'low',
  mood:'lively',childLine:'像号角吹出长长的音',extraction:measured},
];

export const bundledInspirationCatalog:InspirationCatalog={
 async list(){return {origin:'catalogue',entries:textbookTracks};},
};
