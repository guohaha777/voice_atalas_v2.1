import {useCallback,useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {InspirationCatalog} from './catalog';
import {teachingMusic} from './teachingMusic';
import type {TeachingMusicService} from './teachingMusic';

/**
 * 课本灵感 for a page (万物声场, 万物成曲): the textbook songs from the one catalogue port, the teaching music on this device with its cards, and whether a model can make those cards. `tracks` is
 * every card an inspiration can point to (songs and teaching music), for the background to borrow from. Both pages read
 * the same songs and the same choice (kept with the work), so what a child picks in one is what the other shows.
 */
export function useInspirationCatalog(catalog:InspirationCatalog,teaching:TeachingMusicService){
 const [entries,setEntries]=useState<readonly TextbookTrack[]>([]);
 useEffect(()=>{
  let live=true;
  void catalog.list().then(list=>{if(live)setEntries(list.entries);});
  return()=>{live=false;};
 },[catalog]);
 const teachingItems=useSyncExternalStore(teachingMusic.subscribe,teachingMusic.list,teachingMusic.list);
 const tracks=useMemo(()=>[...entries,...teachingItems.flatMap(item=>item.card?[item.card.track]:[])],[entries,teachingItems]);
 /** Makes a teaching-music card (once) with the server's models when they are there, else the program alone. */
 const analyseTeaching=useCallback((musicId:string)=>void teachingMusic.analyse(musicId,teaching.analyseAvailable?teaching.features:null),[teaching]);
 return {entries,tracks,teachingItems,analyseTeaching,teachingOpen:teaching.analyseAvailable};
}
