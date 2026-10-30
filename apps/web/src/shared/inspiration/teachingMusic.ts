// Teaching music for 课本灵感: a teacher picks the class's textbook / teaching recording on this device (or one of the
// built-in recordings). The file stays on this device (kept in IndexedDB, so it is still there after a refresh); within
// about 15 s it gets a feature card (./teachingCard.ts) — only a 30 s excerpt and the file name go to the server, for
// the audio model to hear. With the card, 万物声场 plays its beat and 万物成曲 borrows it like a textbook song.
//
// Later, with teacher accounts, the flow below is the plan (protocol v0.4; not implemented; teacher sign-in; the server owns accounts,
// licence checks and review):
//   1. POST /api/v1/teaching-music                     ← {mimeType, bytes, durationMs, licenseConfirmed:true,
//                                                         licenseVersion} → {musicId, uploadUrl, expiresAt}
//      The server records which teacher confirmed which licence text, and when. Limits as below (10 MB, any length).
//   2. The file goes straight to object storage at `uploadUrl` (in parts, resumable on a weak network), not through the API.
//   3. POST /api/v1/teaching-music/{musicId}/complete  → {musicId, status:'analysing'}
//   4. GET  /api/v1/teaching-music/{musicId}           → {status:'analysing'} | {status:'ready',features:{tempo,metre,key,
//      mood,phrases}}. Once analysed the server deletes the audio and keeps only the features — like textbook songs,
//      whose audio never goes to the cloud.
//   5. POST /api/v1/backgrounds ← BackgroundBrief with teachingMusic:{musicId} (+ step) → {jobId}, then
//      GET /api/v1/backgrounds/{jobId} → BackgroundResult: the same AI background entry as without teaching music
//      (shared/background/generator.ts). The server combines the music's features with how the child arranged the
//      sounds (where they cluster, rests, length, mood) and generates a matching background layer. It never alters the
//      child's sounds or placement and never copies the teaching music's melody into the piece.
import {decodeAudio} from '../audio/loadAudio';
import {newId} from '../creation/ids';
import type {KeyValue} from '../storage/guestStore';
import {makeTeachingCard} from './teachingCard';
import type {AskFeatures,CardStage,TeachingCard} from './teachingCard';

/** Only the file size is limited (10 MB); any length is accepted (decided 2026-10-30). */
export const TEACHING_MUSIC_MAX_BYTES=10*1024*1024;
/** Pieces kept on this device; picking another lets the oldest go. */
const KEEP=4;
const KEY='teaching:';

/** Picked on this device; `url` is a local object URL for listening. */
export type LocalTeachingMusic={id:string;name:string;durationMs:number;bytes:number;url:string};
export type PickResult={status:'picked';music:LocalTeachingMusic}|{status:'not-audio'|'too-large'|'unreadable'};
/** A piece with its card: `analysing` while the card is being made (with the stage), `failed` when it could not be read. */
export type TeachingItem=LocalTeachingMusic&{card:TeachingCard|null;analysing:CardStage|null;failed:boolean};
type Kept={music:Omit<LocalTeachingMusic,'url'>;blob:Blob;card:TeachingCard|null;at:number};

/** Reads the length from the file's own metadata (no decoding of the whole file). */
function readDuration(url:string){
 return new Promise<number>((resolve,reject)=>{
  const audio=new Audio();audio.preload='metadata';
  audio.onloadedmetadata=()=>Number.isFinite(audio.duration)?resolve(audio.duration*1000):reject(new Error('no duration'));
  audio.onerror=()=>reject(new Error('unreadable'));
  audio.src=url;
 });
}

export class TeachingMusicStore{
 private items=new Map<string,TeachingItem&{blob:Blob;at:number}>();
 private listeners=new Set<()=>void>();
 private snapshot:readonly TeachingItem[]=[];
 private kept:KeyValue|null=null;
 get(id:string):TeachingItem|null{return this.items.get(id)??null;}
 /** Newest first; a new array only when something changed (for useSyncExternalStore). */
 list=()=>this.snapshot;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private changed(){this.snapshot=[...this.items.values()].sort((a,b)=>b.at-a.at).map(({blob:_blob,at:_at,...item})=>item);for(const listener of this.listeners)listener();}
 private persist(id:string){
  const item=this.items.get(id);if(!this.kept||!item)return;
  const {url:_url,card,blob,at,analysing:_a,failed:_f,...music}=item;
  void this.kept.set(KEY+id,{music,blob,card,at} satisfies Kept).catch(()=>{});
 }

