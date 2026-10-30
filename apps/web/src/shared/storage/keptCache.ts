// What a model made, kept on this device (IndexedDB `wanwu-ai`), so a reload or a later visit does not ask again for the
// same thing: 万物成曲's AI background and its explanation, keyed by what was sent. `ready` resolves once what was kept
// has been read (at once without storage); until then `get` knows only this visit's entries. Only the newest entries
// stay. Storage that fails is skipped: the cache then lasts for this visit only.
import {indexedDbStore} from './guestStore.ts';
import type {KeyValue} from './guestStore.ts';

/** Entries kept per cache; older ones are let go. */
const KEEP=24;
/** Longest wait for what was kept: storage that hangs (a blocked database) must not hold the page up. */
const READ_LIMIT_MS=1500;
type Entry<T>={value:T;at:number};

export type KeptCache<T>={ready:Promise<void>;get(key:string):T|null;set(key:string,value:T):void};

export function keptCache<T>(name:string,store:KeyValue|null=typeof window!=='undefined'?indexedDbStore('wanwu-ai'):null,keep=KEEP,limitMs=READ_LIMIT_MS):KeptCache<T>{
 const prefix=`${name}:`,entries=new Map<string,Entry<T>>();
 const read=(async()=>{
  if(!store)return;
  try{
   const kept:[string,Entry<T>][]=[];
   for(const id of await store.keys()){
    if(!id.startsWith(prefix))continue;
    const entry=await store.get(id) as Entry<T>|undefined;
    if(entry)kept.push([id.slice(prefix.length),entry]);
   }
   // Oldest first, like entries made during the visit; anything made meanwhile stays the newest.
   for(const [key,entry] of kept.sort((a,b)=>a[1].at-b[1].at))if(!entries.has(key)){const fresh=[...entries];entries.clear();entries.set(key,entry);for(const [k,v] of fresh)entries.set(k,v);}
  }catch{/* nothing kept, or storage unavailable */}
 })();
 const ready=Promise.race([read,new Promise<void>(resolve=>setTimeout(resolve,limitMs))]);
 return {
  ready,
  get:key=>entries.get(key)?.value??null,
  set(key,value){
   // The map keeps entries oldest first: a new or renewed one goes to the end, the oldest go once there are too many.
   const entry={value,at:Date.now()};entries.delete(key);entries.set(key,entry);
   void store?.set(prefix+key,entry).catch(()=>{});
   while(entries.size>keep){const old=entries.keys().next().value!;entries.delete(old);void store?.delete(prefix+old).catch(()=>{});}
  },
 };
}
