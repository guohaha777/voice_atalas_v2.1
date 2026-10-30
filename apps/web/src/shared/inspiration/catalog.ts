// 课本灵感, shared by 万物声场 (chosen before or while arranging, heard at once in the local background) and 万物成曲.
// Each song is a feature card (`TextbookTrack`, contract textbook-v1): extracted once at development time, shipped
// with the page, so the list works without a network.
// Today's catalogue is textbookTracks.ts (real songs with their textbook source; numbers measured by code, words drafted
// by the model, ear check pending).
// An inspiration only lends rhythm and feel to the background layer — never a melody, never the child's sounds.
//
// A server list may replace it later:
//   GET  /api/v1/textbook-tracks?edition=…&grade=…      → TextbookTrack[] (validated with isTextbookTrack)
import type {Metre,TextbookTrack} from '@wanwu-v2/contracts/textbook';

/** Beats per minute and beats per bar (the rhythm a textbook song lends). */
export type Rhythm={tempo:number;metre:Metre};
export const trackRhythm=(track:Pick<TextbookTrack,'tempoBpm'|'meter'>):Rhythm=>({tempo:track.tempoBpm,metre:track.meter});

export type InspirationList={origin:'example'|'catalogue';entries:readonly TextbookTrack[]};
export type InspirationCatalog={list():Promise<InspirationList>};
