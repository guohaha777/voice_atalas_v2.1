import {useCallback,useEffect,useMemo,useReducer,useRef,useState} from 'react';
import type {Arrangement,SpanSeconds} from '@wanwu-v2/contracts/arrangement';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {spanHolds} from '../../../shared/creation/arrangementTiming';
import type {InspirationCatalog} from '../../../shared/inspiration/catalog';
import type {TeachingMusicService} from '../../../shared/inspiration/teachingMusic';
import {useInspirationCatalog} from '../../../shared/inspiration/useInspirationCatalog';
import type {Instrument} from '../../../shared/background/instruments';
import type {BackgroundLibrary} from '../../../shared/background/library';
import {useBackgroundLayer} from '../../../shared/background/useBackgroundLayer';
import type {BackgroundGenerator} from '../../../shared/background/generator';
import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {useAiBackground} from './useAiBackground';
import {services} from '../../../app/services';
import type {TalkPolisher} from '../../../shared/talk/polisher';
import type {ComposeRepository} from '../services/composeRepository';
import {composeReducer,initialCompose,isShelved,shelfEntry} from './composeState';
import type {ComposeNoticeKey} from './composeState';
import {scoreLayout} from './scoreLayout';
import {usePiecePlayback} from './usePiecePlayback';
import {useTalk} from './useTalk';

/** 万物成曲: listen to the work as a piece, set its length, inspiration and background, then put it on the shelf.
 *  The playback clock lives in usePiecePlayback and the background layer (shared with 万物声场) in useBackgroundLayer. */
