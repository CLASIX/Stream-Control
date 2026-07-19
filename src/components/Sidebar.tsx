import type { ReactNode } from "react";
import { SortableList } from "./SortableList";
import { DragHandle } from "./DragHandle";

interface NavTab {
  id: string;
  name: string;
  icon: ReactNode;
  active: boolean;
}

interface Props {
  tabs: NavTab[];
  activeId: string;
  onSelect: (id: string) => void;
  editMode: boolean;
  onToggleEditMode: () => void;
  onReorder: (newOrder: string[]) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  sidebarRight?: boolean;
  onToggleSide?: () => void;
}

/** Chevron that flips direction to reflect the collapse/expand action. */
function CollapseIcon({ collapsed, sidebarRight }: { collapsed: boolean; sidebarRight?: boolean }) {
  const isPointingRight = sidebarRight ? !collapsed : collapsed;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`transition-transform duration-200 ${isPointingRight ? "rotate-180" : ""}`}
    >
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * App shell sidebar.
 *
 * Active tabs are drag-reorderable when Edit Mode is on (toggle at the
 * bottom). Coming-soon placeholders are never draggable and always sort
 * to the end.
 *
 * Can be collapsed to a slim icon-only rail (toggle in the header) — the
 * rail stays wide enough to be a comfortable click/tap target and to show
 * a status ring around the active tab, it just drops the text labels.
 */
export function Sidebar({
  tabs,
  activeId,
  onSelect,
  editMode,
  onToggleEditMode,
  onReorder,
  collapsed,
  onToggleCollapsed,
  sidebarRight = false,
  onToggleSide,
}: Props) {
  const activeTabs = tabs.filter((t) => t.active);
  const comingSoon = tabs.filter((t) => !t.active);

  // Dragging to reorder needs the labels visible, so auto-expand behavior
  // is left to the user — but reordering while collapsed is disabled since
  // there's nothing to grab onto other than a bare icon.
  const reorderable = editMode && !collapsed;

  return (
    <aside
      className={`shrink-0 border-white/10 bg-black/30 flex flex-col transition-[width] duration-200 ease-out h-screen ${
        sidebarRight ? "border-l order-2 pt-9" : "border-r order-1"
      } ${collapsed ? "w-[72px]" : "w-56"}`}
    >
      <div
        className={`border-b border-white/10 flex items-center shrink-0 ${
          collapsed ? "flex-col gap-3 px-2 py-4" : "justify-between px-4 py-4"
        }`}
        style={{ WebkitAppRegion: "drag", minHeight: "64px" } as React.CSSProperties}
      >
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight truncate">
              <span className="text-[#9146FF]">Stream</span>
              <span className="text-white"> Control</span>
            </h1>
            <p className="text-[11px] text-white/40 mt-0.5">Twitch · Kick · more</p>
          </div>
        )}
        {collapsed && (
          <span className="text-lg font-extrabold tracking-tight" title="Stream Control">
            <span className="text-[#9146FF]">S</span>
            <span className="text-white">C</span>
          </span>
        )}
        <div
          className={`flex shrink-0 ${!collapsed ? "flex-col gap-1.5 items-center" : "items-center gap-1"}`}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed();
            }}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <CollapseIcon collapsed={collapsed} sidebarRight={sidebarRight} />
          </button>
          {onToggleSide && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSide();
              }}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title={sidebarRight ? "Move sidebar to left side" : "Move sidebar to right side"}
            >
              {sidebarRight ? "◁" : "▷"}
            </button>
          )}
        </div>
      </div>

      <nav className="py-2 overflow-y-auto overflow-x-hidden">
        <SortableList
          items={activeTabs}
          getId={(m) => m.id}
          onReorder={onReorder}
          editMode={reorderable}
          className={collapsed ? "px-2 space-y-0.5" : "px-2 space-y-0.5"}
          renderItem={(m, edit) => (
            <button
              onClick={() => onSelect(m.id)}
              title={collapsed ? m.name : undefined}
              className={`w-full flex items-center rounded-lg text-sm transition-colors ${
                collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5"
              } ${
                m.id === activeId
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              } ${edit ? "border border-dashed border-white/15" : ""}`}
            >
              {!collapsed && <DragHandle visible={edit} />}
              <span
                className={`flex items-center justify-center shrink-0 ${
                  collapsed ? "w-6 h-6" : "w-5 h-5"
                } ${collapsed && m.id === activeId ? "ring-2 ring-[#9146FF] rounded-md" : ""}`}
              >
                {m.icon}
              </span>
              {!collapsed && <span className="truncate">{m.name}</span>}
            </button>
          )}
        />

        {comingSoon.length > 0 && (
          <div className="mt-2 px-2 space-y-0.5">
            {comingSoon.map((m) => (
              <div
                key={m.id}
                title={collapsed ? m.name : undefined}
                className={`w-full flex items-center text-sm text-white/25 cursor-not-allowed ${
                  collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5"
                }`}
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">{m.icon}</span>
                {!collapsed && <span className="truncate">{m.name}</span>}
                {!collapsed && <span className="ml-auto text-[10px] text-white/25">soon</span>}
              </div>
            ))}
          </div>
        )}
      </nav>

      {!["bridge", "webhooks", "settings"].includes(activeId) && (
        <div className="px-3 pt-3 pb-3 border-t border-white/10">
          <button
            onClick={onToggleEditMode}
            title={editMode ? "Finish editing the layout" : "Rearrange Tabs and Tiles"}
            className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
              editMode
                ? "bg-[#9146FF] text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" strokeLinecap="round" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed && (editMode ? "Done editing" : "Edit layout")}
          </button>
          {!collapsed && (
            <p className="mt-2 text-[10px] text-white/25 leading-relaxed">
              {editMode
                ? "Drag tabs · free-move cards · reorder small tiles."
                : "Edit layout to rearrange Tabs & Tiles"}
            </p>
          )}
        </div>
      )}

      {/* Spacer — keeps the edit button anchored just below the tabs
          instead of being pushed to the very bottom of a tall sidebar. */}
      <div className="flex-1" />
    </aside>
  );
}
