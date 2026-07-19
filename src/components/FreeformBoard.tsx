/**
 * Free-position board for large tile cards.
 *
 * Edit layout mode:
 *  - Drag a tile from anywhere on its card surface
 *  - Board grid fits inside the viewport cleanly without causing window scrollbars
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DragHandle } from "./DragHandle";

export interface BoardItemLayout {
  x: number;
  y: number;
  w: number;
  h?: number;
}

export type BoardLayoutMap = Record<string, BoardItemLayout>;

export interface FreeformBoardItem {
  id: string;
  title?: string;
  node: ReactNode;
  defaultW?: number;
  defaultH?: number;
  defaultX?: number;
  defaultY?: number;
  noBox?: boolean;
  resizableH?: boolean;
}

interface Props {
  items: FreeformBoardItem[];
  layout: BoardLayoutMap;
  onChange: (next: BoardLayoutMap) => void;
  editMode: boolean;
  minHeight?: number;
  className?: string;
  onHide?: (id: string) => void;
  onMinimize?: (id: string) => void; // alias for backwards compatibility
}

const DEFAULT_W = 360;
const COL_GAP = 20;
const ROW_GAP = 20;
const MIN_W = 260;
const MAX_W = 1000;
// Must match the 20px grid drawn in edit mode (see backgroundSize below) —
// snapping to a different increment than the visible grid means tiles
// only land on a line half the time.
const GRID_SIZE = 20;
const SNAP = GRID_SIZE;

function snap(n: number): number {
  return Math.round(n / SNAP) * SNAP;
}

function seedLayout(
  items: FreeformBoardItem[],
  existing: BoardLayoutMap
): BoardLayoutMap {
  const next: BoardLayoutMap = { ...existing };
  let col = 0;
  let row = 0;
  const colW = DEFAULT_W + COL_GAP;

  for (const item of items) {
    if (next[item.id]) continue;
    const w = item.defaultW ?? DEFAULT_W;
    next[item.id] = {
      x: item.defaultX ?? col * colW,
      y: item.defaultY ?? row,
      w,
    };
    col += 1;
    if (col >= 2) {
      col = 0;
      row += 240 + ROW_GAP;
    }
  }
  return next;
}

function computeBounds(
  items: FreeformBoardItem[],
  layout: BoardLayoutMap,
  heights: Record<string, number>,
  minHeight: number,
  minWidth: number
) {
  let maxR = minWidth;
  let maxB = minHeight;
  for (const item of items) {
    const L = layout[item.id];
    if (!L) continue;
    const h = heights[item.id] ?? 220;
    maxR = Math.max(maxR, L.x + L.w);
    maxB = Math.max(maxB, L.y + h);
  }
  return { width: maxR, height: maxB };
}

export function FreeformBoard({
  items,
  layout,
  onChange,
  editMode,
  minHeight = 480,
  className,
  onHide,
  onMinimize,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(800);
  const [viewportH, setViewportH] = useState(800);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [live, setLive] = useState<BoardLayoutMap | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH?: number;
  } | null>(null);
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  const base = useMemo(
    () => seedLayout(items, layout || {}),
    [items, layout]
  );
  const current = live ?? base;

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      setViewportW(el.clientWidth || 800);
      setViewportH(Math.max(el.clientHeight, window.innerHeight - 110 || 800));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let missing = false;
    for (const item of items) {
      if (!layout?.[item.id]) {
        missing = true;
        break;
      }
    }
    if (missing) onChange(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join("|")]);

  useEffect(() => {
    if (!dragRef.current && !resizeRef.current) setLive(null);
  }, [layout]);

  const measureCard = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  const bounds = useMemo(() => {
    const b = computeBounds(
      items,
      current,
      heights,
      Math.max(minHeight, viewportH),
      Math.max(viewportW, 640)
    );
    return b;
  }, [items, current, heights, minHeight, viewportW, viewportH, live]);

  const apply = useCallback(
    (next: BoardLayoutMap) => {
      setLive(next);
      onChange(next);
      bump();
    },
    [onChange]
  );

  const onMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      const resize = resizeRef.current;
      if (drag) {
        const prev = live ?? base;
        const w = prev[drag.id]?.w ?? DEFAULT_W;
        const h = heights[drag.id] ?? 220;
        const maxAllowedX = Math.max(0, (shellRef.current?.clientWidth || viewportW || 1000) - w);
        const maxAllowedY = Math.max(0, (shellRef.current?.clientHeight || minHeight || 800) - h);
        const rawX = drag.origX + (e.clientX - drag.startX);
        const rawY = drag.origY + (e.clientY - drag.startY);
        const x = Math.max(0, Math.min(maxAllowedX, snap(rawX)));
        const y = Math.max(0, Math.min(maxAllowedY, snap(rawY)));
        apply({
          ...prev,
          [drag.id]: { ...prev[drag.id], x, y },
        });
      } else if (resize) {
        const prev = live ?? base;
        const maxW = Math.max(MIN_W, Math.min(MAX_W, (shellRef.current?.clientWidth || viewportW || 1000) - (prev[resize.id]?.x || 0)));
        const w = Math.min(
          maxW,
          Math.max(MIN_W, snap(resize.origW + (e.clientX - resize.startX)))
        );
        const item = items.find((i) => i.id === resize.id);
        const canResizeH = item?.resizableH || item?.defaultH || prev[resize.id]?.h;
        const h = canResizeH && resize.origH
          ? Math.min(1200, Math.max(240, snap(resize.origH + (e.clientY - resize.startY))))
          : prev[resize.id]?.h;
        apply({
          ...prev,
          [resize.id]: { ...prev[resize.id], w, ...(h ? { h } : {}) },
        });
      }
    },
    [live, base, apply, heights, viewportW, minHeight]
  );

  const onUp = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
    bump();
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onMove, onUp]);

  const startDrag = (id: string, e: ReactPointerEvent) => {
    if (!editMode) return;
    if (
      e.target instanceof Element &&
      (e.target.closest("[data-resize-handle]") ||
        e.target.closest("[data-sortable-item]") ||
        e.target.closest("button") ||
        e.target.closest("input") ||
        e.target.closest("select") ||
        e.target.closest("textarea") ||
        e.target.closest("label") ||
        e.target.closest("a"))
    ) {
      return;
    }
    e.preventDefault();
    const L = current[id];
    if (!L) return;
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: L.x,
      origY: L.y,
    };
    bump();
  };

  const startResize = (id: string, e: ReactPointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    const L = current[id];
    if (!L) return;
    const item = items.find((i) => i.id === id);
    resizeRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origW: L.w,
      origH: L.h || heights[id] || (item?.defaultH ?? 420),
    };
    bump();
  };

  const activeId = dragRef.current?.id || resizeRef.current?.id || null;

  return (
    <div
      ref={shellRef}
      className={`freeform-board-shell flex-1 w-full min-h-full flex flex-col relative ${className ?? ""}`}
      style={{
        width: "100%",
        minHeight: Math.max(bounds.height, viewportH),
      }}
    >
      <div
        className={`relative flex-1 w-full min-h-full ${
          editMode
            ? "rounded-2xl border border-dashed border-[#9146FF]/35 bg-[#9146FF]/[0.03]"
            : ""
        }`}
        style={{
          width: Math.max(bounds.width, viewportW),
          height: Math.max(bounds.height, viewportH),
          minWidth: "100%",
          minHeight: Math.max(bounds.height, viewportH),
        }}
      >
        {editMode && (
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #c4b5fd 1px, transparent 1px), linear-gradient(to bottom, #c4b5fd 1px, transparent 1px)",
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            }}
          />
        )}

        {items.map((item) => {
          const L = current[item.id] ?? {
            x: 0,
            y: 0,
            w: item.defaultW ?? DEFAULT_W,
          };
          const active = activeId === item.id;
          return (
            <div
              key={item.id}
              ref={(el) => measureCard(item.id, el)}
              className={`absolute top-0 left-0 ${
                active ? "z-40" : "z-10"
              } ${editMode ? "select-none" : ""}`}
              style={{
                transform: `translate3d(${L.x}px, ${L.y}px, 0)`,
                width: L.w,
                height: L.h ? `${L.h}px` : (item.defaultH ? `${item.defaultH}px` : undefined),
              }}
            >
              <div
                className={`relative rounded-xl ${(L.h || item.resizableH || item.defaultH) ? "w-full h-full flex flex-col min-h-0" : ""} ${
                  editMode && !item.noBox && !["status", "audience", "performance"].includes(item.id)
                    ? "cursor-grab active:cursor-grabbing shadow-[0_16px_50px_rgba(0,0,0,0.45)] ring-1 ring-white/15"
                    : ""
                } ${active && !item.noBox && !["status", "audience", "performance"].includes(item.id) ? "ring-2 ring-[#9146FF]" : ""}`}
                onPointerDown={(e) => {
                  if (item.noBox || ["status", "audience", "performance"].includes(item.id)) return;
                  startDrag(item.id, e);
                }}
              >
                {editMode && (
                  <div
                    className={`absolute -top-3 left-3 z-30 flex items-center gap-1.5 rounded-full border border-white/25 bg-[#16161d] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 shadow-lg transition-colors ${
                      item.noBox || ["status", "audience", "performance"].includes(item.id) ? "cursor-default" : "cursor-grab active:cursor-grabbing hover:border-[#9146FF] hover:text-white"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1.5 ${item.noBox || ["status", "audience", "performance"].includes(item.id) ? "" : "cursor-grab active:cursor-grabbing hover:text-white"}`}
                      onPointerDown={(e) => {
                        if (item.noBox || ["status", "audience", "performance"].includes(item.id)) return;
                        e.stopPropagation();
                        startDrag(item.id, e);
                      }}
                      title={item.noBox || ["status", "audience", "performance"].includes(item.id) ? `${item.title || item.id} (Reorder inner cards directly below)` : `Drag to move ${item.title || item.id}`}
                    >
                      {!item.noBox && !["status", "audience", "performance"].includes(item.id) && <DragHandle visible />}
                      <span>{item.title || "Card"}</span>
                    </div>
                    {(onHide || onMinimize) && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          (onHide || onMinimize)?.(item.id);
                        }}
                        className="ml-1 pl-1.5 border-l border-white/20 text-red-400 hover:text-red-300 font-extrabold flex items-center gap-0.5 cursor-pointer"
                        title={`Hide "${item.title || item.id}" from dashboard`}
                      >
                        <span>🙈</span>
                        <span className="hidden sm:inline">Hide</span>
                      </button>
                    )}
                  </div>
                )}

                {/* In edit mode, enable pointer events so inner tiles (SortableList) can be dragged */}
                <div className={`${editMode ? "pointer-events-auto" : ""} ${(L.h || item.resizableH || item.defaultH) ? "flex-1 w-full h-full min-h-0 flex flex-col" : ""}`}>
                  {item.node}
                </div>

                {editMode && (
                  <div
                    data-resize-handle
                    className="absolute bottom-1.5 right-1.5 z-30 h-5 w-5 cursor-se-resize rounded border border-white/30 bg-[#9146FF]/80"
                    onPointerDown={(e) => startResize(item.id, e)}
                    title="Resize width"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
