// Composition preview uses the same textbook core and optional extracted source phrases as the finished piece.
// The sound-field preview stays beat-only. The original-recording button remains separate.
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {LOCAL_INSTRUMENTS} from '@wanwu-v2/audio-engine/instruments';
import {composeTextbook} from '@wanwu-v2/sound-rules/textbook-compose';
import {assignParts,backgroundPlan} from '@wanwu-v2/sound-rules/background';
import type {BackgroundPlan,BeatPlan} from '@wanwu-v2/sound-rules/background';
import {renderBackground} from '../audio/renderBackground.ts';
import {renderBeat,songBeat} from './beat.ts';
import type {InspirationVariant} from './tabs.ts';

/** Long enough to hear the rhythm a few times, short enough to compare songs. */
export const PREVIEW_MAX_SECONDS=8;
const PEAK=.6;
const drum=LOCAL_INSTRUMENTS.find(instrument=>instrument.recipe==='pulse')!;

/** Whole bars that fit in the preview (at least two). */
const previewSeconds=(track:TextbookTrack)=>{const bar=60/track.tempoBpm*track.meter;return Math.max(2,Math.floor(PREVIEW_MAX_SECONDS/bar))*bar;};

/** Pure: whole bars, nothing else playing, the song's own colour. */
export function previewPlan(track:TextbookTrack):BackgroundPlan{
 const made=composeTextbook({version:'textbook-compose-v1',seconds:previewSeconds(track),sounds:[],mood:null,textbook:track});
 const fallback=backgroundPlan({seconds:previewSeconds(track),sounding:[],mood:null,textbook:track,seed:track.id});
 const plan=made.status==='ready'?made.music:{...fallback,notes:[]};
 // A few seconds heard on purpose: start at once (the first strong beat matters) and end with a short fade.
 return {...plan,fadeInSeconds:.03,fadeOutSeconds:Math.min(plan.fadeOutSeconds,.8)};
}
/** Pure: the same bars, only the beat. */
export const previewBeat=(track:TextbookTrack):BeatPlan=>songBeat(track,previewSeconds(track));

export async function renderRhythmPreview(track:TextbookTrack,variant:InspirationVariant='full'):Promise<AudioBuffer>{
 const buffer=variant==='beat'?await renderBeat(previewBeat(track)):await renderBackground(previewPlan(track),assignParts([drum]),{[drum.id]:drum.recipe});
 // The background is mixed to sit under the child's sounds; heard alone it is brought up to a clear level.
 const data=buffer.getChannelData(0);let peak=0;for(const value of data)peak=Math.max(peak,Math.abs(value));
 if(peak>0)for(let i=0;i<data.length;i++)data[i]=data[i]!*PEAK/peak;
 return buffer;
}
