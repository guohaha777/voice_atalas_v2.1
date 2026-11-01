import type {ReactNode} from 'react';
import {ANSWER_FIELDS,judge} from '@wanwu-v2/music-features';
import type {AnswerField,FieldCheck,Measurement,MusicAnswers,Summary} from '@wanwu-v2/music-features';
import {KEY_NAMES,musicCopy as copy} from './config/musicCopy';
import {useMusicLab} from './model/useMusicLab';
import type {LabSet,MusicLab} from './model/useMusicLab';
import styles from './MusicLabPage.module.css';

/**
 * 系统音乐上传 (/lab/music): the internal entry for system songs and the test set — upload, measure here, fill in any
 * answers, hear it with the beat, save; then measure everything again and compare. Built only in development or a
 * preview build with VITE_ENABLE_LAB=1 (app/App.tsx); saving needs the dev server (apps/web/dev/labMusicStore.ts).
 */
export function MusicLabPage(){
 const lab=useMusicLab();
 return <main className={styles.page}>
  <header className={styles.header}>
   <h1>
    {copy.title}
    <a href="/lab/sound-rules">{copy.toRules}</a>
    <a href="/lab/prompts">{copy.toPrompts}</a>
   </h1>
   <p>{copy.subtitle}<br/>{copy.readme}</p>
   {!lab.available&&<p className={styles.note}>{copy.unavailable}</p>}
  </header>
  <div className={styles.columns}>
   <Upload lab={lab}/>
   <Saved lab={lab}/>
  </div>
 </main>;
}

function Upload({lab}:{lab:MusicLab}){
 const {draft}=lab;
 const m=draft.measured?.m;
 return <section className={styles.panel}>
  <h2>{draft.record?draft.record.name:copy.upload}</h2>
  {!draft.record&&<div className={styles.row}>
   <label>
    {copy.file}
    <input
     type="file"
     accept="audio/*"
     onChange={event=>{
      const file=event.target.files?.[0];
      if(file)lab.pickFile(file);
      event.target.value='';
     }}/>
   </label>
   <label>
    {copy.name}
    <input value={draft.name} maxLength={40} onChange={event=>lab.setName(event.target.value)}/>
   </label>
   <label>
    {copy.set}
    <select value={draft.set} onChange={event=>lab.setSet(event.target.value as LabSet)}>
     {(['test','system'] as const).map(set=><option key={set} value={set}>{copy.sets[set]}</option>)}
    </select>
   </label>
  </div>}
  {draft.record&&<p className={styles.muted}>{copy.sets[draft.record.set]} · {draft.record.file}</p>}
  {lab.busy==='measuring'&&<p className={styles.muted}>{copy.measuring}</p>}
  {draft.error&&<p className={styles.note}>{copy.unreadable}</p>}
  {m&&<>
   <p className={styles.path}>
    <b>{copy.path}</b>
    {copy.paths[m.path]}
    <small>{JSON.stringify(m.traits)}</small>
   </p>
   <table className={styles.fields}>
    <thead>
     <tr>
      <th/>
      <th>{copy.measured}</th>
      <th>{copy.answer}</th>
     </tr>
    </thead>
    <tbody>
     {ANSWER_FIELDS.map(field=><AnswerRow key={field} field={field} lab={lab} m={m} picked={draft.measured!.picked}/>)}
     <tr>
      <th>{copy.fields.voice}</th>
      <td className={styles.muted}>{copy.voiceNote}</td>
      <td>{choice(draft.answers.voice,copy.values.voice,value=>lab.setAnswer('voice',value))}</td>
     </tr>
    </tbody>
   </table>
   <div className={styles.actions}>
    <button type="button" onClick={()=>void lab.listen()}>{lab.playing?copy.stop:copy.listen}</button>
    <button type="button" className={styles.primary} disabled={!lab.canSave} onClick={()=>void lab.save()}>
     {lab.busy==='saving'?copy.saving:draft.record?copy.saveAnswers:copy.save}
    </button>
    {lab.status==='saved'&&<span>{copy.saved}</span>}
    {lab.status==='failed'&&<span className={styles.bad}>{copy.failed}</span>}
   </div>
   <p className={styles.muted}>{copy.listenNote}</p>
  </>}
 </section>;
}

