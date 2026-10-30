// What the local background is made from, derived from the work only — the same arrangement data the field, the score
// and the playback read, so the melody's gaps line up with the child's sounds on both pages.
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import {BACKGROUND_REQUEST_VERSION} from '@wanwu-v2/contracts/background';
import type {BackgroundBrief,TextbookFeatures} from '@wanwu-v2/contracts/background';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {backgroundPlan} from '@wanwu-v2/sound-rules/background';
import type {BackgroundInput} from '@wanwu-v2/sound-rules/background';
import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {workSummary} from '@wanwu-v2/sound-rules/textbook-match';
import {pieceSeconds,timedEvents} from '../creation/arrangementTiming.ts';
import {presetMood} from '../creation/moodCopy.ts';

/** The card an inspiration points to: a textbook song, or teaching music once its card is made (null until then). */
export function inspirationTrack(inspiration:Inspiration,tracks:readonly TextbookTrack[]){
 const id=inspiration.kind==='textbook'?inspiration.entryId:inspiration.kind==='teaching-music'?inspiration.musicId:null;
 return id?tracks.find(track=>track.id===id)??null:null;
}

/** Plan input: the piece's real length, when the child's sounds are heard, the mood and the chosen textbook song. */
export function backgroundInput(arrangement:Arrangement,inspiration:Inspiration,tracks:readonly TextbookTrack[]):BackgroundInput{
 return {
  seconds:pieceSeconds(arrangement),
  // How each sound sounds, for the melody's answer: the child's choices first, 声音体检's 高低 when 高低 was not chosen.
  sounding:timedEvents(arrangement).map(({start,end,unit})=>{
   const pitch=unit.shape.pitch??unit.analysis?.band,{contour,intensity}=unit.shape;
   return {start,end,...(pitch?{pitch}:{}),...(contour?{contour}:{}),...(intensity?{intensity}:{})};
  }),
  mood:presetMood(arrangement.mood),
  textbook:inspirationTrack(inspiration,tracks),
  seed:arrangement.id,
 };
}

/** Only the features of a textbook song (never its title, audio or melody) go into an AI request. */
export function textbookFeatures(track:TextbookTrack):TextbookFeatures{
 const {id,tempoBpm,meter,rhythmCell,onsetDensity,pitchRange,brightness,mode,repetition,mood,tonic}=track;
 return {id,tempoBpm,meter,rhythmCell:[...rhythmCell],onsetDensity,pitchRange:{...pitchRange},brightness,mode,repetition,mood,...(tonic===undefined?{}:{tonic})};
}

/**
 * The anonymous brief an AI background request carries: the same frame the local background uses (length, when the
 * child's sounds play, tempo, metre, mode, mood), the arrangement in the textbook's words, the textbook song's features,
 * teaching music's card features like a song's (its upload id only while it has no card yet), the chosen instruments
 * and the rule versions. No recordings, sound names, makers, places or source ids.
 */
export function backgroundBrief(arrangement:Arrangement,inspiration:Inspiration,tracks:readonly TextbookTrack[],instruments:readonly string[]):BackgroundBrief|null{
 const summary=workSummary(arrangement);
 if(!summary)return null;
 const input=backgroundInput(arrangement,inspiration,tracks),plan=backgroundPlan(input),track=inspirationTrack(inspiration,tracks);
 return {
  version:BACKGROUND_REQUEST_VERSION,workId:arrangement.id,seconds:input.seconds,sounding:input.sounding.map(({start,end})=>({start,end})),
  tempo:plan.tempo,metre:plan.metre,mode:plan.mode,mood:input.mood,
  arrangement:{density:summary.density,repetition:summary.repetition,register:summary.register},
  textbook:track?textbookFeatures(track):null,
  teachingMusic:inspiration.kind==='teaching-music'&&!track?{musicId:inspiration.musicId}:null,
  instruments:[...instruments],rules:{...RULE_VERSIONS},
 };
}
