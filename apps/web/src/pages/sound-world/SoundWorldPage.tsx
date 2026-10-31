import {useCallback,useEffect,useRef,useState} from 'react';
import {DEFAULT_ROWS} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import {flowSteps} from '../../app/navigation';
import {shapeWords} from '../../shared/creation/dimensionCopy';
import {moodLabels,presetMood} from '../../shared/creation/moodCopy';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {metreNames} from '../../shared/inspiration/copy';
import {InspirationDialog} from '../../shared/inspiration/InspirationDialog';
import {SoundMarker} from '../../shared/markers/SoundMarker';
import {FlowHeader} from '../../shared/ui/FlowHeader';
import {WorkHeaderActions} from '../../shared/ui/WorkHeaderActions';
import {useClassroom} from '../../shared/ui/classroom';
import {WorkIntro} from '../../shared/ui/WorkIntro';
import {Glyph} from '../../shared/ui/PaperIcon';
import {worldCopy} from './config/copy';
import {guideLines,worldGuide} from './config/guide';
import {locateSpot} from './model/fieldGeometry';
import {longestSound,minSpan,unitOf} from './model/soundWorldState';
import {useFieldDrag} from './model/useFieldDrag';
import type {DragItem} from './model/useFieldDrag';
import {useSoundWorld} from './model/useSoundWorld';
import type {FieldSpot,FinishResult,SoundWorld} from './model/useSoundWorld';
import type {LibraryScope} from './services/soundWorldRepository';
import {ClipEditor} from './components/ClipEditor';
import {MoodPicker} from './components/MoodPicker';
import {MoreSoundsDialog} from './components/MoreSoundsDialog';
import {SoundField} from './components/SoundField';
import {SoundPalette} from './components/SoundPalette';
import styles from './SoundWorldPage.module.css';
import {ui} from '../../shared/ui/controls';

/** How the frog names a song's beat: its metre, or just 拍子 when its strong beats are not sure. */
const beatWord=(track:TextbookTrack)=>track.pulse==='even'?'拍子':metreNames[track.meter];

/** What the frog says about the switch, 课本灵感 and the mood (the controls themselves carry no small text). */
function spokenChoice(world:SoundWorld){
 const {arrangement,lastAction}=world.state;
 if(!arrangement)return null;
 switch(lastAction){
  case 'background-on':return !world.beatTrack?guideLines.beatNoSong:world.beatTrack.pulse==='none'?guideLines.freeSong(world.beatTrack.title)
   :guideLines.beatOn(world.beatTrack.title,beatWord(world.beatTrack));
  case 'background-off':return guideLines.beatOff;
  case 'inspiration':{
   const track=world.beatTrack;
   if(track?.pulse==='none')return guideLines.freeSong(track.title);
   if(track)return world.beatOn?guideLines.inspirationSong(track.title,beatWord(track)):guideLines.inspirationSongQuiet(track.title);
   return world.inspiration.kind==='teaching-music'?guideLines.inspirationMusic:guideLines.inspirationNone;
  }
  case 'mood':{const mood=presetMood(arrangement.mood);return mood?guideLines.mood(moodLabels[mood]):guideLines.moodNone;}
  default:return null;
 }
}

/** The frog speaks for the page: a notice (if any) first, otherwise what to do next. One voice, no repeated hints. */
function guideText(world:SoundWorld){
 const {arrangement,selection,lastAction,notice}=world.state;
 if(notice)return worldCopy.notices[notice.key];
 if(!arrangement)return guideLines.loading;
 if(world.playing==='all')return guideLines.playing;
 // 试听 on a card: the frog says what this sound was made into.
 const heard=world.playing?.startsWith('unit:')&&unitOf(arrangement,world.playing.slice(5));
 if(heard)return guideLines.unitHeard(heard.name,shapeWords(heard.shape));
 if(lastAction==='span-fitted'||lastAction==='span-blocked'){
  const longest=longestSound(arrangement);
  if(longest){const seconds=Math.ceil(longest.seconds-1e-6),line=lastAction==='span-fitted'?guideLines.spanFitted:guideLines.spanBlocked;
   return line(longest.unit.name,seconds,lastAction==='span-fitted'?arrangement.spanSeconds:minSpan(arrangement));}
 }
 const said=spokenChoice(world);if(said)return said;
 if(selection?.kind==='unit')return guideLines.unitSelected(unitOf(arrangement,selection.unitId)?.name??'');
 if(lastAction==='copied')return guideLines.copied;
 if(lastAction==='span')return guideLines.span(arrangement.spanSeconds);
 if(lastAction==='placed')return guideLines.placed;
 if(lastAction==='clipped')return guideLines.clipped;
 if(lastAction==='moved')return guideLines.moved;
 if(selection?.kind==='event')return guideLines.eventSelected;
 if(lastAction==='removed')return guideLines.removed;
 if(lastAction==='row-added')return guideLines.rowAdded;
 if(lastAction==='cleared')return guideLines.cleared;
 if(arrangement.origin==='example')return guideLines.example;
 if(!arrangement.events.length)return guideLines.empty;
 return guideLines.idle;
}

