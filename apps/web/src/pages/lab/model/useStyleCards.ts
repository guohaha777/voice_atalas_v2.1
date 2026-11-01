import { useCallback, useEffect, useState } from 'react';

/** One style card as the rule file holds it. */
export type StyleCard = { id: string; name: string; moods: string[]; hint: string };
type Draft = { id: string; name: string; hint: string; moods: string[] };
const ROUTE = '/__lab/styles';
const EMPTY: Draft = { id: '', name: '', hint: '', moods: [] };

/**
 * 风格卡 on 系统音乐上传: the list from the rule file, a new card's draft, adding and taking away — through the dev
 * server only (apps/web/dev/labStyleStore.ts). The store checks every card and says what is wrong in plain words.
 */
export function useStyleCards() {
  const [available, setAvailable] = useState(true);
  const [moods, setMoods] = useState<string[]>([]);
  const [styles, setStyles] = useState<StyleCard[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  /** What the last change did, or why it was refused. */
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const reply = await fetch(ROUTE);
      if (!reply.ok) throw new Error('no store');
      const data = (await reply.json()) as { moods: string[]; styles: StyleCard[] };
      setMoods(data.moods);
      setStyles(data.styles);
    } catch {
      setAvailable(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  /** Sends one change; the store's own words come back when it refuses. */
  const change = async (request: Promise<Response>, done: (data: unknown) => string) => {
    setBusy(true);
    try {
      const reply = await request;
      const data = (await reply.json()) as { problems?: string[] };
      if (!reply.ok) {
        setMessage({ ok: false, text: data.problems?.join('；') ?? '' });
        return false;
      }
      setMessage({ ok: true, text: done(data) });
      await load();
      return true;
    } catch {
      setMessage({ ok: false, text: '' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    available,
    moods,
    styles,
    draft,
    busy,
    message,
    edit: (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change })),
    toggleMood: (mood: string) =>
      setDraft((current) => ({
        ...current,
        moods: current.moods.includes(mood)
          ? current.moods.filter((item) => item !== mood)
          : [...current.moods, mood],
      })),
    add: async (added: (name: string) => string) => {
      const ok = await change(
        fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(draft),
        }),
        (data) => added((data as StyleCard).name),
      );
      if (ok) setDraft(EMPTY);
    },
    remove: (id: string, removed: (id: string) => string) =>
      void change(fetch(`${ROUTE}/${encodeURIComponent(id)}`, { method: 'DELETE' }), () =>
        removed(id),
      ),
  };
}
export type StyleCards = ReturnType<typeof useStyleCards>;
