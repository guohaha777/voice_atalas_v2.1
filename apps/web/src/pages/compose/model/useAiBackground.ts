import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {BackgroundSource,BackgroundUnavailable} from '@wanwu-v2/contracts/background';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {ComposeSettings} from '@wanwu-v2/contracts/work';
import type {BackgroundNote} from '@wanwu-v2/sound-rules/background';
import {loadAudio} from '../../../shared/audio/loadAudio';
import {renderBackground} from '../../../shared/audio/renderBackground';
import {backgroundBrief} from '../../../shared/background/backgroundLayer';
import {runBackgroundChain} from '../../../shared/background/generator';
import type {BackgroundGenerator,ChainOutcome} from '../../../shared/background/generator';
import type {BackgroundLayer} from '../../../shared/background/useBackgroundLayer';
import {keptCache} from '../../../shared/storage/keptCache';

/**
 * Where the AI background stands: `closed` = no AI step is connected (nothing is sent); `idle` = none made for this
 * piece yet (only the button asks); `working` = asking (the local background plays meanwhile); `ready` = one is made for
 * this piece and the child may switch to it; `unavailable` = the last ask ended without one (offline, too slow, over
 * quota…), so the local background stays.
 */
export type AiBackgroundState=
 |{status:'closed'}
 |{status:'idle'}
 |{status:'working'}
 |{status:'ready';source:Exclude<BackgroundSource,'local-rules'>}
 |{status:'unavailable';reason:BackgroundUnavailable};
type Ready=Extract<ChainOutcome,{status:'ready'}>['result'];

const AUDIO_TIMEOUT_MS=20_000;

/** One AI background per piece (what would be sent), kept on this device: asked again only by 换一首. */
const made=keptCache<Ready>('ai-background');

/**
 * 万物成曲's AI background, on top of the local layer: made once when the page opens (unless this piece already has one)
 * and again only with 换一首 — never because the piece, the song or the instruments changed; what was made for a piece
 * is kept (also across reloads) and comes back when the piece does. With a textbook song chosen it is made from that song. The background is
 * one or the other: a new AI one plays at once; choosing a song (or the AI chip) goes back to the song's.
 */
export function useAiBackground(arrangement:Arrangement|null,settings:ComposeSettings,tracks:readonly TextbookTrack[],layer:BackgroundLayer,generator:BackgroundGenerator){
 const [, setMade]=useState(0);
 const [asking,setAsking]=useState<{key:string;status:'working'}|{key:string;status:'unavailable';reason:BackgroundUnavailable}|null>(null);
 // The AI background is the default whenever this piece has one (made on opening the page, or kept from before).
 const [using,setUsing]=useState(true);
 const instruments=settings.background.instruments;
 const brief=useMemo(()=>arrangement&&arrangement.events.length?backgroundBrief(arrangement,settings.inspiration,tracks,instruments):null,
  [arrangement,settings.inspiration,tracks,instruments]);
 // The cache knows a piece by its notes, not by its id (the untouched example gets a new id on every visit) nor by who
 // plays them (instruments only change the voices the notes are played with).
 const briefKey=brief?JSON.stringify({...brief,workId:null,instruments:null}):'';
 const [kept,setKept]=useState(false);
 useEffect(()=>{let live=true;void made.ready.then(()=>{if(live)setKept(true);});return()=>{live=false;};},[]);
 const result=briefKey?made.get(briefKey):null;
 const controller=useRef<AbortController|null>(null);
 // Leaving the page stops an ask on its way; a changed piece only stops showing it (the ask still lands in `made`).
 useEffect(()=>()=>controller.current?.abort(),[]);
 const open=generator.open.length>0;
 const state:AiBackgroundState=!open||!kept?{status:'closed'}:asking?.key===briefKey&&asking.status==='working'?{status:'working'}
  :result?{status:'ready',source:result.source}:asking?.key===briefKey&&asking.status==='unavailable'?{status:'unavailable',reason:asking.reason}:{status:'idle'};

 /** AI 做一段 / 换一种: asks the model once for this piece (replacing what was made); `done` says how it went. */
 const generate=useCallback((done:(ok:boolean)=>void)=>{
  if(!open||!brief||(asking?.key===briefKey&&asking.status==='working'))return;
  const ask=new AbortController(),key=briefKey;controller.current=ask;
  setAsking({key,status:'working'});
  void runBackgroundChain(generator,brief,ask.signal).then(outcome=>{
   if(ask.signal.aborted)return;
   if(outcome.status==='ready'){made.set(key,outcome.result);setAsking(null);setUsing(true);setMade(count=>count+1);done(true);}
   else{setAsking({key,status:'unavailable',reason:outcome.reason});done(false);}
  });
 },[open,brief,briefKey,asking,generator]);

 const renders=useRef(new Map<Ready,Promise<AudioBuffer>>());
 /** The AI background for this piece, or null to play the local one. */
 const buffer=(piece:Arrangement):Promise<AudioBuffer>|null=>{
  if(!using||!result)return null;
  let render=renders.current.get(result);
  if(!render){
   render=result.source==='audio-ai'?loadAudio(result.audioUrl,{timeoutMs:AUDIO_TIMEOUT_MS})
    // AI notes are played like the local ones: same instruments, fades and room under the child's sounds.
    :renderBackground({...layer.plan(piece),notes:result.notes as BackgroundNote[]},layer.parts,layer.voices);
   renders.current.set(result,render);render.catch(()=>renders.current.delete(result));
  }
  return render;
 };
 const source:BackgroundSource=using&&result?result.source:'local-rules';
 /** The prompt version behind the background playing now (null for the local one), kept with a saved piece. */
 const prompt=using&&result?result.promptVersion:null;
 return {state,using:using&&!!result,source,prompt,buffer,generate,
  /** Whether what this device kept has been read (before that the page does not know whether to make one). */
  kept,
  /** Back to the local background (a song was chosen: one or the other). */
  useLocal:()=>setUsing(false),
  /** The AI background again when this piece has one (the song was let go); otherwise the local one plays. */
  preferAi:()=>setUsing(true),
  /** Switch between the AI background (when one is ready) and the local one. */
  toggle:()=>{if(result)setUsing(current=>!current);}};
}
