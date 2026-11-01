// AI background port (万物成曲). The page asks the server for an AI background, step by step: the AI music model, then
// the AI voice model, then the AI text model (both compose a plan the server turns into notes). When none gives one, the
// page composes alone (@wanwu-v2/sound-rules/ai-compose, 程序自编). The offline generator says so plainly (`not-open`).
//
// Intended server endpoints (protocol v0.4; not implemented; keys stay on the server, which owns quotas and moderation;
// open to visitors, limited per IP and device — over the limit is reason 'quota'). The one AI background entry, with or
// without teaching music (BackgroundBrief.teachingMusic):
//   POST /api/v1/backgrounds            ← BackgroundBrief (+ step) → {jobId}
//   GET  /api/v1/backgrounds/{jobId}    → BackgroundResult (validated with parseBackgroundResult)
//   audio-ai: Fun-Music from a text description of the brief (no vocals, no lead melody); the mp3 is copied to our own
//             storage and `audioUrl` points there. notes-ai: 千问 writes a motif from the brief, the server develops and
//             checks it with @wanwu-v2/sound-rules and returns notes. Only the anonymous brief is sent: no recordings,
//             names, places, nor the textbook song itself (only its features).
import type {AiBackgroundStep,BackgroundBrief,BackgroundResult,BackgroundUnavailable} from '@wanwu-v2/contracts/background';
import {parseBackgroundResult} from '@wanwu-v2/contracts/background';

export type BackgroundGenerator={
 /** AI steps that can run now, in chain order; empty while none is connected. */
 readonly open:readonly AiBackgroundStep[];
 generate(brief:BackgroundBrief,step:AiBackgroundStep,signal:AbortSignal):Promise<unknown>;
};

export const offlineBackgroundGenerator:BackgroundGenerator={
 open:[],
 async generate(){return {status:'unavailable',reason:'not-open'} satisfies BackgroundResult;},
};

/** How long the page waits for each step before trying the next (the progress bar runs over this time). */
export const AI_STEP_TIMEOUT_MS:Record<AiBackgroundStep,number>={'audio-ai':60_000,'voice-ai':20_000,'notes-ai':20_000};

export type ChainOutcome=
 |{status:'ready';result:Extract<BackgroundResult,{status:'ready'}>}
 /** Why the last step tried did not give a background; `not-open` when no AI step is connected at all. */
 |{status:'unavailable';reason:BackgroundUnavailable};

/**
 * Tries the open AI steps in order (music model, voice model, text model), each with its timeout; the first valid
 * background wins. Anything else — closed, offline, over quota, too slow, malformed — moves on; in the end the page
 * composes alone. `onStep` hears each step as it starts (for the progress bar). Pure apart from the generator, so it is
 * tested with fakes.
 */
export async function runBackgroundChain(generator:BackgroundGenerator,brief:BackgroundBrief,signal:AbortSignal,
 timeouts:Record<AiBackgroundStep,number>=AI_STEP_TIMEOUT_MS,
 onStep?:(step:AiBackgroundStep,timeoutMs:number)=>void):Promise<ChainOutcome>{
 let reason:BackgroundUnavailable='not-open';
 for(const step of generator.open){
  if(signal.aborted)return {status:'unavailable',reason:'failed'};
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return {status:'unavailable',reason:'offline'};
  onStep?.(step,timeouts[step]);
  const attempt=new AbortController();
  const stop=()=>attempt.abort();
  signal.addEventListener('abort',stop);
  const timer=setTimeout(stop,timeouts[step]);
  // A step that ignores the abort still counts as too slow: the page never waits past the timeout.
  const gaveUp=new Promise<never>((_,reject)=>
   attempt.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  try{
   const result=parseBackgroundResult(
    await Promise.race([generator.generate(brief,step,attempt.signal),gaveUp]),
    brief.seconds);
   // Only a ready result from this very step counts.
   if(result?.status==='ready'&&result.source===step)return {status:'ready',result};
   reason=result?.status==='unavailable'?result.reason:'failed';
  }catch{
   reason=attempt.signal.aborted&&!signal.aborted?'timeout':'failed';
  }
  finally{
   clearTimeout(timer);
   signal.removeEventListener('abort',stop);
  }
 }
 return {status:'unavailable',reason};
}
