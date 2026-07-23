// ============================================================
// Stream Control — Alerts & Redemptions Engine
// Master Tab Component
// ============================================================

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "../../utils/cn";
import { useStore } from "../../lib/store";
import type {
  AlertAction,
  AlertTrigger,
  SubAction,
  ActionGroup,
  QueueMode,
  LiveRedemptionQueueItem,
  RedemptionStatus,
} from "../../types/alerts";
import {
  summarizeSubAction,
  getCategoryColor,
  getGroupColor,
  getQueueModeColor,
  TRIGGER_REGISTRY,
  SUB_ACTION_REGISTRY,
  executeAction,
  findMatchingActions,
  emitAlertsOverlayEvent,
} from "../../lib/alertEngine";
import { nanoid } from "../../lib/nanoid";
import { SortableList } from "../../components/SortableList";
import { SubActionEditor, Toggle } from "./SubActionEditor";
import { TriggerEditor } from "./TriggerEditor";
import { useObs } from "../../hooks/useObs";
import { buildAlertsOverlayUrl } from "../../lib/overlayUrls";

// ─────────────────────────────────────────────
// MODAL WRAPPER
// ─────────────────────────────────────────────

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a26] p-6 shadow-2xl shadow-black/60 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────

const BellIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const SearchIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);

const PlayIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const TrashIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);

const EditIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const CopyIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const PlusIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const GripIcon = () => (
  <svg className="h-4 w-4 text-white/20" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

// ─────────────────────────────────────────────
// GROUP FILTER BAR
// ─────────────────────────────────────────────

const ALL_GROUPS: ActionGroup[] = ["Alerts", "Redemptions", "Soundboard", "OBS Macros", "Custom"];

function GroupFilterBar({
  actions,
  activeGroup,
  onGroupChange,
}: {
  actions: AlertAction[];
  activeGroup: ActionGroup | "all";
  onGroupChange: (g: ActionGroup | "all") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onGroupChange("all")}
        className={cn(
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
          activeGroup === "all"
            ? "bg-white/15 text-white"
            : "text-white/40 hover:text-white/70 hover:bg-white/5"
        )}
      >
        All Actions ({actions.length})
      </button>
      {ALL_GROUPS.map((group) => {
        const count = actions.filter((a) => a.group === group).length;
        return (
          <button
            key={group}
            onClick={() => onGroupChange(group)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              activeGroup === group
                ? "bg-white/15 text-white"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            )}
          >
            {group} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// ACTION LIST ITEM
// ─────────────────────────────────────────────

function ActionRow({
  action,
  selected,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
  onRehearse,
}: {
  action: AlertAction;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRehearse: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all",
        selected
          ? "border-violet-500/50 bg-violet-500/10"
          : "border-white/5 bg-white/3 hover:bg-white/6 hover:border-white/10"
      )}
    >
      <GripIcon />

      {/* Enable toggle */}
      <div onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        <Toggle value={action.enabled} onChange={onToggle} />
      </div>

      {/* Name & Group */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm font-medium truncate", action.enabled ? "text-white" : "text-white/40")}>
            {action.name}
          </span>
          <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", getGroupColor(action.group))}>
            {action.group}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-white/30">
            {action.triggers.length} trigger{action.triggers.length !== 1 ? "s" : ""} · {action.subActions.length} sub-action{action.subActions.length !== 1 ? "s" : ""}
          </span>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", getQueueModeColor(action.queueMode))}>
            {action.queueMode}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onRehearse}
          title="Rehearse / Test"
          className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/30 transition-colors"
        >
          <PlayIcon /> Run
        </button>
        <button onClick={onDuplicate} title="Duplicate" className="rounded-md p-1.5 text-white/40 hover:text-white hover:bg-white/10 transition-colors">
          <CopyIcon />
        </button>
        <button onClick={onDelete} title="Delete" className="rounded-md p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TRIGGERS PANEL
// ─────────────────────────────────────────────

function TriggersPanel({
  action,
  onUpdateTriggers,
}: {
  action: AlertAction;
  onUpdateTriggers: (triggers: AlertTrigger[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTrigger, setEditTrigger] = useState<AlertTrigger | null>(null);

  const handleSave = (trigger: AlertTrigger) => {
    if (editTrigger) {
      onUpdateTriggers(action.triggers.map((t) => t.id === trigger.id ? trigger : t));
    } else {
      onUpdateTriggers([...action.triggers, trigger]);
    }
    setAddOpen(false);
    setEditTrigger(null);
  };

  const handleRemove = (id: string) => {
    onUpdateTriggers(action.triggers.filter((t) => t.id !== id));
  };

  const handleToggle = (id: string) => {
    onUpdateTriggers(action.triggers.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  const getTriggerIcon = (type: AlertTrigger["type"]) =>
    TRIGGER_REGISTRY.find((m) => m.type === type)?.icon ?? "⚡";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Triggers</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-mono text-white/60">
            {action.triggers.length}
          </span>
        </div>
        <button
          onClick={() => { setAddOpen(true); setEditTrigger(null); }}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors"
        >
          <PlusIcon /> Add Trigger
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
        {action.triggers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <span className="text-2xl opacity-30">⚡</span>
            <p className="text-xs text-white/30">No triggers yet. Add one to activate this action.</p>
          </div>
        ) : (
          action.triggers.map((trigger) => (
            <div
              key={trigger.id}
              className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/3 px-3 py-2.5"
            >
              <span className="text-base">{getTriggerIcon(trigger.type)}</span>
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm font-medium truncate", trigger.enabled ? "text-white" : "text-white/40")}>
                  {trigger.label}
                </div>
                <div className="text-[11px] text-white/30 truncate">
                  {formatCriteria(trigger)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Toggle value={trigger.enabled} onChange={() => handleToggle(trigger.id)} />
                <button onClick={() => { setEditTrigger(trigger); setAddOpen(true); }} className="rounded p-1 text-white/30 hover:text-white hover:bg-white/10 transition-colors">
                  <EditIcon />
                </button>
                <button onClick={() => handleRemove(trigger.id)} className="rounded p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={addOpen} onClose={() => { setAddOpen(false); setEditTrigger(null); }}>
        <TriggerEditor
          initial={editTrigger ?? undefined}
          onSave={handleSave}
          onCancel={() => { setAddOpen(false); setEditTrigger(null); }}
        />
      </Modal>
    </div>
  );
}

function formatCriteria(trigger: AlertTrigger): string {
  const c = trigger.criteria;
  const parts: string[] = [];
  if (c.tiers?.length) parts.push(`Tiers: ${c.tiers.join(", ")}`);
  if (c.rewardTitle) parts.push(`Reward: "${c.rewardTitle}"`);
  if (c.minBits) parts.push(`Min Bits: ${c.minBits}`);
  if (c.minViewers) parts.push(`Min Viewers: ${c.minViewers}`);
  if (c.command) parts.push(`Command: ${c.command}`);
  if (c.commandRoles?.length) parts.push(`Roles: ${c.commandRoles.join(", ")}`);
  if (c.hotkey) parts.push(`Key: ${c.hotkey}`);
  if (c.sceneName) parts.push(`Scene: ${c.sceneName}`);
  return parts.length > 0 ? parts.join(" · ") : "Any matching event";
}

// ─────────────────────────────────────────────
// SUB-ACTIONS PANEL
// ─────────────────────────────────────────────

function SubActionsPanel({
  action,
  allActions,
  onUpdateSubActions,
}: {
  action: AlertAction;
  allActions: AlertAction[];
  onUpdateSubActions: (sas: SubAction[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editSa, setEditSa] = useState<SubAction | null>(null);

  const allActionNames = allActions
    .filter((a) => a.id !== action.id)
    .map((a) => ({ id: a.id, name: a.name }));

  const handleSave = (sa: SubAction) => {
    if (editSa) {
      onUpdateSubActions(action.subActions.map((s) => s.id === sa.id ? sa : s));
    } else {
      onUpdateSubActions([...action.subActions, sa]);
    }
    setAddOpen(false);
    setEditSa(null);
  };

  const handleRemove = (id: string) => {
    onUpdateSubActions(action.subActions.filter((s) => s.id !== id));
  };

  const handleToggle = (id: string) => {
    onUpdateSubActions(action.subActions.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Sub-Actions</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-mono text-white/60">
            {action.subActions.filter((s) => s.enabled).length}/{action.subActions.length}
          </span>
          <span className="text-[10px] text-white/25">Sequential Execution</span>
        </div>
        <button
          onClick={() => { setAddOpen(true); setEditSa(null); }}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors"
        >
          <PlusIcon /> Add Sub-Action
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {action.subActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="text-3xl opacity-20">⚙️</span>
            <p className="text-xs text-white/30">No sub-actions yet. Add actions that will execute when a trigger fires.</p>
          </div>
        ) : (
          <SortableList
            items={action.subActions}
            getId={(sa) => sa.id}
            editMode={true}
            onReorder={(newIds: string[]) => {
              const byId = new Map(action.subActions.map((s) => [s.id, s]));
              const reordered = newIds.map((id) => byId.get(id)).filter((Boolean as any) as (v: any) => v is SubAction);
              onUpdateSubActions(reordered);
            }}
            renderItem={(sa, _editMode) => {
              const idx = action.subActions.indexOf(sa);
              const meta = SUB_ACTION_REGISTRY.find((m) => m.kind === sa.options.kind);
              return (
                <div className={cn(
                  "group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all mb-1",
                  sa.enabled ? "border-white/5 bg-white/3 hover:bg-white/6" : "border-white/3 bg-white/1 opacity-50"
                )}>
                  {/* Step number */}
                  <div className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center bg-white/5 text-[10px] font-mono text-white/40">
                    {idx + 1}
                  </div>

                  {/* Icon + label */}
                  <span className="text-base flex-shrink-0">{meta?.icon ?? "⚙️"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs font-medium truncate", sa.enabled ? "text-white" : "text-white/40")}>
                        {summarizeSubAction(sa)}
                      </span>
                    </div>
                    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold mt-0.5", getCategoryColor(sa.category))}>
                      {meta?.label ?? sa.options.kind}
                    </span>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Toggle value={sa.enabled} onChange={() => handleToggle(sa.id)} />
                    <button onClick={() => { setEditSa(sa); setAddOpen(true); }} className="rounded p-1 text-white/30 hover:text-white hover:bg-white/10 transition-colors">
                      <EditIcon />
                    </button>
                    <button onClick={() => handleRemove(sa.id)} className="rounded p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <TrashIcon />
                    </button>
                  </div>

                  {/* Drag handle */}
                  <GripIcon />
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Connector line visual */}
      {action.subActions.length > 1 && (
        <div className="px-4 pb-2">
          <div className="text-[10px] text-white/20 flex items-center gap-2">
            <div className="h-px flex-1 bg-white/5" />
            ↓ executes sequentially
            <div className="h-px flex-1 bg-white/5" />
          </div>
        </div>
      )}

      <Modal open={addOpen} onClose={() => { setAddOpen(false); setEditSa(null); }}>
        <SubActionEditor
          initial={editSa ?? undefined}
          allActionNames={allActionNames}
          onSave={handleSave}
          onCancel={() => { setAddOpen(false); setEditSa(null); }}
        />
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// ACTION META EDITOR MODAL
// ─────────────────────────────────────────────

function ActionMetaModal({
  action,
  open,
  onClose,
  onSave,
}: {
  action: AlertAction | null;
  open: boolean;
  onClose: () => void;
  onSave: (a: Partial<AlertAction>) => void;
}) {
  const [name, setName] = useState(action?.name ?? "");
  const [group, setGroup] = useState<ActionGroup>(action?.group ?? "Custom");
  const [queueMode, setQueueMode] = useState<QueueMode>(action?.queueMode ?? "fifo");
  const [cooldownMs, setCooldownMs] = useState(action?.cooldownMs ?? 0);

  useEffect(() => {
    if (action) {
      setName(action.name);
      setGroup(action.group);
      setQueueMode(action.queueMode);
      setCooldownMs(action.cooldownMs);
    }
  }, [action]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-white">
          {action ? "Edit Action" : "New Action"}
        </h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Action Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Alert"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Group</label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as ActionGroup)}
              className="w-full rounded-lg border border-white/10 bg-[#1a1a24] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {ALL_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Queue Mode</label>
            <select
              value={queueMode}
              onChange={(e) => setQueueMode(e.target.value as QueueMode)}
              className="w-full rounded-lg border border-white/10 bg-[#1a1a24] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="fifo">FIFO — Sequential Queue (default)</option>
              <option value="blocking">Blocking — High-priority, blocks other queues</option>
              <option value="concurrent">Concurrent — Runs instantly in background</option>
            </select>
            <p className="mt-1 text-xs text-white/30">
              {queueMode === "fifo" && "Alerts queue up and execute one at a time in order."}
              {queueMode === "blocking" && "Pauses all other queues until this action completes."}
              {queueMode === "concurrent" && "Fires immediately without waiting for other actions."}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Cooldown (ms, 0 = no cooldown)</label>
            <input
              type="number"
              value={cooldownMs}
              min={0}
              onChange={(e) => setCooldownMs(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-white/8">
          <button
            onClick={() => { onSave({ name: name.trim() || "Unnamed Action", group, queueMode, cooldownMs }); onClose(); }}
            disabled={!name.trim()}
            className="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors disabled:opacity-40"
          >
            {action ? "Save Changes" : "Create Action"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// SIMULATION CENTER
// ─────────────────────────────────────────────

function SimulationCenter({ actions, onOverlayEvent }: { actions: AlertAction[]; onOverlayEvent?: (evt: any) => void }) {
  const [eventType, setEventType] = useState("twitch_reward");
  const [vars, setVars] = useState(`user=TestViewer99\nreward=Hydrate Check\ncost=500\ntier=tier1\nbits=100\nviewers=50`);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const handleFire = async () => {
    setRunning(true);
    setLog([]);
    const rawVars = Object.fromEntries(
      vars.split("\n").filter((l) => l.includes("=")).map((l) => {
        const [k, ...v] = l.split("=");
        return [k.trim().toLowerCase(), v.join("=").trim()];
      })
    );
    const event = { type: eventType as AlertTrigger["type"], vars: rawVars, platform: "twitch" as const };
    const matched = findMatchingActions(event, actions);
    if (matched.length === 0) {
      setLog(["⚠️ No matching actions found for this event."]);
    } else {
      const logs: string[] = [`✅ Matched ${matched.length} action(s):`];
      for (const action of matched) {
        logs.push(`▶ Executing: "${action.name}"`);
        await executeAction(action, event, {
          onLog: (line) => logs.push(line),
          onRedemptionStatusChange: (id, status) => logs.push(`Status → ${status} (${id})`),
          onOverlayEvent,
        });
      }
      setLog(logs);
    }
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🧪</span>
        <div>
          <h3 className="text-sm font-semibold text-white">Simulation Center</h3>
          <p className="text-xs text-white/40">Fire test events to rehearse your action chains</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Event Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#1a1a24] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {TRIGGER_REGISTRY.map((t) => (
              <option key={t.type} value={t.type}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Variables (key=value per line)</label>
          <textarea
            value={vars}
            onChange={(e) => setVars(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white/80 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
        </div>
      </div>

      <button
        onClick={handleFire}
        disabled={running}
        className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
      >
        {running ? (
          <><span className="animate-spin text-base">⟳</span> Running…</>
        ) : (
          <><PlayIcon /> Fire Test Event</>
        )}
      </button>

      {log.length > 0 && (
        <div className="rounded-lg border border-white/8 bg-black/30 p-3 max-h-48 overflow-y-auto">
          {log.map((line, i) => (
            <div key={i} className={cn(
              "text-xs font-mono py-0.5",
              line.startsWith("✅") || line.startsWith("▶") ? "text-emerald-400" : line.startsWith("⚠️") ? "text-amber-400" : "text-white/50"
            )}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ACTIVITY QUEUE CARD
// ─────────────────────────────────────────────

function ActivityQueueCard({
  items,
  onFulfill,
  onRefund,
  onReplay,
}: {
  items: LiveRedemptionQueueItem[];
  onFulfill: (id: string) => void;
  onRefund: (id: string) => void;
  onReplay: (id: string) => void;
}) {
  const statusColors: Record<RedemptionStatus, string> = {
    pending: "text-amber-400 bg-amber-500/10",
    executing: "text-blue-400 bg-blue-500/10 animate-pulse",
    fulfilled: "text-emerald-400 bg-emerald-500/10",
    canceled: "text-red-400 bg-red-500/10",
    error: "text-red-500 bg-red-500/10",
  };

  const statusIcons: Record<RedemptionStatus, string> = {
    pending: "⏳",
    executing: "⚡",
    fulfilled: "✅",
    canceled: "↺",
    error: "❌",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Live Activity & Redemptions</span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-mono",
            items.some((i) => i.status === "pending") ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-white/60"
          )}>
            {items.filter((i) => i.status === "pending").length} pending
          </span>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Listening for events" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="text-3xl opacity-20">📭</span>
            <p className="text-xs text-white/30">No activity yet. Events will appear here as they fire.</p>
          </div>
        ) : (
          items.slice(0, 30).map((item) => (
            <div key={item.id} className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/3 px-3 py-2.5 hover:bg-white/5 transition-colors">
              {/* Platform icon */}
              <div className="flex-shrink-0 text-base">
                {item.platform === "twitch" ? "📺" : item.platform === "kick" ? "💚" : "🖱"}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white truncate">{item.user}</span>
                  <span className="text-xs text-white/40 truncate">redeemed</span>
                  <span className="text-xs font-medium text-violet-300 truncate">"{item.rewardTitle}"</span>
                  {item.cost > 0 && (
                    <span className="text-[10px] text-amber-400 font-mono">−{item.cost.toLocaleString()} pts</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", statusColors[item.status])}>
                    {statusIcons[item.status]} {item.status}
                  </span>
                  <span className="text-[11px] text-white/25">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onReplay(item.id)}
                  title="Replay"
                  className="rounded-md bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/30 transition-colors"
                >
                  ▶ Replay
                </button>
                {item.status !== "fulfilled" && (
                  <button
                    onClick={() => onFulfill(item.id)}
                    title="Fulfill"
                    className="rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                  >
                    ✓ Fulfill
                  </button>
                )}
                {item.status !== "canceled" && item.status !== "fulfilled" && (
                  <button
                    onClick={() => onRefund(item.id)}
                    title="Refund"
                    className="rounded-md bg-red-500/20 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/30 transition-colors"
                  >
                    ↺ Refund
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GLOBAL VARIABLES EDITOR
// ─────────────────────────────────────────────

function GlobalVarsEditor({ vars, onChange }: { vars: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
        {Object.entries(vars).length === 0 ? (
          <p className="text-xs text-white/30 py-2">No global variables yet.</p>
        ) : (
          Object.entries(vars).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <code className="flex-1 rounded bg-white/5 px-2 py-1 text-xs text-violet-300 font-mono truncate">%{k}%</code>
              <span className="text-white/30 text-xs">=</span>
              <input
                type="text"
                value={v}
                onChange={(e) => onChange({ ...vars, [k]: e.target.value })}
                className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <button onClick={() => { const n = { ...vars }; delete n[k]; onChange(n); }} className="text-white/20 hover:text-red-400 transition-colors text-xs">✕</button>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="variable_name"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-mono text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        <input type="text" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="value"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        <button
          onClick={() => { if (newKey.trim()) { onChange({ ...vars, [newKey.trim()]: newVal }); setNewKey(""); setNewVal(""); } }}
          className="rounded-lg bg-violet-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN MODULE
// ─────────────────────────────────────────────

export function AlertsModule() {
  const { settings, update } = useStore();
  const { status: obsStatus, state: obsState } = useObs();
  const alertSettings = settings.alerts;
  const actions = alertSettings.actions;
  const activityLog = alertSettings.activityLog;

  // UI state
  const [selectedActionId, setSelectedActionId] = useState<string | null>(
    actions[0]?.id ?? null
  );
  const [activeGroup, setActiveGroup] = useState<ActionGroup | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSimulation, setShowSimulation] = useState(false);
  const [showVarsPanel, setShowVarsPanel] = useState(false);
  const [showOverlaySetup, setShowOverlaySetup] = useState(false);
  const [copiedOverlay, setCopiedOverlay] = useState(false);
  const overlayUrl = useMemo(() => buildAlertsOverlayUrl(), []);
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<AlertAction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "activity">("editor");

  useEffect(() => {
    const onStatusUpdate = (e: CustomEvent) => {
      if (!e.detail) return;
      const { id, status } = e.detail;
      if (!id) return;
      update({
        alerts: {
          ...alertSettings,
          activityLog: (alertSettings.activityLog || []).map((item) =>
            item.id === id || item.redemptionId === id ? { ...item, status } : item
          ),
        },
      });
    };
    window.addEventListener("sc:redemption-status-update" as any, onStatusUpdate);
    return () => window.removeEventListener("sc:redemption-status-update" as any, onStatusUpdate);
  }, [alertSettings, update]);

  const selectedAction = actions.find((a) => a.id === selectedActionId) ?? null;

  // ── Filtered actions ──
  const filteredActions = actions.filter((a) => {
    if (activeGroup !== "all" && a.group !== activeGroup) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.triggers.some((t) => t.label.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ── Update helpers ──
  const updateActions = useCallback(
    (newActions: AlertAction[]) => {
      update({ alerts: { ...alertSettings, actions: newActions } });
    },
    [alertSettings, update]
  );

  const updateAction = useCallback(
    (id: string, patch: Partial<AlertAction>) => {
      updateActions(
        actions.map((a) =>
          a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a
        )
      );
    },
    [actions, updateActions]
  );

  const createAction = () => {
    const newAction: AlertAction = {
      id: nanoid(10),
      name: "New Action",
      group: "Custom",
      enabled: true,
      queueMode: "fifo",
      cooldownMs: 0,
      triggers: [],
      subActions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    updateActions([...actions, newAction]);
    setSelectedActionId(newAction.id);
    setEditingAction(newAction);
    setMetaModalOpen(true);
  };

  const duplicateAction = (id: string) => {
    const src = actions.find((a) => a.id === id);
    if (!src) return;
    const copy: AlertAction = {
      ...src,
      id: nanoid(10),
      name: `${src.name} (Copy)`,
      triggers: src.triggers.map((t) => ({ ...t, id: nanoid(10) })),
      subActions: src.subActions.map((s) => ({ ...s, id: nanoid(10) })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    updateActions([...actions, copy]);
    setSelectedActionId(copy.id);
  };

  const deleteAction = (id: string) => {
    updateActions(actions.filter((a) => a.id !== id));
    if (selectedActionId === id) setSelectedActionId(actions[0]?.id ?? null);
    setDeleteConfirm(null);
  };

  const updateActivityLog = useCallback(
    (newLog: LiveRedemptionQueueItem[]) => {
      update({ alerts: { ...alertSettings, activityLog: newLog } });
    },
    [alertSettings, update]
  );

  // Emit event to standalone overlay (?overlay=alerts) and local window
  const emitOverlayEvent = useCallback((evt: any) => {
    emitAlertsOverlayEvent(evt);
  }, []);

  const rehearseAction = async (id: string) => {
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    const event = {
      type: "manual" as const,
      vars: {
        user: "TestViewer",
        reward: action.name,
        cost: "500",
        tier: "Tier 1",
        bits: "500",
        viewers: "42",
        command: "!test",
      },
    };
    const logLines: string[] = [];
    await executeAction(action, event, {
      onLog: (line) => logLines.push(line),
      onRedemptionStatusChange: () => {},
      onOverlayEvent: emitOverlayEvent,
    });
    if (!action.subActions.some((sa) => sa.category === "overlay")) {
      emitAlertsOverlayEvent({
        type: "visual",
        src: "",
        bannerText: `▶ Rehearsed: "${action.name}"`,
        durationMs: 3500,
        animation: "zoom",
        position: "top_center",
        _id: Date.now() + Math.random(),
      });
    }
  };

  const handleFulfill = (id: string) => {
    updateActivityLog(activityLog.map((i) => i.id === id ? { ...i, status: "fulfilled" as RedemptionStatus } : i));
  };

  const handleRefund = (id: string) => {
    updateActivityLog(activityLog.map((i) => i.id === id ? { ...i, status: "canceled" as RedemptionStatus } : i));
  };

  const handleReplay = async (id: string) => {
    const item = activityLog.find((i) => i.id === id);
    if (!item) return;
    updateActivityLog(activityLog.map((i) => i.id === id ? { ...i, status: "executing" as RedemptionStatus } : i));
    const matched = findMatchingActions(
      { type: "twitch_reward", vars: item.contextVars },
      actions
    );
    const toRun = matched.length > 0 ? matched : actions.filter((a) => a.name === item.rewardTitle);
    for (const action of toRun) {
      await executeAction(action, { type: "twitch_reward", vars: item.contextVars }, {
        onRedemptionStatusChange: () => {},
        onOverlayEvent: emitOverlayEvent,
      });
    }
    updateActivityLog(activityLog.map((i) => i.id === id ? { ...i, status: "fulfilled" as RedemptionStatus } : i));
  };

  // Simulate an incoming redemption or event and run its matching action chain!
  const simulateRedemption = async () => {
    const names = ["CoolViewer99", "StreamFan2024", "TwitchNinja", "GamingPro", "PixelQueen", "ChronoGamer"];
    const randomName = names[Math.floor(Math.random() * names.length)];

    const enabledActions = actions.filter((a) => a.enabled);
    const targetAction = selectedActionId
      ? actions.find((a) => a.id === selectedActionId) || enabledActions[0] || actions[0]
      : enabledActions[Math.floor(Math.random() * (enabledActions.length || 1))] || actions[0];

    if (!targetAction) return;

    const trigger = targetAction.triggers[0] || { type: "twitch_reward", criteria: { rewardTitle: targetAction.name } };
    const eventType: any = trigger.type || "twitch_reward";
    const vars: Record<string, string> = { user: randomName, reward: targetAction.name, cost: "500" };

    if (eventType === "twitch_reward") {
      vars.reward = trigger.criteria?.rewardTitle || targetAction.name || "Channel Point Reward";
      vars.cost = "500";
    } else if (eventType === "twitch_sub" || eventType === "twitch_resub" || eventType === "twitch_gift_sub") {
      vars.tier = "Tier 1";
      vars.months = "6";
    } else if (eventType === "twitch_cheer") {
      vars.bits = String(trigger.criteria?.minBits || "500");
    } else if (eventType === "twitch_raid") {
      vars.viewers = String(trigger.criteria?.minViewers || "42");
    } else if (eventType === "twitch_command") {
      vars.command = trigger.criteria?.command || "!siren";
      vars.message = "Hello from simulation!";
    }

    const newItem: LiveRedemptionQueueItem = {
      id: nanoid(10),
      timestamp: Date.now(),
      user: randomName,
      rewardTitle: vars.reward || targetAction.name,
      cost: Number(vars.cost || 500),
      platform: "twitch",
      status: "executing",
      redemptionId: nanoid(16),
      contextVars: vars,
    };

    const currentLog = [newItem, ...activityLog];
    updateActivityLog(currentLog);

    const event = { type: eventType, vars, redemptionId: newItem.id };
    const matched = findMatchingActions(event, actions);
    const toExecute = matched.length > 0 ? matched : [targetAction];

    for (const action of toExecute) {
      await executeAction(action, event, {
        onOverlayEvent: emitOverlayEvent,
        onRedemptionStatusChange: (_id, status) => {
          updateActivityLog(
            (alertSettings.activityLog || currentLog).map((i) => i.id === newItem.id ? { ...i, status } : i)
          );
        },
      });

      if (!action.subActions.some((sa) => sa.category === "overlay")) {
        emitAlertsOverlayEvent({
          type: "visual",
          src: "",
          bannerText: `⚡ Executed Action: "${action.name}" (${randomName})`,
          durationMs: 4000,
          animation: "bounce",
          position: "top_center",
          _id: Date.now() + Math.random(),
        });
      }
    }

    updateActivityLog(
      (alertSettings.activityLog || currentLog).map((i) => i.id === newItem.id ? { ...i, status: "fulfilled" } : i)
    );
  };

  const rightPanelRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-screen bg-[#0e0e12] text-white overflow-hidden">
      {/* ── Top Header ── */}
      <div className="flex-shrink-0 border-b border-white/8 bg-[#0e0e12]">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/80">
              <BellIcon />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Alerts & Redemptions Engine</h1>
              <p className="text-[11px] text-white/30">Stream Control · Macro & Alert Execution System</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* OBS status indicator */}
            <div className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/3 px-3 py-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${obsStatus === "connected" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : obsStatus === "connecting" ? "bg-amber-400 animate-pulse" : "bg-red-500"}`} />
              <span className="text-[11px] text-white/70">
                {obsStatus === "connected"
                  ? `OBS Connected (${obsState.obsVersion || "v5"})`
                  : obsStatus === "connecting"
                  ? "OBS Connecting..."
                  : "OBS Disconnected"}
              </span>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(overlayUrl);
                setCopiedOverlay(true);
                setTimeout(() => setCopiedOverlay(false), 2000);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                copiedOverlay
                  ? "border-emerald-500 bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                  : "border-[#9146FF]/50 bg-[#9146FF]/20 text-[#c9a8ff] hover:bg-[#9146FF]/30 hover:border-[#9146FF]"
              }`}
              title="Copy the standalone Browser Source URL (?overlay=alerts) to paste into OBS Studio"
            >
              <span>📺</span>
              <span>{copiedOverlay ? "✓ URL Copied to Clipboard!" : "Copy OBS Overlay URL"}</span>
            </button>

            <button
              onClick={() => setShowOverlaySetup(true)}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="View instructions on setting up your Alerts Browser Source in OBS"
            >
              <span>ℹ️</span>
              <span className="hidden sm:inline">Setup Instructions</span>
            </button>

            <button
              onClick={simulateRedemption}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              + Simulate Event
            </button>

            <button
              onClick={() => setShowSimulation(!showSimulation)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                showSimulation
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/8 bg-white/3 text-white/50 hover:text-white hover:bg-white/8"
              )}
            >
              🧪 Test Center
            </button>

            <button
              onClick={() => setShowVarsPanel(!showVarsPanel)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                showVarsPanel
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                  : "border-white/8 bg-white/3 text-white/50 hover:text-white hover:bg-white/8"
              )}
            >
              📦 Global Vars
            </button>
          </div>
        </div>

        {/* Group filter bar */}
        <div className="flex items-center justify-between gap-4 px-4 py-2">
          <GroupFilterBar
            actions={actions}
            activeGroup={activeGroup}
            onGroupChange={setActiveGroup}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingAction(null); setMetaModalOpen(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors"
            >
              <PlusIcon /> New Action
            </button>
          </div>
        </div>

        {/* Expandable panels */}
        {showSimulation && (
          <div className="border-t border-white/8 bg-[#12121a] px-4 py-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/40 border border-white/10 rounded-xl p-3 shadow-md">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>📺</span> Standalone Alerts Browser Source Overlay (?overlay=alerts)
                </h4>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Add to OBS Studio as a <strong className="text-white">1920×1080 Browser Source</strong> to view visual graphics and hear sound effects when simulating.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  readOnly
                  value={overlayUrl}
                  className="bg-black/60 border border-white/15 rounded-lg px-2.5 py-1 font-mono text-xs text-white/80 outline-none select-all flex-1 sm:w-64"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(overlayUrl);
                    setCopiedOverlay(true);
                    setTimeout(() => setCopiedOverlay(false), 2000);
                  }}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition shrink-0 cursor-pointer ${
                    copiedOverlay
                      ? "bg-emerald-500 text-black shadow"
                      : "bg-[#9146FF] hover:bg-[#7b2cbf] text-white shadow"
                  }`}
                >
                  {copiedOverlay ? "✓ Copied!" : "Copy URL"}
                </button>
              </div>
            </div>
            <SimulationCenter actions={actions} onOverlayEvent={emitOverlayEvent} />
          </div>
        )}

        {showVarsPanel && (
          <div className="border-t border-white/8 bg-[#12121a] px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-white">📦 Global Variables</span>
              <span className="text-xs text-white/30">Persisted across all action executions</span>
            </div>
            <GlobalVarsEditor
              vars={alertSettings.globalVars}
              onChange={(v) => update({ alerts: { ...alertSettings, globalVars: v } })}
            />
          </div>
        )}
      </div>

      {/* ── Tab switcher (mobile) ── */}
      <div className="flex-shrink-0 flex lg:hidden border-b border-white/8">
        <button
          onClick={() => setActiveTab("editor")}
          className={cn("flex-1 py-2 text-xs font-semibold transition-colors", activeTab === "editor" ? "text-violet-300 border-b-2 border-violet-500" : "text-white/40")}
        >
          Actions Editor
        </button>
        <button
          onClick={() => setActiveTab("activity")}
          className={cn("flex-1 py-2 text-xs font-semibold transition-colors", activeTab === "activity" ? "text-violet-300 border-b-2 border-violet-500" : "text-white/40")}
        >
          Activity Queue {activityLog.filter((i) => i.status === "pending").length > 0 && (
            <span className="ml-1 rounded-full bg-amber-500/30 px-1.5 text-amber-300 text-[10px]">
              {activityLog.filter((i) => i.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {/* ── Main Workspace ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Actions List ── */}
        <div className={cn(
          "flex flex-col border-r border-white/8 bg-[#0e0e12]",
          "w-full lg:w-[340px] xl:w-[380px] flex-shrink-0",
          "lg:flex", activeTab === "editor" ? "flex" : "hidden"
        )}>
          {/* Search */}
          <div className="flex-shrink-0 p-3 border-b border-white/5">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <SearchIcon />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter actions by name or trigger…"
                className="w-full rounded-lg border border-white/8 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Action list */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
            {filteredActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <span className="text-4xl opacity-20">🔔</span>
                <div>
                  <p className="text-sm text-white/50">No actions found</p>
                  <p className="text-xs text-white/25 mt-1">
                    {searchQuery ? "Try a different search term" : "Create your first action to get started"}
                  </p>
                </div>
                {!searchQuery && (
                  <button onClick={createAction} className="flex items-center gap-1.5 rounded-lg bg-violet-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors">
                    <PlusIcon /> New Action
                  </button>
                )}
              </div>
            ) : (
              <SortableList
                items={filteredActions}
                getId={(a) => a.id}
                editMode={true}
                onReorder={(reorderedIds: string[]) => {
                  const byId = new Map(actions.map((a) => [a.id, a]));
                  const reordered = reorderedIds.map((id) => byId.get(id)).filter((Boolean as any) as (v: any) => v is AlertAction);
                  const others = actions.filter((a) => !reorderedIds.includes(a.id));
                  updateActions([...reordered, ...others]);
                }}
                renderItem={(action) => (
                  <ActionRow
                    action={action}
                    selected={selectedActionId === action.id}
                    onSelect={() => setSelectedActionId(action.id)}
                    onToggle={() => updateAction(action.id, { enabled: !action.enabled })}
                    onDuplicate={() => duplicateAction(action.id)}
                    onDelete={() => setDeleteConfirm(action.id)}
                    onRehearse={() => rehearseAction(action.id)}
                  />
                )}
              />
            )}
          </div>

          {/* Footer stats */}
          <div className="flex-shrink-0 border-t border-white/5 px-4 py-2.5 flex items-center justify-between">
            <span className="text-[11px] text-white/25">
              {actions.filter((a) => a.enabled).length}/{actions.length} enabled
            </span>
            <span className="text-[11px] text-white/25">
              {actions.reduce((acc, a) => acc + a.subActions.length, 0)} total sub-actions
            </span>
          </div>
        </div>

        {/* ── RIGHT: Editor / Activity ── */}
        <div className={cn(
          "flex flex-col flex-1 min-w-0 overflow-hidden",
          "lg:flex", activeTab !== "editor" || !selectedAction ? "hidden lg:flex" : "flex"
        )}>
          {selectedAction ? (
            <div className="flex flex-col h-full" ref={rightPanelRef}>
              {/* Action meta header */}
              <div className="flex-shrink-0 flex items-center justify-between border-b border-white/8 px-4 py-3 bg-[#11111a]">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    className="lg:hidden text-white/40 hover:text-white transition-colors text-sm"
                    onClick={() => setSelectedActionId(null)}
                  >← Back</button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-bold text-white truncate">{selectedAction.name}</h2>
                      <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", getGroupColor(selectedAction.group))}>
                        {selectedAction.group}
                      </span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", getQueueModeColor(selectedAction.queueMode))}>
                        {selectedAction.queueMode}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/30 mt-0.5">
                      Cooldown: {selectedAction.cooldownMs > 0 ? `${selectedAction.cooldownMs / 1000}s` : "None"} ·
                      Last run: {selectedAction.lastExecutedAt ? new Date(selectedAction.lastExecutedAt).toLocaleTimeString() : "Never"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingAction(selectedAction); setMetaModalOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <EditIcon /> Edit
                  </button>
                  <button
                    onClick={() => rehearseAction(selectedAction.id)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600/80 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
                  >
                    <PlayIcon /> Rehearse
                  </button>
                </div>
              </div>

              {/* Split: Triggers (top 40%) + Sub-Actions (bottom 60%) */}
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Triggers */}
                <div className="border-b border-white/8 overflow-hidden" style={{ flexBasis: "42%", flexShrink: 0, minHeight: 160 }}>
                  <TriggersPanel
                    action={selectedAction}
                    onUpdateTriggers={(triggers) => updateAction(selectedAction.id, { triggers })}
                  />
                </div>

                {/* Sub-Actions */}
                <div className="flex-1 overflow-hidden" style={{ minHeight: 220 }}>
                  <SubActionsPanel
                    action={selectedAction}
                    allActions={actions}
                    onUpdateSubActions={(subActions) => updateAction(selectedAction.id, { subActions })}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* No selection + Activity panel */
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Empty state */}
              <div className="flex flex-col items-center justify-center gap-4 flex-shrink-0 py-8 px-6 border-b border-white/8">
                <div className="h-12 w-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-2xl">🔔</div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white/60">Select an action to edit</p>
                  <p className="text-xs text-white/30 mt-1">Or create a new one to get started</p>
                </div>
                <button onClick={createAction} className="flex items-center gap-1.5 rounded-lg bg-violet-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition-colors">
                  <PlusIcon /> New Action
                </button>
              </div>

              {/* Activity queue */}
              <div className="flex-1 overflow-hidden">
                <ActivityQueueCard
                  items={activityLog}
                  onFulfill={handleFulfill}
                  onRefund={handleRefund}
                  onReplay={handleReplay}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── FAR RIGHT: Activity Queue (always visible on large screens when action selected) ── */}
        {selectedAction && (
          <div className="hidden xl:flex flex-col w-[320px] flex-shrink-0 border-l border-white/8 overflow-hidden">
            <ActivityQueueCard
              items={activityLog}
              onFulfill={handleFulfill}
              onRefund={handleRefund}
              onReplay={handleReplay}
            />
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <ActionMetaModal
        action={editingAction}
        open={metaModalOpen}
        onClose={() => { setMetaModalOpen(false); setEditingAction(null); }}
        onSave={(patch) => {
          if (editingAction) {
            updateAction(editingAction.id, patch);
          } else {
            // New action was created by createAction(), update most recently created
            const latest = actions[actions.length - 1];
            if (latest) updateAction(latest.id, patch);
          }
        }}
      />

      {/* Delete confirm */}
      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center text-xl">🗑</div>
            <div>
              <h3 className="text-sm font-semibold text-white">Delete Action</h3>
              <p className="text-xs text-white/50">
                "{actions.find((a) => a.id === deleteConfirm)?.name}" will be permanently deleted.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => deleteAction(deleteConfirm!)}
              className="flex-1 rounded-lg bg-red-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Standalone Alerts Browser Source Setup Modal */}
      {showOverlaySetup && (
        <Modal open={showOverlaySetup} onClose={() => setShowOverlaySetup(false)}>
          <div className="flex flex-col gap-4 max-w-lg text-xs text-white/80">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="h-10 w-10 rounded-xl bg-[#9146FF]/20 border border-[#9146FF]/40 flex items-center justify-center text-xl">📺</div>
              <div>
                <h3 className="text-sm font-bold text-white">Standalone Alerts Browser Source Setup</h3>
                <p className="text-[11px] text-white/50">How to add your alert graphics and sounds into OBS Studio</p>
              </div>
            </div>

            <div className="space-y-3 leading-relaxed">
              <p>
                Stream Control broadcasts all visual animations (GIFs/WEBMs) and sound clips directly to your **Alerts Browser Source** via local IPC (`?overlay=alerts`).
              </p>

              <div className="bg-black/50 border border-white/15 rounded-xl p-3 flex items-center gap-2 font-mono text-[11px] text-white select-all">
                <span className="truncate flex-1">{overlayUrl}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(overlayUrl);
                    setCopiedOverlay(true);
                    setTimeout(() => setCopiedOverlay(false), 2000);
                  }}
                  className="px-3 py-1 rounded bg-[#9146FF] hover:bg-[#7b2cbf] text-white font-bold shrink-0 transition"
                >
                  {copiedOverlay ? "✓ Copied!" : "Copy URL"}
                </button>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                <h4 className="font-bold text-emerald-300">Quick Setup in OBS Studio:</h4>
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-white/70">
                  <li>In OBS Studio, click **+** under **Sources** and select **Browser**.</li>
                  <li>Name it <strong className="text-white">Stream Control Alerts</strong> and click OK.</li>
                  <li>Paste the copied URL into the **URL** field.</li>
                  <li>Set **Width** to <strong className="text-white font-mono">1920</strong> and **Height** to <strong className="text-white font-mono">1080</strong> (or your canvas resolution).</li>
                  <li>Check <strong className="text-white">Control audio via OBS</strong> if you want separate volume/monitoring inside your OBS Audio Mixer.</li>
                  <li>Click OK. Your alerts overlay is now active and ready!</li>
                </ol>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                onClick={() => setShowOverlaySetup(false)}
                className="rounded-lg bg-[#9146FF] px-5 py-2 text-xs font-bold text-white hover:bg-[#7b2cbf] transition-colors cursor-pointer"
              >
                Got it, close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB EXPORT
// ─────────────────────────────────────────────

export const alertsTab = {
  id: "alerts",
  name: "Alerts & Redemptions",
  icon: <BellIcon />,
  description: "streamer.bot-style Channel Point redemptions and live alerts engine.",
  Component: AlertsModule,
};

// React import for JSX
import React from "react";
