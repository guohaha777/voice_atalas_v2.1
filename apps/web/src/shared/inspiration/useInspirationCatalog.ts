import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Inspiration } from '@wanwu-v2/contracts/work';
import { trackWithMelody } from './melody/library.ts';
import type { TextbookTrack } from '@wanwu-v2/contracts/textbook';
import type { InspirationCatalog } from './catalog.ts';
import { teachingMusic } from './teachingMusic.ts';
import type { TeachingMusicService } from './teachingMusic.ts';

/**
 * 课本灵感 for a page (万物声场, 万物成曲): the textbook songs from the one catalogue port, the teaching music on this
 * device with its cards, and whether a model can make those cards. `tracks` is every card an inspiration can point to
 * (songs and teaching music added to 教学音乐), for the background to borrow from. Both pages read the same songs and
 * the same choice (kept with the work), so what a child picks in one is what the other shows.
 */
export function useInspirationCatalog(
  catalog: InspirationCatalog,
  teaching: TeachingMusicService,
  selected?: Inspiration,
) {
  const [entries, setEntries] = useState<readonly TextbookTrack[]>([]);
  useEffect(() => {
    let live = true;
    void catalog.list().then((list) => {
      if (live) setEntries(list.entries);
    });
    return () => {
      live = false;
    };
  }, [catalog]);
  const teachingItems = useSyncExternalStore(
    teachingMusic.subscribe,
    teachingMusic.list,
    teachingMusic.list,
  );
  const [melodies, setMelodies] = useState<Record<string, TextbookTrack>>({});
  const [melodyState, setMelodyState] = useState<{
    id: string;
    status: 'working' | 'ready' | 'failed';
    progress: number;
  } | null>(null);
  const selectedId = selected?.kind === 'textbook' ? selected.entryId : null;
  const selectedTeaching =
    selected?.kind === 'teaching-music'
      ? teachingItems.find((item) => item.id === selected.musicId)
      : null;
  useEffect(() => {
    if (selectedTeaching?.card && !selectedTeaching.card.track.melody)
      void teachingMusic.ensureMelody(selectedTeaching.id);
  }, [selectedTeaching]);
  useEffect(() => {
    const track = entries.find((t) => t.id === selectedId);
    if (!track || melodies[track.id]) return;
    let live = true;
    setMelodyState({ id: track.id, status: 'working', progress: 0 });
    void trackWithMelody(track, (p) => {
      if (live) setMelodyState({ id: track.id, status: 'working', progress: p });
    })
      .then((enriched) => {
        if (live) {
          setMelodies((current) => ({ ...current, [track.id]: enriched }));
          setMelodyState({ id: track.id, status: 'ready', progress: 1 });
        }
      })
      .catch(() => {
        if (live) setMelodyState({ id: track.id, status: 'failed', progress: 0 });
      });
    return () => {
      live = false;
    };
  }, [selectedId, entries, melodies]);
  const allEntries = useMemo(() => entries.map((t) => melodies[t.id] ?? t), [entries, melodies]);
  const tracks = useMemo(
    () => [
      ...allEntries,
      ...teachingItems.flatMap((item) => (item.card && item.confirmed ? [item.card.track] : [])),
    ],
    [allEntries, teachingItems],
  );
  /** Makes a teaching-music card (once) with the server's models when they are there, else the program alone. */
  const analyseTeaching = useCallback(
    (musicId: string) =>
      void teachingMusic.analyse(musicId, teaching.analyseAvailable ? teaching.features : null),
    [teaching],
  );
  const selectedMelody = selectedTeaching
    ? {
        id: selectedTeaching.id,
        status: selectedTeaching.analysing
          ? ('working' as const)
          : selectedTeaching.card?.track.melody
            ? ('ready' as const)
            : ('failed' as const),
        progress: selectedTeaching.card?.track.melody ? 1 : 0,
      }
    : melodyState?.id === selectedId
      ? melodyState
      : null;
  return {
    entries: allEntries,
    tracks,
    melodyState: selectedMelody,
    teachingItems,
    analyseTeaching,
    teachingOpen: teaching.analyseAvailable,
  };
}
