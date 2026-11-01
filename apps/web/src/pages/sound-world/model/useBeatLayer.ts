import {useRef} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {BACKGROUND_RULES} from '@wanwu-v2/sound-rules/rules';
import {pieceSeconds} from '../../../shared/creation/arrangementTiming';
import {hasBeat,renderBeat,songBeat} from '../../../shared/inspiration/beat';

/** Renders kept at once (a few lengths and songs); older ones are let go. */
const KEEP=4;

/**
 * What 万物声场 plays under the child's sounds: only the beat of the chosen textbook song, as long as the piece, while
 * the switch beside 课本灵感 is on; without a song, or with a free-rhythm one, nothing (the full background is 万物成曲's). Same shape as
 * useFieldSound's background layer.
 */
export function useBeatLayer(track:TextbookTrack|null,on:boolean){
 const renders=useRef(new Map<string,Promise<AudioBuffer>>());
 const buffer=(arrangement:Arrangement)=>{
  if(!track)return Promise.reject(new Error('no song'));
  const seconds=pieceSeconds(arrangement);
  const key=`${track.id}|${track.tempoBpm}|${track.meter}|${track.pulse??''}|${seconds}`;
  const cache=renders.current;
  let render=cache.get(key);
  if(!render){
   render=renderBeat(songBeat(track,seconds));
   cache.set(key,render);
   render.catch(()=>cache.delete(key));
   while(cache.size>KEEP)cache.delete(cache.keys().next().value!);
  }
  return render;
 };
 return {enabled:!!track&&hasBeat(track)&&on,gain:BACKGROUND_RULES.beat.gain,buffer,track};
}
