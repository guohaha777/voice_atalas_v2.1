import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleArrangement} from '../src/shared/creation/exampleWork.ts';
import {textbookInput} from '../src/shared/background/textbookInput.ts';
import {textbookTracks} from '../src/shared/inspiration/textbookTracks.ts';
import {pieceSeconds,timedEvents} from '../src/shared/creation/arrangementTiming.ts';
import {isTextbookComposeInput} from '@wanwu-v2/contracts/textbook-compose';
import {composeTextbook} from '@wanwu-v2/sound-rules/textbook-compose';
const example=()=>exampleArrangement('work:textbook-input',new Date('2026-11-01'));
test('textbook input follows actual playback timing and keeps repeated sound identity separate from placements',()=>{
 const a=example(),original=a.events[0]!;
 a.events.push({...original,id:'repeated',at:.7});
 const input=textbookInput(a,textbookTracks[0]!);
 assert.ok(isTextbookComposeInput(input));assert.equal(input.seconds,pieceSeconds(a));
 assert.deepEqual(input.sounds.map(s=>[s.start,s.end]),timedEvents(a).map(s=>[s.start,s.end]));
 const repeat=input.sounds.find(s=>s.eventId==='repeated')!,first=input.sounds.find(s=>s.eventId===original.id)!;
 assert.equal(repeat.n,first.n);assert.notEqual(repeat.eventId,first.eventId);
 assert.equal(composeTextbook(input).status,'ready');
});
test('rows and labels carry no musical meaning; excerpt/source and provenance changes remain identifiable',()=>{
 const a=example(),before=textbookInput(a,textbookTracks[0]!);
 const b=structuredClone(a);b.events=b.events.map(e=>({...e,row:(e.row+1)%b.rows}));
 b.units=b.units.map(u=>({...u,name:'改名',maker:'匿名'}));
 assert.deepEqual(textbookInput(b,textbookTracks[0]!),before);
 b.units[0]!.sourceId='another-recording';
 assert.notEqual(textbookInput(b,textbookTracks[0]!).contentToken,before.contentToken);
 const c=example();c.units[0]!.shape={};delete c.units[0]!.analysis;
 const unchosen=textbookInput(c,textbookTracks[0]!).sounds.find(s=>s.eventId===c.events[0]!.id)!;
 assert.equal(unchosen.sources!.pitch,'default');assert.equal(unchosen.sources!.contour,'unknown');
});

test('changing rows of simultaneous sounds cannot change their musical order or generated notes',()=>{
 const a=example();a.events[1]!.at=a.events[0]!.at;
 const b=structuredClone(a);[b.events[0]!.row,b.events[1]!.row]=[b.events[1]!.row,b.events[0]!.row];
 const left=textbookInput(a,textbookTracks[0]!),right=textbookInput(b,textbookTracks[0]!);
 assert.deepEqual(left,right);assert.deepEqual(composeTextbook(left),composeTextbook(right));
});
