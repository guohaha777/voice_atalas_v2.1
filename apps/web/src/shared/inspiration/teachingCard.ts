// 教学音乐出卡: from a teacher's recording to a feature card within about 15 s — everything on this device except one
// request. 1. decode the file and mix it to mono; 2. measure it (@wanwu-v2/music-features); 3. cut the 30 s the model
// hears (modelExcerpt) and encode it as 11 kHz mono 16-bit WAV (about 880 KB in base64; a browser cannot encode mp3);
// 4. ask the server (TeachingMusicService.features → POST /api/v1/textbook/features: the audio model hears the excerpt,
// else the language model reads the numbers); 5. a reply that checks out makes the card, otherwise the program's own
// choices do (pickRhythm, pickMood, the corpus line). The card says which. Only the excerpt and the file name leave the
// device (decided 2026-10-30), never the whole recording.
import {MOODS} from '@wanwu-v2/contracts/arrangement';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import {TEXTBOOK_CONTRACT_VERSION,isTextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Brightness,Density,Level,Metre,TextbookMode,TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {measure,modelExcerpt,pickMood,pickRhythm} from '@wanwu-v2/music-features';
import type {Measurement} from '@wanwu-v2/music-features';
import {pulseLine,teachingLine} from '@wanwu-v2/prompts/corpus';
import {explainCard,isExplainReply} from '@wanwu-v2/prompts/explain';
import type {ExplainReply,FactSource} from '@wanwu-v2/prompts/explain';

/** The whole wait, from tapping a file to the card (decided 2026-10-30). */
export const CARD_BUDGET_MS=15_000;
/** What the model hears: low rate, mono, 16-bit — enough for rhythm and feel, small enough to send. */
const EXCERPT_RATE=11_025;
/** Time kept for decoding and measuring before the request; the request gets the rest of the budget. */
const LOCAL_RESERVE_MS=500;

/** Who made the card: the audio model (heard the excerpt), the language model (numbers only), or the program alone. */
export type CardMaker='audio'|'language'|'program';
/** A teaching-music card: the same feature card textbook songs have, plus the note for teachers and who made it. */
export type TeachingCard={track:TextbookTrack;teacherNote:string|null;madeBy:CardMaker;
 /** Part of the model's answer was replaced by the program's measurement (its checks said so). */
 partly:boolean;
 /** The explanation card's checked sentences from the model (null = all corpus; a card kept before 2026-10-31 has none). */
 explain?:ExplainReply|null};

/** Where a card's numbers and bar came from, for the teacher's facts line: measured here; the bar is the AI's when it heard it. */
export const cardSources=(card:Pick<TeachingCard,'madeBy'>):{numbers:FactSource;rhythm:FactSource}=>({numbers:'measured',rhythm:card.madeBy==='audio'?'ai':'measured'});
/** The same for a song from the catalogue: 课本 when read from the score, 示例 for made-up examples, else measured. */
export const trackSources=(track:Pick<TextbookTrack,'extraction'>):{numbers:FactSource;rhythm:FactSource}=>{
 const from:FactSource=track.extraction.numbers==='score'?'textbook':track.extraction.numbers==='example'?'example':'measured';
 return {numbers:from,rhythm:from};
};
/** The request body (the server checks it with @wanwu-v2/prompts isTextbookFeaturesBrief): numbers, candidates, title. */
export type FeaturesBrief={title:string;listenSeconds:number;tempoBpm:number;meter:Metre;meterConfidence:number;mode:TextbookMode;onsetDensity:Density;
 brightness:Brightness;candidates:{cell:number[];bars:number}[];fallbackCell:number[];others:{title:string;rhythmCell:number[];childLine:string}[];
 /** For the explanation card's points (@wanwu-v2/prompts/explain), and the card lines other songs use (not to be copied). */
 pitchRange:{low:number;high:number};repetition:Level;pulse?:'even'|'none';otherLines:string[]};
export type FeaturesRequest={brief:FeaturesBrief;audio:string};
/** The server's answer, or null when there is none (offline, not open, failed, too slow). */
export type AskFeatures=(request:FeaturesRequest,signal:AbortSignal)=>Promise<unknown>;
export type CardStage='reading'|'listening';

/** The recording is not music (the precheck found almost no steady pitch): no card is made. */
export class NotMusicError extends Error{constructor(){super('not-music');this.name='NotMusicError';}}

/** How the card's beat may be used, from how it was measured (TextbookTrack.pulse; undefined = steady, strong beats marked). */
export const pulseOf=(m:Pick<Measurement,'steady'|'strongBeat'>):TextbookTrack['pulse']=>!m.steady?'none':!m.strongBeat?'even':undefined;

/** Mono samples: the channels averaged. */
export function monoOf(buffer:Pick<AudioBuffer,'numberOfChannels'|'length'|'getChannelData'>){
 if(buffer.numberOfChannels===1)return buffer.getChannelData(0);
 const out=new Float32Array(buffer.length);
 for(let c=0;c<buffer.numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=0;i<out.length;i++)out[i]=out[i]!+data[i]!/buffer.numberOfChannels;}
 return out;
}

