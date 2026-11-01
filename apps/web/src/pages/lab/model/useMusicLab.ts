// 系统音乐上传 (/lab/music): pick a recording, measure it here exactly as a teacher's upload is measured (decoded at
// MEASURE_RATE, then measure), let a professional fill in any answers, hear the recording with the beat, and save it as a
// system song or a test-set recording through the dev server (apps/web/dev/labMusicStore.ts). 全部重测 measures every
// saved recording again and judges it against its answers (@wanwu-v2/music-features evaluate).
import {useEffect,useMemo,useRef,useState} from 'react';
import {MEASURE_RATE,MEASURE_VERSION,judge,measure,pickRhythm,report} from '@wanwu-v2/music-features';
import type {FieldCheck,JudgedRecording,Measurement,MusicAnswers} from '@wanwu-v2/music-features';
import {BACKGROUND_RULES,MIX_RULES,MUSIC_TYPES_RULES} from '@wanwu-v2/sound-rules/rules';
import {decodeAudio} from '../../../shared/audio/loadAudio.ts';
import {SequencePlayer} from '../../../shared/audio/SequencePlayer.ts';
import {renderBeat,songBeat} from '../../../shared/inspiration/beat.ts';
import {firstStrongBeat} from '../../../shared/inspiration/originalBeat.ts';
import {monoOf} from '../../../shared/inspiration/teachingCard.ts';

const ROUTE='/__lab/music';
export type LabSet='system'|'test';
export type LabRecord={
 id:string;
 name:string;
 set:LabSet;
 file:string;
 answers:MusicAnswers;
 savedAt:string;
};
export type Measured={m:Measurement;picked:number[];buffer:AudioBuffer};
/** The recording being looked at: a new file (not saved yet) or a saved record, its answers and its measurement. */
type Draft={
 record:LabRecord|null;
 file:File|null;
 name:string;
 set:LabSet;
 answers:MusicAnswers;
 measured:Measured|null;
 error:boolean;
};
export type Evaluated={record:LabRecord;m:Measurement;checks:FieldCheck[]};

const blank:Draft={record:null,file:null,name:'',set:'test',answers:{},measured:null,error:false};

async function measured(bytes:ArrayBuffer):Promise<Measured>{
 const buffer=await decodeAudio(bytes,MEASURE_RATE);
 const m=measure(monoOf(buffer),buffer.sampleRate);
 return {m,picked:pickRhythm(m.candidates,m.meter),buffer};
}
const base64=async(file:File)=>{
 const bytes=new Uint8Array(await file.arrayBuffer());
 let binary='';
 for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary);
};
const audioOf=(record:LabRecord)=>fetch(`${ROUTE}/audio/${encodeURIComponent(record.id)}`).then(r=>{
 if(!r.ok)throw new Error('audio');
 return r.arrayBuffer();
});

