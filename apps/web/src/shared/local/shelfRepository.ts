// Local 作品书架 repository for visitors: the shelf kept on this device (shared/creation/workShelf, saved to the browser by
// shared/storage/guestStore.ts) and the current work. Signed-in teachers use the cloud shelf (app/services.ts).
import type { ShelfRepository } from '../ports/shelfRepository.ts';
import { workSession } from '../creation/workSession.ts';
import { workShelf } from '../creation/workShelf.ts';

const subscribeBoth = (listener: () => void) => {
  const offShelf = workShelf.subscribe(listener);
  const offSession = workSession.subscribe(listener);
  return () => {
    offShelf();
    offSession();
  };
};

export const localShelfRepository: ShelfRepository = {
  list: workShelf.list,
  subscribe: subscribeBoth,
  // Nothing to fetch: the shelf on this device is already here.
  async refresh() {},
  currentId: () => workSession.current()?.id ?? null,
  hasUnsavedCurrent() {
    const current = workSession.current();
    if (current?.origin !== 'child' || !current.events.length) return false;
    const shelved = workShelf.get(current.id);
    return (
      !shelved ||
      shelved.arrangement.updatedAt !== current.updatedAt ||
      JSON.stringify(shelved.settings) !== JSON.stringify(workSession.settings())
    );
  },
  async open(work) {
    workSession.open(work);
  },
  async remove(id) {
    return workShelf.remove(id);
  },
  async rename(id, title) {
    return workShelf.rename(id, title);
  },
};