/** Seconds `start`–`end` of the samples as a WAV file at EXCERPT_RATE (averaged down, peak-normalised), in base64. */
export function excerptWav(samples:Float32Array,rate:number,start:number,end:number,target=EXCERPT_RATE){
 const from=Math.max(0,Math.floor(start*rate)),to=Math.min(samples.length,Math.floor(end*rate)),step=rate/target;
 const count=Math.max(0,Math.floor((to-from)/step)),pcm=new Float32Array(count);
 let peak=1e-9;
 for(let i=0;i<count;i++){
  const a=from+Math.floor(i*step),b=Math.max(a+1,from+Math.floor((i+1)*step));let sum=0;
  for(let k=a;k<b;k++)sum+=samples[k]!;
  pcm[i]=sum/(b-a);peak=Math.max(peak,Math.abs(pcm[i]!));
 }
 const bytes=new Uint8Array(44+count*2),view=new DataView(bytes.buffer),text=(at:number,value:string)=>{for(let i=0;i<4;i++)bytes[at+i]=value.charCodeAt(i);};
 text(0,'RIFF');view.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,target,true);view.setUint32(28,target*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);
 const gain=.9/peak;for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]!*gain))*32767),true);
 let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary);
}

/**
 * What the model is told: the file name as the title, the numbers, the rhythm candidates and the program's pick, the
 * features the explanation card's points come from, and the card lines of songs already here.
 */
export function featuresBrief(name:string,m:Measurement,listenSeconds:number,otherLines:readonly string[]=[]):FeaturesBrief{
 const pulse=pulseOf(m);
 return {title:[...name.trim()].slice(0,24).join('')||'教学音乐',listenSeconds,tempoBpm:m.tempoBpm,meter:m.meter,meterConfidence:m.meterConfidence,mode:m.mode,
  onsetDensity:m.onsetDensity,brightness:m.brightness,candidates:m.candidates.slice(0,8),fallbackCell:pickRhythm(m.candidates,m.meter),others:[],
  pitchRange:{...m.pitchRange},repetition:m.repetition,...(pulse?{pulse}:{}),otherLines:otherLines.slice(0,90).map(line=>line.slice(0,60))};
}
/** Whether any of a card's explanation came from the model (the page marks it with a small AI bubble). */
export const madeByAi=(card:Pick<TeachingCard,'explain'>)=>{
 const e=card.explain;
 return !!e&&[e.title,e.sound,e.listen,e.move,e.play,e.teacher.listen,e.teacher.move,e.teacher.play].some(Boolean);
};
/** The child lines a card shows (听一听 / 动一动 / 玩一玩), so a new card does not copy them. */
export const cardLines=(card:TeachingCard)=>Object.values(explainCard(card.track,card.explain??null,cardSources(card)).child);

