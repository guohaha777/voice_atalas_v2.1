// Render the current playback layers without rebuilding the background. The same shaped clips,
// actual background buffer, layer gain, master, limiter and ending are used by usePiecePlayback.
import {MIX_RULES} from '@wanwu-v2/sound-rules/mix';
import {pcm16Wave} from '@wanwu-v2/audio-engine/pcm';

export type AnalysisLayers={
 sounds:{start:number;buffer:AudioBuffer}[];
 background:{buffer:AudioBuffer;gain:number}|null;
};

/** Full stereo mix, resampled only after limiting. No peak normalisation or separate-layer balancing. */
export async function discoveryMix(layers:AnalysisLayers,seconds:number):Promise<string>{
 const rate=44_100;
 const context=new OfflineAudioContext(2,Math.ceil(seconds*rate),rate);
 const master=context.createGain();
 master.gain.value=MIX_RULES.childGain;
 const fade=Math.min(seconds,MIX_RULES.ending.fadeSeconds);
 master.gain.setValueAtTime(MIX_RULES.childGain,seconds-fade);
 master.gain.linearRampToValueAtTime(0,seconds);
 const limiter=context.createDynamicsCompressor();
 const rules=MIX_RULES.limiter;
 limiter.threshold.value=rules.thresholdDb;
 limiter.knee.value=rules.kneeDb;
 limiter.ratio.value=rules.ratio;
 limiter.attack.value=rules.attackSeconds;
 limiter.release.value=rules.releaseSeconds;
 master.connect(limiter).connect(context.destination);
 const add=(buffer:AudioBuffer,start:number,gain:number)=>{
  const node=context.createBufferSource();
  node.buffer=buffer;
  const volume=context.createGain();
  volume.gain.value=gain;
  node.connect(volume).connect(master);
  node.start(start);
 };
 for(const sound of layers.sounds)add(sound.buffer,sound.start,1);
 if(layers.background)add(layers.background.buffer,0,layers.background.gain);
 const mixed=await context.startRendering();
 const target=16_000;
 const resample=new OfflineAudioContext(2,Math.ceil(seconds*target),target);
 const source=resample.createBufferSource();
 source.buffer=mixed;
 source.connect(resample.destination);
 source.start();
 const encoded=await resample.startRendering();
 const bytes=pcm16Wave([encoded.getChannelData(0),encoded.getChannelData(1)],target);
 let binary='';
 for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary);
}