export function useCompose(repository:ComposeRepository=services.composeRepository,backgrounds:BackgroundLibrary=services.backgroundLibrary,inspirations:InspirationCatalog=services.inspirationCatalog,generator:BackgroundGenerator=services.backgroundGenerator,
 polisher:TalkPolisher=services.talkPolisher,teaching:TeachingMusicService=services.teachingMusic){
 const [state,dispatch]=useReducer(composeReducer,initialCompose);
 const [shelfCount,setShelfCount]=useState(0);
 const [instruments,setInstruments]=useState<readonly Instrument[]>([]);
 const [comingInstruments,setComing]=useState<readonly string[]>([]);
 const latest=useRef(state);latest.current=state;
 const notify=useCallback((key:ComposeNoticeKey,tone:'info'|'error'='error')=>dispatch({type:'notice',notice:{tone,key}}),[]);

 useEffect(()=>{
  let live=true;
  void Promise.all([repository.load(),backgrounds.list()]).then(([current,library])=>{
   if(!live)return;
   setInstruments(library.instruments);setComing(library.coming);setShelfCount(current.shelfCount);
   dispatch({type:'loaded',arrangement:current.arrangement,settings:current.settings,shelved:current.shelved});
  });
  return()=>{live=false;};
 },[repository,backgrounds]);

 // Length changes go back to the same work 万物声场 edits; an untouched example is not stored.
 useEffect(()=>{
  const arrangement=state.arrangement;
  if(arrangement?.origin==='child')void repository.saveArrangement(arrangement);
 },[state.arrangement,repository]);
 useEffect(()=>{if(latest.current.arrangement)void repository.saveSettings(state.settings);},[state.settings,repository]);

 // ----- derived: score, background, talk -----
 const layout=useMemo(()=>state.arrangement?scoreLayout(state.arrangement):null,[state.arrangement]);
 // 课本灵感: the same songs as 万物声场 (shared/inspiration).
 const {entries,tracks,teachingItems,analyseTeaching,teachingOpen}=useInspirationCatalog(inspirations,teaching);
 // Teaching music is borrowed like a song once its card is made.
 const music=useBackgroundLayer(state.settings,instruments,tracks);
 /** What the background is made of right now (mood colour, borrowed rhythm), for the card. */
 const backgroundPlan=useMemo(()=>state.arrangement?music.plan(state.arrangement):null,
 // The plan only changes with the arrangement and what the background borrows.
 [state.arrangement,music.key]);
 const inspiration=state.settings.inspiration;
 /** 音乐小发现 and 课本讲解: corpus sentences at once, an AI rewording only where it passes the checks. */
 const talk=useTalk(state.arrangement,music.track,inspiration,backgroundPlan,polisher);
 /** AI background on top of the local one: asked in the background, used only when the child switches to it. */
 const ai=useAiBackground(state.arrangement,state.settings,tracks,music,generator);
 const played={gain:music.gain,key:`${music.key}|${ai.source}`,buffer:(arrangement:Arrangement)=>ai.buffer(arrangement)??music.buffer(arrangement)};
 const playback=usePiecePlayback(latest,notify,played,layout);

 // ----- settings -----
 /** A new length restarts the piece; a length too short for the longest sound is only explained (playback goes on). */
 const setSpan=(spanSeconds:SpanSeconds)=>{
  const work=latest.current.arrangement;
  if(work&&spanHolds(work,spanSeconds))playback.reset();
  dispatch({type:'span',spanSeconds,now:new Date()});
 };
 /** A song chosen plays the song's background (AI or song: one or the other); 换一首 then makes an AI one from it. */
 const setInspiration=(next:Inspiration)=>{if(next.kind!=='none')ai.useLocal();dispatch({type:'inspiration',inspiration:next});};
 /** 换一首: new AI music and a new explanation with it — the only way, besides opening the page, a model is asked. */
 const makeAi=(renewTalk:boolean)=>{
  dispatch({type:'said',lastAction:'ai-making'});
  // The explanation changes only with music that was really made (a failed ask leaves both as they were).
  ai.generate(ok=>{dispatch({type:'said',lastAction:ok?'ai-background':'ai-failed'});if(ok){if(renewTalk)talk.renew();else talk.ensure();}});
 };
 // Opening the page, once the piece and what this device kept are there: with a song chosen, the song's background plays
 // (song or AI, one or the other) and nothing is asked; with the background switched off nothing is asked either;
 // otherwise one AI background and its explanation are made — unless this piece already has them.
 const opened=useRef(false);
 useEffect(()=>{
  if(opened.current||!state.arrangement?.events.length||!ai.kept)return;
  opened.current=true;
  const {inspiration:chosen,background}=state.settings;
  if(chosen.kind!=='none'){ai.useLocal();return;}
  if(!background.enabled)return;
  if(ai.state.status==='idle')makeAi(false);else if(ai.state.status==='ready')talk.ensure();
 // Once, when the piece and the kept cache are there.
 },[state.arrangement,ai.kept]);

 // ----- shelf and sharing -----
 /** Whether this piece can go on the shelf; says why not (empty, or the untouched example). */
 const canSave=()=>{
  const arrangement=latest.current.arrangement;
  if(!arrangement?.events.length){notify('need-event','info');return false;}
  if(arrangement.origin==='example'){notify('example-save','info');return false;}
  return true;
 };
 const saveWork=async(title:string)=>{
  const current=latest.current;
  if(!canSave())return false;
  const work=shelfEntry(current,title,new Date(),{background:ai.source,prompt:ai.prompt,rules:{...RULE_VERSIONS}});
  if(!work)return false;
  const result=await repository.saveWork(work);
  if(result.status==='failed'){notify('save-failed');return false;}
  if(!current.shelved)setShelfCount(count=>count+1);
  dispatch({type:'saved',work});
  return true;
 };
 const share=async()=>{const result=await repository.share(latest.current.arrangement?.id??'');if(result.status==='unavailable')notify('share-off','info');};
 const startNew=async()=>{playback.pause();try{await repository.startNew();return true;}catch{notify('save-failed');return false;}};

 return {
  state,layout,instruments,comingInstruments,chosen:music.chosen,parts:music.parts,entries,entry:music.track,teachingOpen,teachingItems,analyseTeaching,backgroundPlan,
  playing:playback.playing,preparing:playback.preparing,ended:playback.ended,
  /** The one playback time (seconds) the playhead, progress bar and highlights read. */
  now:playback.now,total:playback.total,sounding:playback.sounding,
  // On the shelf only if the background kept is the one saved, too.
  shelved:isShelved(state)&&state.shelved?.rendering.background===ai.source,shelfCount,
  ai:ai.state,aiSource:ai.source,usingAi:ai.using,
  togglePlay:playback.togglePlay,restart:playback.restart,playFrom:playback.playFrom,scrubTo:playback.scrubTo,endScrub:playback.endScrub,
  setSpan,setInspiration,talk,
  /** A shape: the squirrel invites the child to press 播放 and find what changed. */
  setBackgroundEnabled:(enabled:boolean)=>dispatch({type:'background-enabled',enabled}),
  setBackgroundVolume:(volume:number)=>dispatch({type:'background-volume',volume}),
  toggleInstrument:(id:string)=>dispatch({type:'instrument',id}),
  showComing:()=>dispatch({type:'said',lastAction:'instrument-coming'}),
  /** The AI chip: switch between AI and local when an AI background is ready; otherwise the squirrel says why not. */
  /** The AI chip: back and forth when this piece has an AI background; otherwise one is made and played. */
  tapAi:()=>{if(ai.state.status==='ready'){ai.toggle();dispatch({type:'said',lastAction:'ai-background'});}else makeAi(false);},
  /** 换一首: new AI music and its explanation; the squirrel says how it went. */
  makeAi:()=>makeAi(true),
  canSave,saveWork,share,startNew,
  clearNotice:()=>dispatch({type:'notice',notice:null}),
 };
}
export type Compose=ReturnType<typeof useCompose>;
