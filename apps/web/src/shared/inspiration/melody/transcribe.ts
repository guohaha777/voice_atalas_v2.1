// Lazy local neural transcription. Model weights are bundled from the pinned npm package; audio never leaves here.
import type {TextbookMelody} from '@wanwu-v2/contracts/textbook-melody';
import {isTextbookMelody} from '@wanwu-v2/contracts/textbook-melody';
import {selectMelody,MELODY_ANALYSIS,modelExcerpt} from '@wanwu-v2/music-features';
import {keptCache} from '../../storage/keptCache.ts';
import {audioFingerprint} from '../../audio/audioFingerprint.ts';
import {monoOf} from '../teachingCard.ts';
const cache=keptCache<TextbookMelody>('textbook-melody');
let engine:Promise<import('@spotify/basic-pitch').BasicPitch>|null=null;
const pending=new Map<string,Promise<TextbookMelody>>();
let queue:Promise<unknown>=Promise.resolve();
async function getEngine(){
 if(!engine)engine=(async()=>{
  const [{BasicPitch},tf,{default:model},{default:weights}]=await Promise.all([
   import('@spotify/basic-pitch'),import('@tensorflow/tfjs'),
   import('@spotify/basic-pitch/model/model.json?url'),import('@spotify/basic-pitch/model/group1-shard1of1.bin?url')]);
  await tf.ready();
  const graph=tf.loadGraphModel(model,{fetchFunc:(url:RequestInfo|URL,init?:RequestInit)=>fetch(typeof url==='string'&&url.includes('group1-shard1of1.bin')?weights:url,{...init,signal:AbortSignal.timeout(MELODY_ANALYSIS.fetchTimeoutMs)})});
  await graph;return new BasicPitch(graph);
 })().catch(error=>{engine=null;throw error;});
 return engine;
}
export async function transcribeMelody(buffer:AudioBuffer,bytes:ArrayBuffer,tempo:number,meter:number,onProgress:(value:number)=>void=()=>{}):Promise<TextbookMelody>{
 const audioToken=await audioFingerprint(bytes);
 const key=`${MELODY_ANALYSIS.version}|${audioToken}|${tempo}|${meter}`;
 await cache.ready;
 const stored=cache.get(key);if(isTextbookMelody(stored)&&stored.status==='extracted')return stored;
 const existing=pending.get(key);if(existing)return existing;
 const run=async()=>{
  const cut=modelExcerpt(buffer.duration,MELODY_ANALYSIS.excerptSeconds);
  const input=monoOf(buffer),rate=MELODY_ANALYSIS.sampleRate,length=Math.floor((cut.end-cut.start)*rate),samples=new Float32Array(length);
  for(let i=0;i<length;i++){
   const x=(cut.start+i/rate)*buffer.sampleRate,a=Math.floor(x),fraction=x-a;
   samples[i]=(input[a]??0)*(1-fraction)+(input[a+1]??0)*fraction;
  }
  const [{outputToNotesPoly,noteFramesToTime},model]=await Promise.all([import('@spotify/basic-pitch'),getEngine()]);
  const frames:number[][]=[],onsets:number[][]=[];
  const started=Date.now();
  await model.evaluateModel(samples,(f,o)=>{frames.push(...f);onsets.push(...o);},p=>{
   if(Date.now()-started>MELODY_ANALYSIS.timeoutMs)throw new Error('transcription-timeout');onProgress(p);
  });
  const events=noteFramesToTime(outputToNotesPoly(frames,onsets,MELODY_ANALYSIS.onsetThreshold,MELODY_ANALYSIS.frameThreshold,MELODY_ANALYSIS.minimumFrames));
  const result=selectMelody(events,{tempo,meter,excerptStart:cut.start,excerptSeconds:cut.end-cut.start,audioToken});
  if(!isTextbookMelody(result))throw new Error('invalid-transcription');
  cache.set(key,result);return result;
 };
 const made=queue.then(run,run);queue=made.catch(()=>{});pending.set(key,made);
 try{return await made;}finally{pending.delete(key);}
}
