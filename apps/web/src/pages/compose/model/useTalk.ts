import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { Inspiration } from '@wanwu-v2/contracts/work';
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import type { BackgroundPlan } from '@wanwu-v2/sound-rules/background';
import type { TalkPolisher } from '../../../shared/talk/polisher.ts';
import { localTalk, mergeTalk, polishTalk, talkKey } from '../../../shared/talk/talkView.ts';
import type { Polished } from '../../../shared/talk/talkView.ts';
import { keptCache } from '../../../shared/storage/keptCache.ts';

/** One AI rewording per talk (what would be sent), kept on this device: asked again only by 换一首. */
const made = keptCache<Polished>('ai-talk');

/**
 * 课本讲解 for 万物成曲 (rules in shared/talk/talkView.ts), and the counted facts the score's listening prompt reads
 * (音乐小发现's cards are useDiscovery's). The corpus sentences show at once. The AI wording goes with the AI music: asked when an AI background is made for this piece and the talk has none yet
 * (`ensure`), and again after every 换一首 that made one (`renew`) — never because something on the page changed.
 * What came back is kept and shows again whenever the same talk does; only the lines that pass the checks replace the
 * corpus ones.
 */
export function useTalk(
  arrangement: Arrangement | null,
  track: TextbookTrack | null,
  inspiration: Inspiration,
  plan: BackgroundPlan | null,
  polisher: TalkPolisher,
) {
  const local = useMemo(
    () => localTalk(arrangement, track, inspiration, plan),
    [arrangement, track, inspiration, plan],
  );
  // 音乐小发现 now has its own AI cards (useDiscovery); only 课本讲解 is still reworded here.
  const textbookOnly = useMemo(() => ({ ...local, work: null }), [local]);
  const key = talkKey(textbookOnly);
  const [, setMade] = useState(0);
  /** The talk an AI rewording is on its way for (the page shows a progress bar; the corpus lines stay meanwhile). */
  const [asking, setAsking] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const canAsk = polisher.open && !!local.textbook;
  const ask = useCallback(
    (force: boolean) => {
      if (!canAsk || asking === key) return;
      const current = new AbortController();
      const asked = key;
      controller.current = current;
      setAsking(asked);
      // What this device kept is read first, so a reload does not ask again for a talk it already has.
      void made.ready.then(() => {
        if (current.signal.aborted) return;
        if (!force && made.get(asked)) {
          setAsking(null);
          setMade((count) => count + 1);
          return;
        }
        void polishTalk(textbookOnly, polisher, current.signal)
          .then((value) => {
            if (value && !current.signal.aborted) {
              made.set(asked, value);
              setMade((count) => count + 1);
            }
          })
          .finally(() => {
            if (!current.signal.aborted) setAsking(null);
          });
      });
    },
    [canAsk, asking, key, textbookOnly, polisher],
  );
  const polished = made.get(key);
  const view = useMemo(
    () => mergeTalk(local, polished, polisher.open),
    [local, polished, polisher.open],
  );
  return useMemo(
    () => ({
      ...view,
      polishing: asking === key,
      /** An AI background was made (or kept) for this piece: asks once if this talk has no AI wording yet. */
      ensure: () => ask(false),
      /** 换一首 made new music: a new wording with it. */
      renew: () => ask(true),
    }),
    [view, asking, key, ask],
  );
}