/** A yes / no or one-of choice; empty = not filled. */
function choice<T extends string|boolean>(value:T|undefined,labels:Record<string,string>,set:(value:T|undefined)=>void){
 return <select value={value===undefined?'':String(value)} onChange={event=>{
  const raw=event.target.value;
  set(raw===''?undefined:(raw==='true'?true:raw==='false'?false:raw) as T);
 }}>
  <option value="">{copy.notFilled}</option>
  {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
 </select>;
}
const numberInput=(value:number|undefined,step:string,set:(value:number|undefined)=>void)=>
 <input
  type="number"
  step={step}
  value={value??''}
  placeholder={copy.notFilled}
  onChange={event=>{
   const n=parseFloat(event.target.value);
   set(Number.isFinite(n)?n:undefined);
  }}/>;

const keyName=(tonic:number,mode:string)=>`${KEY_NAMES[tonic]} ${copy.values.mode[mode as keyof typeof copy.values.mode]}`;
function shown(field:AnswerField,m:Measurement,picked:readonly number[]):string{
 switch(field){
  case 'musical':return copy.values.musical[`${m.musical}`];
  case 'rhythm':return copy.values.rhythm[m.features.rhythm];
  case 'texture':return copy.values.texture[m.features.texture];
  case 'drums':return copy.values.drums[`${m.features.drums}`];
  case 'tempoBpm':return `${m.tempoBpm}`;
  case 'meter':return `${m.meter}/4`;
  case 'downbeatSeconds':return `${m.downbeatSeconds}`;
  case 'tonic':return KEY_NAMES[m.tonic]!;
  case 'mode':return copy.values.mode[m.mode];
  case 'rhythmCell':return picked.join(' ');
 }
}

function AnswerRow({field,lab,m,picked}:{field:AnswerField;lab:MusicLab;m:Measurement;picked:readonly number[]}){
 const a=lab.draft.answers;
 const set=<K extends keyof MusicAnswers>(key:K)=>(value:MusicAnswers[K]|undefined)=>lab.setAnswer(key,value);
 let input:ReactNode;
 switch(field){
  case 'musical':
   input=choice(a.musical,copy.values.musical,set('musical'));
   break;
  case 'rhythm':
   input=choice(a.rhythm,copy.values.rhythm,set('rhythm'));
   break;
  case 'texture':
   input=choice(a.texture,copy.values.texture,set('texture'));
   break;
  case 'drums':
   input=choice(a.drums,copy.values.drums,set('drums'));
   break;
  case 'tempoBpm':
   input=numberInput(a.tempoBpm,'1',set('tempoBpm'));
   break;
  case 'meter':
   input=choice(
    a.meter===undefined?undefined:`${a.meter}`,
    {2:'2/4',3:'3/4',4:'4/4'},
    value=>lab.setAnswer('meter',value===undefined?undefined:Number(value) as 2|3|4));
   break;
  case 'downbeatSeconds':
   input=numberInput(a.downbeatSeconds,'0.001',set('downbeatSeconds'));
   break;
  case 'tonic':
   input=choice(
    a.tonic===undefined?undefined:`${a.tonic}`,
    Object.fromEntries(KEY_NAMES.map((name,i)=>[i,name])),
    value=>lab.setAnswer('tonic',value===undefined?undefined:Number(value)));
   break;
  case 'mode':
   input=choice(a.mode,copy.values.mode,set('mode'));
   break;
  case 'rhythmCell':
   // Beat lengths separated by spaces; anything else counts as not filled.
   input=<input
    defaultValue={a.rhythmCell?.join(' ')??''}
    key={lab.draft.record?.id??lab.draft.name}
    placeholder={copy.notFilled}
    onChange={event=>{
     const cell=event.target.value.trim().split(/\s+/).map(Number);
     lab.setAnswer('rhythmCell',event.target.value.trim()&&cell.every(n=>Number.isFinite(n)&&n>0)?cell:undefined);
    }}/>;
   break;
 }
 const check=lab.draft.measured?judgeOne(field,lab):null;
 return <tr data-ok={check?String(check.ok):undefined}>
  <th>{copy.fields[field]}</th>
  <td>
   {shown(field,m,picked)}
   {field==='tonic'&&<small> （{keyName(m.tonic,m.mode)}）</small>}
   {check&&<Mark check={check}/>}
  </td>
  <td>{input}</td>
 </tr>;
}
function judgeOne(field:AnswerField,lab:MusicLab){
 const made=lab.draft.measured!;
 return (lab.draft.answers[field]===undefined
  ?null
  :judge(made.m,lab.draft.answers,made.picked).find(check=>check.field===field))??null;
}
function Mark({check}:{check:FieldCheck}){
 return <span className={check.ok?styles.good:styles.bad}>{check.ok?' ✓':' ✗'}{check.note&&` ${copy.notes[check.note]}`}</span>;
}

function Saved({lab}:{lab:MusicLab}){
 return <section className={styles.panel}>
  <h2>{copy.list}</h2>
  {!lab.records.length&&<p className={styles.muted}>{copy.empty}</p>}
  <ul className={styles.records}>
   {lab.records.map(record=>{
    const result=lab.evaluated?.find(item=>item.record.id===record.id);
    return <li key={record.id}>
     <button type="button" onClick={()=>lab.openRecord(record)}>{record.name}</button>
     <small>{copy.sets[record.set]} · {copy.answered(Object.keys(record.answers).length)}</small>
     {result&&<small>
      {copy.result(copy.paths[result.m.path],result.checks.filter(check=>check.ok).length,result.checks.length)}
     </small>}
    </li>;
   })}
  </ul>
  <div className={styles.actions}>
   <button type="button" disabled={!lab.records.length||!!lab.busy} onClick={()=>void lab.evaluateAll()}>
    {lab.busy==='evaluating'?copy.evaluating:copy.evaluate}
   </button>
   {lab.summary&&<button type="button" onClick={()=>void lab.saveReport()}>{copy.saveReport}</button>}
   {lab.status?.startsWith('report:')&&<span>{copy.reportSaved(lab.status.slice('report:'.length))}</span>}
  </div>
  {lab.summary&&<>
   <h2>{copy.summary}</h2>
   {(['system','test'] as const).map(set=><div key={set}>
    <h3>{copy.sets[set]}（{lab.summary![set].count}）</h3>
    <Scores summary={lab.summary![set].all}/>
    {Object.entries(lab.summary![set].byPath).map(([path,summary])=><details key={path}>
     <summary>{copy.byPath} · {copy.paths[path as keyof typeof copy.paths]}</summary>
     <Scores summary={summary}/>
    </details>)}
   </div>)}
  </>}
 </section>;
}

function Scores({summary}:{summary:Summary}){
 const fields=ANSWER_FIELDS.filter(field=>summary[field]);
 if(!fields.length)return <p className={styles.muted}>{copy.noAnswers}</p>;
 return <table className={styles.fields}>
  <tbody>
   {fields.map(field=>{
    const score=summary[field]!;
    return <tr key={field}>
     <th>{copy.fields[field]}</th>
     <td>{copy.judged(score.right,score.judged)}</td>
     <td className={styles.muted}>
      {Object.entries(score.notes).map(([note,count])=>`${copy.notes[note as keyof typeof copy.notes]} ${count}`).join('，')}
     </td>
    </tr>;
   })}
  </tbody>
 </table>;
}
