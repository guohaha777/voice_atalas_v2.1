// Select cloud adapters for authenticated creation and local adapters for visitors (kept on this device). Bundled examples
// and honest offline features remain in use. No mock data is left (the old examples live on as test fixtures).
import type {ComposeRepository} from '../pages/compose/services/composeRepository';
import {presetHintProvider} from '../pages/sound-birth/services/soundHints';
import type {SoundHintProvider} from '../pages/sound-birth/services/soundHints';
import type {MoodInterpreter} from '../pages/sound-world/services/moodInterpreter';
import type {SoundWorldRepository} from '../pages/sound-world/services/soundWorldRepository';
import type {ShelfRepository} from '../pages/works/services/shelfRepository';
import type {BackgroundGenerator} from '../shared/background/generator';
import type {BackgroundLibrary} from '../shared/background/library';
import type {InspirationCatalog} from '../shared/inspiration/catalog';
import {offlineTeachingMusicService} from '../shared/inspiration/teachingMusic';
import type {TeachingMusicService} from '../shared/inspiration/teachingMusic';
import {bundledSoundLibrary} from '../shared/creation/soundLibrary';
import type {SoundLibraryService} from '../shared/creation/soundLibrary';
import type {TalkPolisher} from '../shared/talk/polisher';
import {bundledInspirationCatalog} from '../shared/inspiration/textbookTracks';
import {localComposeRepository} from '../shared/local/composeRepository';
import {localShelfRepository} from '../shared/local/shelfRepository';
import {localSoundWorldRepository} from '../shared/local/soundWorldRepository';
import {localBackgroundLibrary} from '../shared/background/localInstruments';
import {CookieAccountClient} from '../shared/account/accountClient';
import type {AccountClient} from '../shared/account/accountClient';
import {CloudWorkspace} from '../shared/cloud/cloudWorkspace';
import {cloudAdapters} from '../shared/cloud/adapters';
import {GuestAiClient} from '../shared/guest-ai/guestAiClient';
import {guestBackgroundGenerator,guestMoodInterpreter,guestTalkPolisher} from '../shared/guest-ai/adapters';
import {visitorModels} from '../shared/model-config/visitorModels';
import {indexedDbStore,keepGuestWork,restoreGuestWork} from '../shared/storage/guestStore';
import {decodeKept} from '../shared/storage/decodeKept';

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
export const services:Services={
 inspirationCatalog:bundledInspirationCatalog,
 backgroundLibrary:localBackgroundLibrary,
 ...cloudAdapters(cloud,{composeRepository:localComposeRepository,soundWorldRepository:localSoundWorldRepository,shelfRepository:localShelfRepository,soundLibrary:bundledSoundLibrary}),
 // Real cookie adapter. A missing/disabled API reports unavailable, never a fake login.
 account,cloud,
 // Guest AI from the server: mood words, AI background (AI notes now; AI audio once the music model is connected) and
 // talk rewording. Each falls back to the local result when the server or model is not available.
 moodInterpreter:guestMoodInterpreter(guestAi),
 backgroundGenerator:guestBackgroundGenerator(guestAi),
 talkPolisher:guestTalkPolisher(guestAi),
 // Still local / not open: corpus hints (by choice), teaching-music analysis (a teacher feature, not in this version).
 soundHints:presetHintProvider,
 teachingMusic:offlineTeachingMusicService,
 // Real content, not a mock: the example sounds shipped with the page.
};
