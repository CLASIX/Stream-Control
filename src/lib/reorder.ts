/**
 * Small helpers for array reordering, shared by every drag-and-drop list
 * in the app (sidebar tabs, tiles inside a tab, small stat cards, etc).
 */

/** Move the item with id `draggedId` to just before/at the position of `targetId`. */
export function reorderIds(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids;
  const next = [...ids];
  const fromIdx = next.indexOf(draggedId);
  const toIdx = next.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return ids;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, draggedId);
  return next;
}

/**
 * Sort `items` (each with an id via `getId`) according to a saved order of
 * ids. Any item not present in `order` is appended at the end, so newly
 * added cards/inputs always show up instead of silently disappearing.
 */
export function applyOrder<T>(items: T[], order: string[], getId: (item: T) => string): T[] {
  const byId = new Map(items.map((item) => [getId(item), item]));
  const ordered: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  // Anything left over (new items not yet in the saved order) goes last.
  ordered.push(...byId.values());
  return ordered;
}
