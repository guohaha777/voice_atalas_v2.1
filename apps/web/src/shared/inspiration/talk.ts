// 课本讲解: three short sentences about the textbook song and this piece — its feature, what happened when it met the
// child's sounds, and one thing to try right away. The wording is corpus
// (@wanwu-v2/prompts/corpus, textbook-talk.v1.json), filled from the song's feature card and what the rules found; an AI
// may reword it later (pages/compose/model/useTalk.ts). This file only adapts it to the page's types.
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import type { TextbookTalk } from '@wanwu-v2/contracts/talk';
import type { Meeting } from '@wanwu-v2/sound-rules/background';
import { textbookTalk as corpusTalk } from '@wanwu-v2/prompts/corpus';

export { rhythmWords, songFeature } from '@wanwu-v2/prompts/corpus';
export type { TextbookTalk };

export function textbookTalk(
  track: Pick<TextbookTrack, 'title' | 'meter' | 'rhythmCell' | 'childLine'>,
  meeting: Meeting,
  exampleName: string | null,
): TextbookTalk {
  return corpusTalk(track, meeting.kind, exampleName);
}
