// The beat of a textbook song, for 万物声场 and its 课本灵感 dialog: strong and light metronome ticks at the song's tempo
// and metre (@wanwu-v2/sound-rules beatPlan). Nothing else — the full background is 万物成曲's.
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {beatPlan} from '@wanwu-v2/sound-rules/background';
import type {BeatPlan} from '@wanwu-v2/sound-rules/background';
import {renderBackground} from '../audio/renderBackground.ts';

/** Pure: the song's beat for `seconds`. */
export const songBeat=(track:Pick<TextbookTrack,'tempoBpm'|'meter'>,seconds:number)=>beatPlan({seconds,tempo:track.tempoBpm,metre:track.meter});

/** Only the metronome, on the rhythm part (the plan has nothing else). */
export const renderBeat=(plan:BeatPlan)=>renderBackground(plan,{chord:[],bass:[],melody:[],rhythm:['metronome']},{metronome:'click'});
