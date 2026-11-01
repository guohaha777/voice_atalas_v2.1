import {useEffect,useMemo,useRef,useState} from 'react';
import type {SavedWork} from '@wanwu-v2/contracts/work';
import {backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {keptPlan} from '@wanwu-v2/sound-rules/kept-background';
import {MIX_RULES} from '@wanwu-v2/sound-rules/mix';
import {audioSupported} from '../../../shared/audio/audioContext.ts';
import {renderArrangedBackground} from '@wanwu-v2/audio-engine/orchestration';
import {SequencePlayer} from '../../../shared/audio/SequencePlayer.ts';
import type {SequenceVoice} from '../../../shared/audio/SequencePlayer.ts';
import {backgroundInput} from '../../../shared/background/backgroundLayer.ts';
import type {Instrument} from '../../../shared/background/instruments.ts';
import {pieceSeconds,planPlayback} from '../../../shared/creation/arrangementTiming.ts';
import {EXAMPLE_TIMEOUT_MS} from '../../../shared/creation/exampleSounds.ts';
import {WorkSoundBank,soundFailure} from '../../../shared/creation/workSounds.ts';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';

export type ShelfPlayFailure=NonNullable<ReturnType<typeof soundFailure>>|'no-audio';

/**
 * 听一听 on the shelf: plays a saved work as it was kept — the child's sounds as placed, and the background with the
 * saved settings (on / off, instruments, volume, textbook song): the composed notes it kept, else the same local rules
 * as 万物成曲. One work at a
 * time; tapping the playing one stops it. The clock drives the highlights on the card's small score.
 */
export function useShelfPlayer(
 instruments:readonly Instrument[],
 tracks:readonly TextbookTrack[],
 onFailure:(failure:ShelfPlayFailure)=>void,
){
 const [playing,setPlaying]=useState<string|null>(null);
 const [preparing,setPreparing]=useState<string|null>(null);
 const [elapsed,setElapsed]=useState(0);
 const player=useMemo(()=>new SequencePlayer(key=>setPlaying(key)),[]);
 const bank=useMemo(()=>new WorkSoundBank(EXAMPLE_TIMEOUT_MS),[]);
 const token=useRef(0);

 useEffect(()=>{
  if(!playing){
   setElapsed(0);
   return;
  }
  let frame=0;
  const tick=()=>{
   setElapsed(player.elapsed()??0);
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[playing,player]);
 // Hiding the tab or leaving the shelf stops sound and pending loads.
 useEffect(()=>{
  const hidden=()=>{
   if(document.visibilityState==='hidden'){
    token.current++;
    player.stop();
   }
  };
  document.addEventListener('visibilitychange',hidden);
  return()=>{
   document.removeEventListener('visibilitychange',hidden);
   token.current++;
   player.stop();
   bank.abort();
  };
 },[player,bank]);

 const stop=()=>{
  token.current++;
  setPreparing(null);
  player.stop();
 };
 const toggle=async(work:SavedWork)=>{
  if(player.activeKey()===work.id||preparing===work.id)return stop();
  if(!audioSupported())return onFailure('no-audio');
  const mine=++token.current;
  player.stop();
  setPreparing(work.id);
  try{
   const {arrangement,settings}=work;
   const plan=planPlayback(arrangement);
   const total=pieceSeconds(arrangement);
   const sounds=await Promise.all(plan.map(item=>bank.clip(item.sourceId,item.shape,item.clip,item.analysis)));
   const voices:SequenceVoice[]=plan.map((item,index)=>({at:item.startSeconds,buffer:sounds[index]!}));
   const {background}=settings;
   if(background.enabled){
    const chosen=background.instruments.flatMap(id=>instruments.filter(item=>item.id===id));
    // A background that cannot be made is left out: the child's sounds still play.
    const input=backgroundInput(arrangement,settings.inspiration,tracks);
    // The composed notes the piece kept (AI 作曲 / 程序自编) play as they did in 万物成曲; older pieces rebuild it.
    const {composed}=work.rendering;
    const local=backgroundPlan(input);
    const under=await renderArrangedBackground(composed?keptPlan(local,composed):local,chosen,input.sounding)
     .catch(()=>null);
    if(under)voices.push({at:0,buffer:under,layer:'background'});
   }
   if(mine!==token.current)return;
   await player.play(work.id,voices,MIX_RULES.childGain,{
    length:total,
    // A shelved piece sounds as it did in 万物成曲 (its own background maximum).
    layers:{background:background.volume*MIX_RULES.composeBackgroundMaxGain},
    limiter:MIX_RULES.limiter,
    fadeOut:MIX_RULES.ending.fadeSeconds,
   });
  }catch(reason){
   if(mine===token.current){
    const failure=soundFailure(reason);
    if(failure)onFailure(failure);
   }
  }
  finally{
   if(mine===token.current)setPreparing(null);
  }
 };
 return {playing,preparing,elapsed,toggle,stop};
}
