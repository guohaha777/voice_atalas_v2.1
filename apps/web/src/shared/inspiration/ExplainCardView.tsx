import {useState} from 'react';
import type {ReactNode} from 'react';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {explainCard} from '@wanwu-v2/prompts/explain';
import type {ExplainReply,FactSource} from '@wanwu-v2/prompts/explain';
import {moodLabels} from '../creation/moodCopy';
import {Glyph} from '../ui/PaperIcon';
import type {GlyphName} from '../ui/PaperIcon';
import {inspirationCopy as copy} from './copy';
import styles from './ExplainCardView.module.css';

/** 给孩子: 听一听 / 动一动 / 玩一玩, each with its solid icon (coloured directly, no backing). */
const CHILD_ROWS=[
 ['listen','volume'],
 ['move','step'],
 ['play','note'],
] as const satisfies readonly (readonly [string,GlyphName])[];

/** A sentence with its highlighted words marked (a word is marked where it appears; the rest stays plain text). */
function Marked({text,words}:{text:string;words:readonly string[]}){
 const pattern=words.filter(Boolean);
 if(!pattern.length)return <>{text}</>;
 const parts=text.split(new RegExp(`(${pattern.map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`));
 return <>{parts.map((part,i)=>pattern.includes(part)?<mark key={i}>{part}</mark>:part)}</>;
}

/**
 * 讲解卡 (layout A, decided 2026-10-31): the song's card in a fixed structure — title and mood, the rhythm bar the program
 * draws (a long block for a long note, the strong beat darker, the syllables under it), then 听一听 / 动一动 / 玩一玩; 给老师
 * switches to the music facts (each with where it came from) and the teacher's 听 / 动 / 玩. Every sentence is the
 * model's checked one or the corpus line (@wanwu-v2/prompts/explain), so the layout never depends on the model.
 */
export function ExplainCardView({track,reply,sources,footer}:{
 track:TextbookTrack;
 reply:ExplainReply|null;
 sources:{numbers:FactSource;rhythm:FactSource};
 footer?:ReactNode;
}){
 const [reader,setReader]=useState<'child'|'teacher'>('child');
 const card=explainCard(track,reply,sources);
 /** The bar's length in beats: each note's width is its share. */
 const total=card.rhythm?.notes.reduce((sum,note)=>sum+note.beats,0)??1;
 return <div className={styles.card}>
  <div className={styles.head}>
   <b className={styles.title}>{card.title}</b>
   <span className={styles.mood}>{moodLabels[card.mood]}</span>
   <div className={styles.readers} role="group" aria-label={copy.explain.readers}>
    {(['child','teacher'] as const).map(id=><button key={id} type="button" aria-pressed={reader===id} onClick={()=>setReader(id)}>
     {copy.explain[id]}
    </button>)}
   </div>
  </div>
  {reader==='child'?<>
   {card.rhythm&&<div className={styles.bar} aria-label={copy.explain.bar(card.rhythm.said)}>
    {card.rhythm.notes.map((note,i)=><span
     key={i}
     className={styles.note}
     style={{flexGrow:note.beats/total}}
     data-strong={note.strong||undefined}>
     <i aria-hidden="true"/>
     <small>{note.syllable}</small>
    </span>)}
   </div>}
   <div className={styles.rows}>
    {CHILD_ROWS.map(([id,glyph])=><p key={id} data-row={id}>
     <Glyph name={glyph} className={styles.icon}/>
     <span>
      <b>{copy.explain.childRows[id]}</b>
      <Marked text={card.child[id]} words={card.highlight}/>
     </span>
    </p>)}
   </div>
  </>:<>
   <div className={styles.facts}>
    {card.teacher.facts.map(fact=><span key={fact.label}>
     {fact.label}
     <small>{fact.source}</small>
    </span>)}
   </div>
   <div className={styles.rows} data-teacher>
    {(['listen','move','play'] as const).map(id=><p key={id}>
     <span>
      <b>{copy.explain.teacherRows[id]}</b>
      {card.teacher[id]}
     </span>
    </p>)}
   </div>
  </>}
  {footer}
 </div>;
}
