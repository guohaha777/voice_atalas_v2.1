import {useEffect,useMemo,useState} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {BackgroundPlan} from '@wanwu-v2/sound-rules/background';
import type {TalkPolisher} from '../../../shared/talk/polisher';
import {localTalk,mergeTalk,polishTalk,talkKey} from '../../../shared/talk/talkView';
import type {Polished,TalkView} from '../../../shared/talk/talkView';

/**
 * 音乐小发现 and 课本讲解 for 万物成曲 (rules in shared/talk/talkView.ts). The corpus sentences show at once; when a model is
 * connected, an AI rewording is asked for in the background and only the lines that pass the checks replace them.
 */
export function useTalk(arrangement:Arrangement|null,track:TextbookTrack|null,inspiration:Inspiration,plan:BackgroundPlan|null,polisher:TalkPolisher):TalkView&{polishing:boolean}{
 const local=useMemo(()=>localTalk(arrangement,track,inspiration,plan),[arrangement,track,inspiration,plan]);
 const key=talkKey(local);
 const [polished,setPolished]=useState<{key:string;value:Polished}|null>(null);
 /** True while an AI rewording is on its way (the page shows a progress bar; the corpus lines stay meanwhile). */
 const [polishing,setPolishing]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  setPolishing(polisher.open&&!!(local.work||local.textbook));
  void polishTalk(local,polisher,controller.signal).then(value=>{if(value&&!controller.signal.aborted)setPolished({key,value});})
   .finally(()=>{if(!controller.signal.aborted)setPolishing(false);});
  return()=>controller.abort();
 // Only when what would be sent changes.
 },[key,polisher]);
 const view=useMemo(()=>mergeTalk(local,polished?.key===key?polished.value:null,polisher.open),[local,polished,key,polisher.open]);
 return useMemo(()=>({...view,polishing}),[view,polishing]);
}