/** 万物声场: pick a sound, tap the field to place it; left → right is order, up → down is height. */
export function SoundWorldPage({onNavigate,onFinish}:{onNavigate:(path:string)=>void;onFinish:(arrangement:Arrangement)=>FinishResult}){
 // Hand-off to 万物成曲 goes through the app (the arrangement is already in the current work).
 const world=useSoundWorld(onFinish);
 const classroom=useClassroom();
 const area=useRef<HTMLDivElement>(null);
 const [more,setMore]=useState<LibraryScope|null>(null);
 /** The occurrence open in 剪一剪, if any. */
 const [trimming,setTrimming]=useState<string|null>(null);
 const [inspiring,setInspiring]=useState(false);
 const rows=useRef(DEFAULT_ROWS);rows.current=world.state.arrangement?.rows??DEFAULT_ROWS;
 const locate=useCallback((x:number,y:number):FieldSpot|null=>{
  const box=area.current?.getBoundingClientRect();
  return box?locateSpot(box,rows.current,x,y):null;
 },[]);
 const {drag,bind}=useFieldDrag(locate,
  (item:DragItem,spot)=>item.kind==='unit'?world.placeUnit(item.unitId,spot):world.moveEvent(item.eventId,spot),
  (item:DragItem)=>item.kind==='unit'?world.selectUnit(item.unitId):world.tapEvent(item.eventId));
 // Esc lets go of the current selection anywhere on the page (dialogs handle their own Esc).
 const deselect=useRef(world.deselect);deselect.current=world.deselect;
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))deselect.current();};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key);
 },[]);
 const text=guideText(world);
 const busy=world.preparing==='all',playingAll=world.playing==='all';
 const dragUnit=drag&&(drag.item.kind==='unit'?unitOf(world.state.arrangement,drag.item.unitId)
  :unitOf(world.state.arrangement,world.state.arrangement?.events.find(event=>drag.item.kind==='event'&&event.id===drag.item.eventId)?.unitId??''));
 return <div className={styles.shell} data-dragging={!!drag||undefined}>
  <FlowHeader steps={flowSteps} current="world" onNavigate={onNavigate} aside={<WorkHeaderActions onNavigate={onNavigate} onLibrary={()=>setMore('example')} classroom={classroom}/>}/>
  <main className={styles.page}>
   <WorkIntro title={worldCopy.title} subtitle={worldCopy.subtitle} guide={worldGuide} text={text} tone={world.state.notice?.tone} fit/>
   <div className={styles.workspace}>
    <SoundPalette world={world} bind={bind} onMore={setMore} onInspiration={()=>setInspiring(true)}/>
    <div className={styles.stageColumn}>
     <SoundField world={world} area={area} locate={locate} drag={drag} bind={bind} onTrim={setTrimming}/>
     <MoodPicker world={world}/>
     <div className={styles.actions}>
      <button type="button" className={`${ui.pill} ${ui.back} ${styles.backButton}`} onClick={()=>onNavigate('/create')}><Glyph name="back"/>{worldCopy.back}</button>
      <button type="button" className={`${ui.pill} ${ui.go} ${styles.playAll}`} aria-pressed={playingAll} data-busy={busy||undefined} disabled={!world.state.arrangement} onClick={()=>void world.playAll()}>
       <span className={styles.playIcon}><Glyph name={playingAll?'stop':'play'}/></span>{busy?worldCopy.preparing:playingAll?worldCopy.stopAll:worldCopy.playAll}
      </button>
      <button type="button" className={`${ui.pill} ${ui.outline} ${ui.forward} ${styles.finish}`} aria-disabled={world.state.blocked||undefined} onClick={()=>void world.finish()}>
       {world.state.blocked?worldCopy.finishUnavailable:worldCopy.finish}<Glyph name="arrow"/>
      </button>
     </div>
    </div>
   </div>
  </main>
  {drag&&dragUnit&&<span className={styles.dragGhost} style={{left:drag.x,top:drag.y}} aria-hidden="true"><SoundMarker index={dragUnit.markerIndex} name={dragUnit.maker} className={styles.ghostMarker} face="happy"/></span>}
  {more&&<MoreSoundsDialog world={world} initial={more} onClose={()=>setMore(null)} onMakeNew={()=>{setMore(null);onNavigate('/create?new');}}/>}
  {trimming&&<ClipEditor world={world} eventId={trimming} onClose={()=>setTrimming(null)}/>}
  {/* Here a song lends only its beat: no 帮我找找, and 听一听 plays the beat (the full background is 万物成曲's). */}
  {inspiring&&<InspirationDialog variant="beat" value={world.inspiration} entries={world.inspirationEntries}
   teachingOpen={world.teachingOpen} teachingItems={world.teachingItems} onAnalyse={world.analyseTeaching}
   onChange={world.setInspiration} onClose={()=>{world.applyChosenSong();setInspiring(false);}}/>}
 </div>;
}
