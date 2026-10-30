// What a model made is kept on this device: a reload reads it back, only the newest entries stay, and storage that
// fails leaves a cache for this visit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {keptCache} from '../src/shared/storage/keptCache.ts';
import type {KeyValue} from '../src/shared/storage/guestStore.ts';

const memory=():KeyValue&{data:Map<string,unknown>}=>{
 const data=new Map<string,unknown>();
 return {data,get:async key=>data.get(key),set:async(key,value)=>{data.set(key,value);},delete:async key=>{data.delete(key);},keys:async()=>[...data.keys()]};
};
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('a kept AI result comes back after a reload; only the newest stay; other caches are left alone',async()=>{
 const store=memory();
 const first=keptCache<string>('ai-background',store,2);await first.ready;
 first.set('a','one');await settle();first.set('b','two');await settle();first.set('c','three');await settle();
 assert.equal(first.get('a'),null,'the oldest is let go');assert.ok(!store.data.has('ai-background:a'));
 store.data.set('ai-talk:x','not mine');
 const reloaded=keptCache<string>('ai-background',store,2);
 assert.equal(reloaded.get('c'),null,'nothing is known before what was kept is read');
 await reloaded.ready;
 assert.deepEqual([reloaded.get('b'),reloaded.get('c'),reloaded.get('x')],['two','three',null]);
});

test('storage that hangs does not hold the page up: after the limit the cache is ready (empty)',async()=>{
 const hanging:KeyValue={get:()=>new Promise(()=>{}),set:()=>new Promise(()=>{}),delete:()=>new Promise(()=>{}),keys:()=>new Promise(()=>{})};
 const cache=keptCache<number>('ai-background',hanging,24,20);
 await cache.ready;assert.equal(cache.get('k'),null);cache.set('k',3);assert.equal(cache.get('k'),3);
});

test('without working storage the cache still works for this visit',async()=>{
 const broken:KeyValue={get:async()=>{throw new Error('x');},set:async()=>{throw new Error('x');},delete:async()=>{throw new Error('x');},keys:async()=>{throw new Error('x');}};
 const cache=keptCache<number>('ai-talk',broken);await cache.ready;
 cache.set('k',1);assert.equal(cache.get('k'),1);
 const none=keptCache<number>('ai-talk',null);await none.ready;none.set('k',2);assert.equal(none.get('k'),2);
});
