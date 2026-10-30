// Local 万物声场 repository for visitors: the example field and units, and the work kept on this device (workSession,
// saved to the browser by shared/storage/guestStore.ts). Class and public sound libraries are reported as not open.
// Signed-in teachers use the cloud adapter instead (app/services.ts).
import type {SoundWorldRepository} from '../../pages/sound-world/services/soundWorldRepository';
import {newId} from '../creation/ids.ts';
import {workSession} from '../creation/workSession.ts';
import {exampleArrangement,exampleUnit} from '../creation/exampleWork.ts';
import {bundledSoundLibrary} from '../creation/soundLibrary.ts';

export const localSoundWorldRepository:SoundWorldRepository={
 // The child's own work if there is one on this device; otherwise the example field.
 async load(){return workSession.current()??exampleArrangement(newId('work'),new Date());},
 async save(arrangement){return workSession.save(arrangement)?{status:'device'}:{status:'failed'};},
 async scope(scope){
  switch(scope){
   // The same library 声音诞生 picks from (shared/creation/soundLibrary.ts), as units with the examples' presets.
   case 'example':return {status:'ready',units:(await bundledSoundLibrary.list()).examples.map(example=>exampleUnit(example.id,0))};
   case 'mine':return {status:'ready',units:workSession.current()?.units.filter(unit=>unit.input!=='example-preset')??[]};
   case 'class':return {status:'unavailable',reason:'needs-account'};
   case 'teachers':return {status:'unavailable',reason:'needs-account'};
   case 'public':return {status:'unavailable',reason:'needs-review'};
  }
 },
 async loadSettings(){return workSession.settings();},
 async saveSettings(settings){return workSession.saveSettings(settings)?{status:'device'}:{status:'failed'};},
};
