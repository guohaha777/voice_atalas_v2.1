// Redistribute the pinned transcription model with its upstream license in production output.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import type {Plugin} from 'vite';
export function modelLicense():Plugin{
 return {name:'textbook-model-license',apply:'build',generateBundle(){
  const require=createRequire(import.meta.url),root=dirname(require.resolve('@spotify/basic-pitch/package.json'));
  this.emitFile({type:'asset',fileName:'licenses/spotify-basic-pitch.txt',source:readFileSync(resolve(root,'LICENSE'),'utf8')});
 }};
}
