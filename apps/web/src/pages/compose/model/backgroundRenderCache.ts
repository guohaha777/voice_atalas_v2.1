// A composition keeps its notes while instruments change. Cache each instrumentation separately.
const KEEP=6;

export function backgroundRenderCache<T extends object>(){
 const compositions=new WeakMap<T,Map<string,Promise<AudioBuffer>>>();
 return {
  get(composition:T,key:string,render:()=>Promise<AudioBuffer>):Promise<AudioBuffer>{
   let versions=compositions.get(composition);
   if(!versions){
    versions=new Map();
    compositions.set(composition,versions);
   }
   const kept=versions;
   let buffer=kept.get(key);
   if(!buffer){
    buffer=render();
    kept.set(key,buffer);
    const requested=buffer;
    void buffer.catch(()=>{
     if(kept.get(key)===requested)kept.delete(key);
    });
    while(kept.size>KEEP)kept.delete(kept.keys().next().value!);
   }
   return buffer;
  },
 };
}