type Reply={rhythmCell:number[];meter:Metre;tempoBpm:number;mood:MoodId;childLine:string|null;teacherNote:string|null;checked:'accepted'|'partly';source:'audio'|'language';explain?:unknown};
const isReply=(value:unknown):value is Reply=>{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>,text=(field:unknown)=>field===null||field===undefined||typeof field==='string';
 return Array.isArray(raw.rhythmCell)&&raw.rhythmCell.every(n=>typeof n==='number')&&[2,3,4].includes(raw.meter as number)&&typeof raw.tempoBpm==='number'
  &&MOODS.includes(raw.mood as MoodId)&&text(raw.childLine)&&text(raw.teacherNote)&&(raw.source==='audio'||raw.source==='language');
};

/** Pure: the card from the measurement and the server's answer (null or anything that does not check out = the program's). */
export function cardFrom(music:{id:string;name:string},m:Measurement,answer:unknown):TeachingCard{
 const program=():TeachingCard=>({track:track(null),teacherNote:null,madeBy:'program',partly:false,explain:null});
 const track=(reply:Reply|null):TextbookTrack=>{
  const meter=reply?.meter??m.meter,pulse=pulseOf(m),childLine=reply?.childLine?.trim()||(pulse?pulseLine(pulse):teachingLine(meter));
  return {version:TEXTBOOK_CONTRACT_VERSION,id:music.id,title:music.name,source:null,
   tempoBpm:Math.max(40,Math.min(200,Math.round(reply?.tempoBpm??m.tempoBpm))),meter,rhythmCell:reply?[...reply.rhythmCell]:pickRhythm(m.candidates,m.meter),
   onsetDensity:m.onsetDensity,pitchRange:{...m.pitchRange},brightness:m.brightness,mode:m.mode,repetition:m.repetition,
   mood:reply?.mood??pickMood(m),tonic:m.tonic,...(pulse?{pulse}:{}),childLine,
   extraction:{numbers:'code',words:reply?.childLine?.trim()?'ai':'code',confidence:Math.max(0,Math.min(1,m.meterConfidence)),earChecked:false}};
 };
 if(!isReply(answer))return program();
 const card=track(answer);
 if(!isTextbookTrack(card))return program();
 return {track:card,teacherNote:answer.teacherNote?.trim()||null,madeBy:answer.source,partly:answer.checked==='partly',explain:isExplainReply(answer.explain)?answer.explain:null};
}

/**
 * Decode, measure, ask (within what is left of the budget), make the card. Throws when the file cannot be read, and
 * NotMusicError when it is not music. A free-rhythm recording gets the program's card without asking: the model's
 * task is about a beat and a bar rhythm, which it does not have.
 * `decode` should give MEASURE_RATE (@wanwu-v2/music-features), the rate the measurement was set for.
 */
export async function makeTeachingCard(music:{id:string;name:string},bytes:ArrayBuffer,decode:(bytes:ArrayBuffer)=>Promise<AudioBuffer>,
 ask:AskFeatures|null,onStage:(stage:CardStage)=>void=()=>{},now:()=>number=()=>performance.now(),otherLines:readonly string[]=[]):Promise<TeachingCard>{
 const started=now();onStage('reading');
 const buffer=await decode(bytes),samples=monoOf(buffer),m=measure(samples,buffer.sampleRate);
 if(!m.musical)throw new NotMusicError();
 if(!ask||!m.steady)return cardFrom(music,m,null);
 const cut=modelExcerpt(m.seconds),audio=excerptWav(samples,buffer.sampleRate,cut.start,cut.end);
 const left=CARD_BUDGET_MS-LOCAL_RESERVE_MS-(now()-started);
 if(left<=0)return cardFrom(music,m,null);
 onStage('listening');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),left);
 try{return cardFrom(music,m,await ask({brief:featuresBrief(music.name,m,cut.end-cut.start,otherLines),audio},abort.signal).catch(()=>null));}
 finally{clearTimeout(timer);}
}
