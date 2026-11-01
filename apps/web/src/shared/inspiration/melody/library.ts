// Recording lookup and cache for built-in songs. Uploaded songs keep their melody with their feature card.
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {isTextbookMelody} from '@wanwu-v2/contracts/textbook-melody';
import {transcribeMelody} from './transcribe.ts';
import {listBuiltInTeaching} from '../builtInTeaching.ts';
const requests=new Map<string,Promise<TextbookTrack>>();
export async function trackWithMelody(track:TextbookTrack,onProgress:(value:number)=>void=()=>{}):Promise<TextbookTrack>{
 if(isTextbookMelody(track.melody))return track;
 const recording=(await listBuiltInTeaching()).find(r=>r.name===track.title);
 if(!recording)throw new Error('melody-recording-missing');
 const key=JSON.stringify([recording.url,track.tempoBpm,track.meter]);
 const cached=requests.get(key);if(cached)return cached;
 const made=(async()=>{
  // Fetch once, hash the exact bytes, and decode at the existing analysis rate.
  const response=await fetch(recording.url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('melody-recording-missing');
  const bytes=await response.arrayBuffer();
  const {decodeAudio}=await import('../../audio/loadAudio.ts');
  const buffer=await decodeAudio(bytes.slice(0),44100);
  const melody=await transcribeMelody(buffer,bytes,track.tempoBpm,track.meter,onProgress);
  return {...track,melody};
 })();
 requests.set(key,made);try{return await made;}catch(error){requests.delete(key);throw error;}
}
