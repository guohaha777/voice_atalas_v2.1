// Local 万物成曲 repository for visitors: the current work (shared/creation/workSession) and the 作品书架
// (shared/creation/workShelf), both kept on this device by shared/storage/guestStore.ts. Nothing is uploaded; `device`
// results say so. Signed-in teachers use the cloud adapter instead (app/services.ts).
import type {ComposeRepository} from '../../pages/compose/services/composeRepository';
import {newId} from '../creation/ids';
import {workSession} from '../creation/workSession';
import {exampleArrangement} from '../creation/exampleWork';
import {workShelf} from '../creation/workShelf';

export const localComposeRepository:ComposeRepository={
 // The current work on this device; with none, the same example 万物声场 shows.
 async load(){
  const arrangement=workSession.current()??exampleArrangement(newId('work'),new Date());
  return {
   arrangement,
   settings:workSession.settings(),
   shelved:workShelf.get(arrangement.id),
   shelfCount:workShelf.list().length,
  };
 },
 async saveArrangement(arrangement){
  return workSession.save(arrangement)?{status:'device'}:{status:'failed'};
 },
 async saveSettings(settings){return workSession.saveSettings(settings)?{status:'device'}:{status:'failed'};},
 async saveWork(work){return workShelf.put(work)?{status:'device'}:{status:'failed'};},
 async share(){return {status:'unavailable',reason:'needs-account'};},
 async startNew(){workSession.reset();},
};