 /** Brings back the pieces kept on this device (once, at start). Storage that fails is skipped. */
 async attach(kept:KeyValue|null){
  this.kept=kept;if(!kept)return;
  try{
   for(const key of await kept.keys()){
    if(!key.startsWith(KEY))continue;
    const value=await kept.get(key) as Kept|undefined;
    if(!value?.blob||!value.music?.id||this.items.has(value.music.id))continue;
    this.items.set(value.music.id,{...value.music,url:URL.createObjectURL(value.blob),blob:value.blob,card:value.card??null,analysing:null,failed:false,at:value.at??0});
   }
   this.changed();
  }catch{/* nothing kept, or storage unavailable */}
 }

 async pick(file:Blob&{name?:string}):Promise<PickResult>{
  if(!file.type.startsWith('audio/'))return {status:'not-audio'};
  if(file.size>TEACHING_MUSIC_MAX_BYTES)return {status:'too-large'};
  // The same file again (same name and size) is the piece already here, with its card: no second analysis.
  const name=(file.name??'').replace(/\.[^.]+$/,'').slice(0,24)||'教学音乐';
  const known=[...this.items.values()].find(item=>item.name===name&&item.bytes===file.size);
  if(known){
   this.items.set(known.id,{...known,at:Date.now()});this.persist(known.id);this.changed();
   const {blob:_blob,at:_at,card:_card,analysing:_analysing,failed:_failed,...music}=known;
   return {status:'picked',music};
  }
  const url=URL.createObjectURL(file);
  try{
   const durationMs=Math.round(await readDuration(url));
   if(durationMs<=0){URL.revokeObjectURL(url);return {status:'unreadable'};}
   const music={id:newId('teaching'),name,durationMs,bytes:file.size,url};
   this.items.set(music.id,{...music,blob:file,card:null,analysing:null,failed:false,at:Date.now()});
   for(const old of [...this.items.values()].sort((a,b)=>b.at-a.at).slice(KEEP)){
    this.items.delete(old.id);URL.revokeObjectURL(old.url);void this.kept?.delete(KEY+old.id).catch(()=>{});
   }
   this.persist(music.id);this.changed();
   return {status:'picked',music};
  }catch{URL.revokeObjectURL(url);return {status:'unreadable'};}
 }
 /** A built-in recording (shipped beside the page): fetched, then picked like a file. */
 async pickUrl(url:string,name:string):Promise<PickResult>{
  try{
   const response=await fetch(url);if(!response.ok)return {status:'unreadable'};
   const blob=await response.blob();
   return this.pick(Object.assign(new Blob([blob],{type:blob.type.startsWith('audio/')?blob.type:'audio/mpeg'}),{name}));
  }catch{return {status:'unreadable'};}
 }

 /** Makes the piece's card once (again only after a failure); `ask` reaches the server, null = the program alone. */
 async analyse(id:string,ask:AskFeatures|null){
  const item=this.items.get(id);
  if(!item||item.card||item.analysing)return;
  const stage=(analysing:CardStage)=>{const current=this.items.get(id);if(current){this.items.set(id,{...current,analysing,failed:false});this.changed();}};
  stage('reading');
  try{
   const card=await makeTeachingCard({id,name:item.name},await item.blob.arrayBuffer(),decodeAudio,ask,stage);
   const current=this.items.get(id);if(!current)return;
   this.items.set(id,{...current,card,analysing:null});this.persist(id);
  }catch{
   const current=this.items.get(id);if(current)this.items.set(id,{...current,analysing:null,failed:true});
  }
  this.changed();
 }
}
export const teachingMusic=new TeachingMusicStore();

/** Server side of teaching music (chosen in app/services.ts): whether a model can make the card (`analyseAvailable`;
 *  without one the program makes it alone, and the dialog says so) and the request that asks it. */
export type TeachingMusicService={readonly analyseAvailable:boolean;features:AskFeatures|null};
export const offlineTeachingMusicService:TeachingMusicService={analyseAvailable:false,features:null};
