import type { ReactNode } from "react";
import { DragHandle } from "./DragHandle";

interface Props {
  title?: string;
  editMode: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Standard card wrapper for the "tiles" inside a tab (Channels,
 * Appearance, Stream Preview, etc). Shows a drag handle next to the title
 * when Edit layout mode is on — the actual dragging is wired up by whichever
 * `SortableList` or `FreeformBoard` wraps a group of these.
 */
export function TileCard({ title, editMode, children, className }: Props) {
  return (
    <section
      className={`bg-white/5 border rounded-xl p-5 flex flex-col gap-4 h-full w-full overflow-hidden ${
        editMode ? "border-dashed border-white/25" : "border-white/10"
      } ${className ?? ""}`}
    >
      {title && (
        <h3 className="font-semibold text-sm uppercase tracking-wider text-white/60 flex items-center gap-2 shrink-0">
          <DragHandle visible={editMode} />
          {title}
        </h3>
      )}
      <div className="flex-1 min-h-0 flex flex-col w-full h-full overflow-hidden">{children}</div>
    </section>
  );
}
