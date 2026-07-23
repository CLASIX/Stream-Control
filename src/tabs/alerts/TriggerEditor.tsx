// ============================================================
// TriggerEditor — Multi-step modal for adding/editing triggers
// ============================================================

import { useState } from "react";
import { cn } from "../../utils/cn";
import type { AlertTrigger, TriggerSource, TriggerType, SubscriptionTier, ChatCommandRole } from "../../types/alerts";
import { TRIGGER_REGISTRY } from "../../lib/alertEngine";

interface TriggerEditorProps {
  initial?: AlertTrigger;
  onSave: (trigger: AlertTrigger) => void;
  onCancel: () => void;
}

const SOURCES: { value: TriggerSource; label: string; icon: string; color: string }[] = [
  { value: "twitch", label: "Twitch", icon: "📺", color: "bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30" },
  { value: "kick", label: "Kick", icon: "💚", color: "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30" },
  { value: "obs", label: "OBS Studio", icon: "🎞", color: "bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30" },
  { value: "hotkey", label: "Hotkey / Manual", icon: "⌨️", color: "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30" },
  { value: "manual", label: "Manual Trigger", icon: "🖱", color: "bg-slate-500/20 text-slate-300 border-slate-500/30 hover:bg-slate-500/30" },
];

const TIERS: { value: SubscriptionTier; label: string }[] = [
  { value: "prime", label: "Prime" },
  { value: "tier1", label: "Tier 1" },
  { value: "tier2", label: "Tier 2" },
  { value: "tier3", label: "Tier 3" },
];

const ROLES: { value: ChatCommandRole; label: string }[] = [
  { value: "broadcaster", label: "Broadcaster" },
  { value: "moderator", label: "Moderator" },
  { value: "vip", label: "VIP" },
  { value: "subscriber", label: "Subscriber" },
  { value: "any", label: "Any Viewer" },
];