export function useMusicLab(){
 const [records,setRecords]=useState<LabRecord[]>([]);
 const [available,setAvailable]=useState(true);
 const [draft,setDraft]=useState<Draft>(blank);
 const [busy,setBusy]=useState<'measuring'|'saving'|'evaluating'|null>(null);
 const [status,setStatus]=useState<string|null>(null);
 const [evaluated,setEvaluated]=useState<Evaluated[]|null>(null);
 const [playing,setPlaying]=useState(false);
 const player=useMemo(()=>new SequencePlayer(key=>setPlaying(!!key)),[]);
 const asked=useRef(0);
 useEffect(()=>()=>player.stop(),[player]);

 const load=async()=>{
  try{
   const r=await fetch(ROUTE);
   if(!r.ok)throw new Error('store');
   setRecords(((await r.json()) as {items:LabRecord[]}).items);
   setAvailable(true);
  }
  // No dev server store (a build): the page says it is unavailable.
  catch{
   setAvailable(false);
  }
 };
 useEffect(()=>{
  void load();
 },[]);

 /** Shows a recording and measures it (a newer one wins). */
 const measureInto=async(next:Draft,bytes:()=>Promise<ArrayBuffer>)=>{
  const ask=++asked.current;
  player.stop();
  setStatus(null);
  setDraft({...next,measured:null,error:false});
  setBusy('measuring');
  try{
   const result=await measured(await bytes());
   if(asked.current===ask)setDraft(current=>({...current,measured:result}));
  }
  catch{
   if(asked.current===ask)setDraft(current=>({...current,error:true}));
  }
  finally{
   if(asked.current===ask)setBusy(null);
  }
 };
 const pickFile=(file:File)=>void measureInto(
  {...blank,set:draft.set,file,name:file.name.replace(/\.[^.]+$/,'').slice(0,40)},
  ()=>file.arrayBuffer());
 const openRecord=(record:LabRecord)=>void measureInto(
  {...blank,record,name:record.name,set:record.set,answers:{...record.answers}},
  ()=>audioOf(record));

 const setAnswer=<K extends keyof MusicAnswers>(field:K,value:MusicAnswers[K]|undefined)=>setDraft(current=>{
  const answers={...current.answers};
  if(value===undefined)delete answers[field];
  else answers[field]=value;
  return {...current,answers};
 });

 const save=async()=>{
  setBusy('saving');
  setStatus(null);
  try{
   // A saved record: only its answers; a new file: the recording too.
   const r=draft.record
    ?await fetch(`${ROUTE}/answers/${encodeURIComponent(draft.record.id)}`,{
     method:'PUT',
     headers:{'content-type':'application/json'},
     body:JSON.stringify({answers:draft.answers}),
    })
    :await fetch(ROUTE,{
     method:'POST',
     headers:{'content-type':'application/json'},
     body:JSON.stringify({
      name:draft.name.trim(),
      set:draft.set,
      fileName:draft.file!.name,
      audio:await base64(draft.file!),
      answers:draft.answers,
     }),
    });
   if(!r.ok)throw new Error('save');
   const record=await r.json() as LabRecord;
   setDraft(current=>({...current,record,file:null}));
   setStatus('saved');
   await load();
  }catch{
   setStatus('failed');
  }
  finally{
   setBusy(null);
  }
 };

 /** The recording with a beat: the answers' tempo, metre and first strong beat where filled, else the measured ones. */
 const listen=async()=>{
  if(playing){
   player.stop();
   return;
  }
  const made=draft.measured;
  if(!made)return;
  const {m}=made;
  const a=draft.answers;
  const track={
   tempoBpm:a.tempoBpm??m.tempoBpm,
   meter:a.meter??m.meter,
   pulse:(a.rhythm??m.features.rhythm)==='free'?'none' as const:undefined,
  };
  const beatAt=firstStrongBeat(a.downbeatSeconds??m.downbeatSeconds,track);
  const beat=await renderBeat(songBeat(track,Math.max(.1,made.buffer.duration-beatAt)));
  await player.play(
   'lab',
   [{at:0,buffer:made.buffer},{at:beatAt,buffer:beat,layer:'beat'}],
   MIX_RULES.childGain,
   {layers:{beat:BACKGROUND_RULES.beat.withOriginal},limiter:MIX_RULES.limiter});
 };

 /** Every saved recording measured again and judged against its answers. */
 const evaluateAll=async()=>{
  setBusy('evaluating');
  setStatus(null);
  const out:Evaluated[]=[];
  for(const record of records){
   try{
    const {m,picked}=await measured(await audioOf(record));
    out.push({record,m,checks:judge(m,record.answers,picked)});
   }catch{/* skipped: unreadable */}
  }
  setEvaluated(out);
  setBusy(null);
 };
 const summary=evaluated
  ?report(evaluated.map(({record,m,checks}):JudgedRecording=>({set:record.set,path:m.path,checks})))
  :null;

 const saveReport=async()=>{
  if(!evaluated||!summary)return;
  try{
   const r=await fetch(`${ROUTE}/report`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    at:new Date().toISOString(),
    measure:MEASURE_VERSION,
    rules:MUSIC_TYPES_RULES.version,
    summary,
    items:evaluated.map(({record,m,checks})=>({
     id:record.id,
     name:record.name,
     set:record.set,
     answers:record.answers,
     checks,
     measured:{
      musical:m.musical,
      features:m.features,
      path:m.path,
      traits:m.traits,
      tempoBpm:m.tempoBpm,
      meter:m.meter,
      downbeatSeconds:m.downbeatSeconds,
      tonic:m.tonic,
      mode:m.mode,
     },
    })),
   })});
   if(!r.ok)throw new Error('report');
   setStatus(`report:${((await r.json()) as {file:string}).file}`);
  }catch{
   setStatus('failed');
  }
 };

 // Saved records need only their answers; a new file needs a name.
 const canSave=available&&!!draft.measured&&!busy&&(!!draft.record||(!!draft.file&&!!draft.name.trim()));
 return {
  records,
  available,
  draft,
  busy,
  status,
  evaluated,
  summary,
  playing,
  canSave,
  pickFile,
  openRecord,
  setAnswer,
  setName:(name:string)=>setDraft(current=>({...current,name})),
  setSet:(set:LabSet)=>setDraft(current=>({...current,set})),
  save,
  listen,
  evaluateAll,
  saveReport,
 };
}
export type MusicLab=ReturnType<typeof useMusicLab>;
