/** Small grip icon shown on draggable items while Edit Mode is on. */
export function DragHandle({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-white/35"
      title="Drag to reorder"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="8" cy="6" r="1.6" />
        <circle cx="16" cy="6" r="1.6" />
        <circle cx="8" cy="12" r="1.6" />
        <circle cx="16" cy="12" r="1.6" />
        <circle cx="8" cy="18" r="1.6" />
        <circle cx="16" cy="18" r="1.6" />
      </svg>
    </span>
  );
}