function makeId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function TriggerEditor({ initial, onSave, onCancel }: TriggerEditorProps) {
  const [step, setStep] = useState<"source" | "type" | "criteria">(
    initial ? "criteria" : "source"
  );
  const [source, setSource] = useState<TriggerSource | null>(initial?.source ?? null);
  const [type, setType] = useState<TriggerType | null>(initial?.type ?? null);
  const [criteria, setCriteria] = useState(initial?.criteria ?? {});
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const filteredTypes = source
    ? TRIGGER_REGISTRY.filter((t) => t.source === source)
    : [];

  const selectedMeta = TRIGGER_REGISTRY.find((t) => t.type === type);

  function handleSave() {
    if (!type || !source || !selectedMeta) return;
    onSave({
      id: initial?.id ?? makeId(),
      type,
      source,
      label: selectedMeta.label,
      enabled,
      criteria: { ...selectedMeta.defaultCriteria, ...criteria },
    });
  }

  // ── Source picker ──
  if (step === "source") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-white">Add Trigger — Select Source</h2>
        <div className="grid grid-cols-1 gap-2">
          {SOURCES.map((src) => (
            <button
              key={src.value}
              onClick={() => { setSource(src.value); setStep("type"); }}
              className={cn("flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all", src.color)}
            >
              <span className="text-xl">{src.icon}</span>
              <span className="font-semibold">{src.label}</span>
              <span className="ml-auto text-xs opacity-60">{TRIGGER_REGISTRY.filter((t) => t.source === src.value).length} trigger types →</span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-sm text-white/40 hover:text-white/70 transition-colors">Cancel</button>
      </div>
    );
  }

  // ── Type picker ──
  if (step === "type" && source !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep("source")} className="text-white/40 hover:text-white transition-colors text-sm">← Back</button>
          <h2 className="text-base font-semibold text-white">Select Trigger Type</h2>
        </div>
        <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
          {filteredTypes.map((meta) => (
            <button
              key={meta.type}
              onClick={() => {
                setType(meta.type);
                setCriteria({ ...meta.defaultCriteria });
                setStep("criteria");
              }}
              className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition-colors"
            >
              <span className="text-xl">{meta.icon}</span>
              <div>
                <div className="text-sm font-semibold text-white">{meta.label}</div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-sm text-white/40 hover:text-white/70 transition-colors">Cancel</button>
      </div>
    );
  }

  // ── Criteria editor ──
  if (step === "criteria" && type !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {!initial && (
            <button onClick={() => setStep("type")} className="text-white/40 hover:text-white transition-colors text-sm">← Back</button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{selectedMeta?.icon}</span>
              <h2 className="text-base font-semibold text-white">{selectedMeta?.label}</h2>
            </div>
            <p className="text-xs text-white/40">Configure trigger criteria</p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0", enabled ? "bg-violet-600" : "bg-white/20")}
          >
            <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
          </button>
          <span className="text-sm text-white/70">Enabled</span>
        </label>

        <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
          <CriteriaForm type={type} criteria={criteria} onChange={setCriteria} />
        </div>

        <div className="flex gap-2 pt-2 border-t border-white/8">
          <button onClick={handleSave} className="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors">
            {initial ? "Save Trigger" : "Add Trigger"}
          </button>
          <button onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Criteria form by trigger type ──

function CriteriaForm({
  type,
  criteria,
  onChange,
}: {
  type: TriggerType;
  criteria: AlertTrigger["criteria"];
  onChange: (c: AlertTrigger["criteria"]) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch = (fields: Record<string, any>) => onChange({ ...criteria, ...fields });

  if (type === "twitch_sub" || type === "twitch_resub" || type === "twitch_gift_sub") {
    const selectedTiers: SubscriptionTier[] = criteria.tiers ?? [];
    const toggleTier = (tier: SubscriptionTier) => {
      patch({ tiers: selectedTiers.includes(tier) ? selectedTiers.filter((t) => t !== tier) : [...selectedTiers, tier] });
    };
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2 block">Subscription Tiers</label>
          <div className="flex flex-wrap gap-2">
            {TIERS.map((tier) => (
              <button
                key={tier.value}
                onClick={() => toggleTier(tier.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  selectedTiers.includes(tier.value)
                    ? "border-violet-500 bg-violet-500/20 text-violet-300"
                    : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                )}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
        {type === "twitch_gift_sub" && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Min Gift Count</label>
              <input type="number" value={criteria.minGiftCount ?? 1} min={1}
                onChange={(e) => patch({ minGiftCount: Number(e.target.value) })}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Max Gift Count</label>
              <input type="number" value={criteria.maxGiftCount ?? ""} min={1} placeholder="No limit"
                onChange={(e) => patch({ maxGiftCount: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (type === "twitch_reward") {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Reward Title (leave blank for any reward)</label>
          <input type="text" value={criteria.rewardTitle ?? ""} placeholder="Hydrate Check"
            onChange={(e) => patch({ rewardTitle: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Reward ID (optional, for exact matching)</label>
          <input type="text" value={criteria.rewardId ?? ""} placeholder="abc123-reward-id"
            onChange={(e) => patch({ rewardId: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
      </div>
    );
  }

  if (type === "twitch_raid" || type === "kick_follow") {
    return (
      <div>
        <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Minimum Viewers</label>
        <input type="number" value={criteria.minViewers ?? 1} min={1}
          onChange={(e) => patch({ minViewers: Number(e.target.value) })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
      </div>
    );
  }

  if (type === "twitch_cheer") {
    return (
      <div>
        <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Minimum Bits</label>
        <input type="number" value={criteria.minBits ?? 1} min={1}
          onChange={(e) => patch({ minBits: Number(e.target.value) })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
      </div>
    );
  }

  if (type === "twitch_command" || type === "kick_command") {
    const selectedRoles: ChatCommandRole[] = criteria.commandRoles ?? ["any"];
    const toggleRole = (role: ChatCommandRole) => {
      patch({ commandRoles: selectedRoles.includes(role) ? selectedRoles.filter((r) => r !== role) : [...selectedRoles, role] });
    };
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Command (e.g. !siren)</label>
          <input type="text" value={criteria.command ?? ""} placeholder="!command"
            onChange={(e) => patch({ command: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2 block">Allowed Roles</label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <button
                key={role.value}
                onClick={() => toggleRole(role.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  selectedRoles.includes(role.value)
                    ? "border-violet-500 bg-violet-500/20 text-violet-300"
                    : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                )}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === "obs_scene_changed") {
    return (
      <div>
        <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Scene Name (leave blank for any scene)</label>
        <input type="text" value={criteria.sceneName ?? ""} placeholder="Game"
          onChange={(e) => patch({ sceneName: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
      </div>
    );
  }

  if (type === "hotkey") {
    return (
      <div>
        <label className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5 block">Hotkey Binding</label>
        <input type="text" value={criteria.hotkey ?? ""} placeholder="Ctrl+Shift+F1"
          onChange={(e) => patch({ hotkey: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        <p className="mt-1.5 text-xs text-white/40">Format: Modifier+Key (e.g. Ctrl+Shift+F1, Alt+F4)</p>
      </div>
    );
  }

  // follow, stream started/stopped, recording, manual
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-3 text-sm text-white/50">
      No additional criteria needed for this trigger type. It will fire on every matching event.
    </div>
  );
}
