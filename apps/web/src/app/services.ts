// Select cloud adapters for authenticated creation and local adapters for visitors (kept on this device). Bundled examples
// and honest offline features remain in use. No mock data is left (the old examples live on as test fixtures).
import type {ComposeRepository} from '../shared/ports/composeRepository.ts';
import {presetHintProvider} from '../pages/sound-birth/services/soundHints.ts';
import type {SoundHintProvider} from '../pages/sound-birth/services/soundHints.ts';
import type {MoodInterpreter} from '../shared/ports/moodInterpreter.ts';
import type {SoundWorldRepository} from '../shared/ports/soundWorldRepository.ts';
import type {ShelfRepository} from '../shared/ports/shelfRepository.ts';
import type {BackgroundGenerator} from '../shared/background/generator.ts';
import type {BackgroundLibrary} from '../shared/background/library.ts';
import type {InspirationCatalog} from '../shared/inspiration/catalog.ts';
import {teachingMusic} from '../shared/inspiration/teachingMusic.ts';
import type {TeachingMusicService} from '../shared/inspiration/teachingMusic.ts';
import {bundledSoundLibrary} from '../shared/creation/soundLibrary.ts';
import type {SoundLibraryService} from '../shared/creation/soundLibrary.ts';
import type {TalkPolisher} from '../shared/talk/polisher.ts';
import {bundledInspirationCatalog} from '../shared/inspiration/textbookTracks.ts';
import {localComposeRepository} from '../shared/local/composeRepository.ts';
import {localShelfRepository} from '../shared/local/shelfRepository.ts';
import {localSoundWorldRepository} from '../shared/local/soundWorldRepository.ts';
import {localBackgroundLibrary} from '../shared/background/localInstruments.ts';
import {CookieAccountClient} from '../shared/account/accountClient.ts';
import type {AccountClient} from '../shared/account/accountClient.ts';
import {CloudWorkspace} from '../shared/cloud/cloudWorkspace.ts';
import {cloudAdapters} from '../shared/cloud/adapters.ts';
import {GuestAiClient} from '../shared/guest-ai/guestAiClient.ts';
import {guestBackgroundGenerator,guestMoodInterpreter,guestTalkPolisher,guestTeachingMusicService} from '../shared/guest-ai/adapters.ts';
import {visitorModels} from '../shared/model-config/visitorModels.ts';
import {indexedDbStore,keepGuestWork,restoreGuestWork} from '../shared/storage/guestStore.ts';
import {decodeKept} from '../shared/storage/decodeKept.ts';

export type Services={
 account:AccountClient;
 cloud:CloudWorkspace;
 soundLibrary:SoundLibraryService;
 soundHints:SoundHintProvider;
 soundWorldRepository:SoundWorldRepository;
 moodInterpreter:MoodInterpreter;
 composeRepository:ComposeRepository;
 shelfRepository:ShelfRepository;
 backgroundLibrary:BackgroundLibrary;
 backgroundGenerator:BackgroundGenerator;
 inspirationCatalog:InspirationCatalog;
 teachingMusic:TeachingMusicService;
 talkPolisher:TalkPolisher;
};

const account=new CookieAccountClient(),cloud=new CloudWorkspace(account);
// 游客 AI (no account needed): the server's guest module, with the visitor's own 「API 输入」 settings when filled.
const guestAi=new GuestAiClient(visitorModels.get);
if(typeof window!=='undefined')void guestAi.loadStatus();

/**
 * A visitor's work kept on this device: restored once at start (main.tsx waits for it briefly before the first render),
 * then written back on every change while no account is signed in.
 */
export const guestWorkReady:Promise<void>=(async()=>{
 const store=typeof window!=='undefined'?indexedDbStore():null;
 if(!store)return;
 try{await restoreGuestWork(store,decodeKept);}catch{/* nothing kept, or storage unavailable */}
 keepGuestWork(store,()=>!cloud.getSnapshot().accountId);
})();
// Teaching music picked on this device (with its cards) is kept in its own store, signed in or not: it never leaves
// the device except the 30 s excerpt a card is made from.
if(typeof window!=='undefined')void teachingMusic.attach(indexedDbStore('wanwu-teaching'));
export const services:Services={
 inspirationCatalog:bundledInspirationCatalog,
 backgroundLibrary:localBackgroundLibrary,
 ...cloudAdapters(cloud,{
  composeRepository:localComposeRepository,
  soundWorldRepository:localSoundWorldRepository,
  shelfRepository:localShelfRepository,
  soundLibrary:bundledSoundLibrary,
 }),
 // Real cookie adapter. A missing/disabled API reports unavailable, never a fake login.
 account,cloud,
 // Guest AI from the server: mood words, AI background (AI notes now; AI audio once the music model is connected) and
 // talk rewording. Each falls back to the local result when the server or model is not available.
 moodInterpreter:guestMoodInterpreter(guestAi),
 backgroundGenerator:guestBackgroundGenerator(guestAi),
 talkPolisher:guestTalkPolisher(guestAi),
 // 教学音乐出卡: the server's audio model hears a 30 s excerpt (else its language model reads the numbers); without the
 // server the program makes the card alone.
 teachingMusic:guestTeachingMusicService(guestAi),
 // Still local by choice: corpus hints.
 soundHints:presetHintProvider,
 // Real content, not a mock: the example sounds shipped with the page.
};
