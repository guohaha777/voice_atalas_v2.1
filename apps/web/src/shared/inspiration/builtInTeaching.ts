// Built-in teaching music: recordings shipped beside the page for the internal trial (public/builtin-teaching/, listed
// in its manifest.json). The folder is kept out of GitHub (the recordings are copyrighted; .git/info/exclude) and goes to
// the server only with a deployment; it is deleted before the public test. Without it (a fresh clone) the list is empty
// and the 教学音乐 tab shows nothing extra.
import { useEffect, useState } from 'react';

export type BuiltInTeaching = { name: string; url: string };

const base = `${import.meta.env?.BASE_URL ?? '/'}builtin-teaching/`;
let listed: Promise<readonly BuiltInTeaching[]> | null = null;

/** Pure: the manifest's entries that are a name and a file in the folder (no paths elsewhere). */
export function builtInEntries(value: unknown, folder = base): BuiltInTeaching[] {
  const list = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const { name, file } = (item ?? {}) as { name?: unknown; file?: unknown };
    return typeof name === 'string' &&
      name.trim() &&
      typeof file === 'string' &&
      /^[^/\\]+\.(mp3|m4a|wav|ogg)$/i.test(file)
      ? [{ name: name.trim().slice(0, 24), url: folder + encodeURIComponent(file) }]
      : [];
  });
}

export function listBuiltInTeaching() {
  listed ??= fetch(`${base}manifest.json`, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((value) => builtInEntries(value))
    .catch(() => []);
  return listed;
}

export function useBuiltInTeaching() {
  const [items, setItems] = useState<readonly BuiltInTeaching[]>([]);
  useEffect(() => {
    let live = true;
    void listBuiltInTeaching().then((list) => {
      if (live) setItems(list);
    });
    return () => {
      live = false;
    };
  }, []);
  return items;
}
