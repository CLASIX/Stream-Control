import { useState, type ReactNode } from "react";

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Called with the new id order after a drop. */
  onReorder: (newOrder: string[]) => void;
  /** Dragging only works while true — otherwise this renders like a plain list. */
  editMode: boolean;
  renderItem: (item: T, editMode: boolean) => ReactNode;
  className?: string;
  itemClassName?: string;
}

/**
 * Generic drag-to-reorder list built on the native HTML5 Drag and Drop API
 * — no external dependency. Used for sidebar tabs, the tiles inside each
 * tab, and lists of small stat tiles or items (e.g. status/audience tiles).
 *
 * Only draggable while `editMode` is true, so normal use of the app is
 * completely unaffected by accidental drags. Hovering highlights draggable tiles.
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  editMode,
  renderItem,
  className,
  itemClassName,
}: SortableListProps<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ids = items.map(getId);

  const handleDrop = (targetId: string) => {
    if (draggedId && draggedId !== targetId) {
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const next = [...ids];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, draggedId);
        onReorder(next);
      }
    }
    setDraggedId(null);
    setOverId(null);
  };

  return (
    <div className={className}>
      {items.map((item) => {
        const id = getId(item);
        const isDragging = draggedId === id;
        const isOver = overId === id && draggedId !== null && draggedId !== id;
        return (
          <div
            key={id}
            draggable={editMode}
            data-sortable-item="true"
            onDragStart={(e) => {
              setDraggedId(id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", id);
              } catch {
                /* some browsers restrict this — safe to ignore */
              }
            }}
            onDragOver={(e) => {
              if (!editMode || !draggedId) return;
              e.preventDefault();
              if (overId !== id) setOverId(id);
            }}
            onDragLeave={() => {
              setOverId((cur) => (cur === id ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setOverId(null);
            }}
            className={`${itemClassName ?? ""} ${
              editMode
                ? "cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-[#9146FF] hover:bg-white/[0.08] rounded-xl transition-all"
                : ""
            } ${isDragging ? "opacity-30" : ""} ${
              isOver
                ? "ring-2 ring-[#9146FF] ring-offset-2 ring-offset-[#0e0e12] rounded-xl"
                : ""
            }`}
          >
            {renderItem(item, editMode)}
          </div>
        );
      })}
    </div>
  );
}
