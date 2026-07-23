// ============================================================
// SubActionEditor — Rich form for editing any sub-action type
// ============================================================

import React, { useState, type Dispatch, type SetStateAction } from "react";
import { cn } from "../../utils/cn";
import type {
  SubAction,
  SubActionOptions,
  SubActionCategory,
} from "../../types/alerts";
import {
  SUB_ACTION_REGISTRY,
  getCategoryLabel,
  getCategoryColor,
} from "../../lib/alertEngine";

interface SubActionEditorProps {
  initial?: SubAction;
  allActionNames?: { id: string; name: string }[];
  onSave: (sa: SubAction) => void;
  onCancel: () => void;
}

const CATEGORIES: SubActionCategory[] = [
  "logic",
  "platform",
  "obs",
  "overlay",
  "external",
];

function makeId(): string {
  return Math.random().toString(36).slice(2, 12);
}

// ── Primitive form controls ──────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-white/50 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500" />
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-[#1a1a24] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500">
      {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: Dispatch<SetStateAction<boolean>> | ((v: boolean) => void) }) {
  return (
    <button type="button" onClick={() => (onChange as (v: boolean) => void)(!value)}
      className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0", value ? "bg-violet-600" : "bg-white/20")}>
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", value ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

// ── Main Editor Component ──────────────────

export function SubActionEditor({ initial, allActionNames = [], onSave, onCancel }: SubActionEditorProps) {
  const [step, setStep] = useState<"category" | "kind" | "form">(initial ? "form" : "category");
  const [selectedCat, setSelectedCat] = useState<SubActionCategory | null>(initial?.category ?? null);
  const [opts, setOpts] = useState<SubActionOptions>(
    initial?.options ?? SUB_ACTION_REGISTRY[0].defaultOptions
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const filteredMeta = selectedCat !== null ? SUB_ACTION_REGISTRY.filter((m) => m.category === selectedCat) : [];

  function handleKindSelect(kind: SubActionOptions["kind"]) {
    const meta = SUB_ACTION_REGISTRY.find((m) => m.kind === kind);
    if (meta) { setOpts({ ...meta.defaultOptions }); setStep("form"); }
  }

  function handleSave() {
    onSave({ id: initial?.id ?? makeId(), enabled, category: selectedCat ?? "logic", options: opts });
  }

  // ── Category Picker ──────────────────
  if (step === "category") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-white">Add Sub-Action — Select Category</h2>
        <div className="grid grid-cols-1 gap-2">
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => { setSelectedCat(cat); setStep("kind"); }}
              className={cn("flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all hover:brightness-110", getCategoryColor(cat))}>
              <span className="text-lg">{cat === "logic" ? "🔀" : cat === "platform" ? "💬" : cat === "obs" ? "🎞" : cat === "overlay" ? "🖼" : "🌐"}</span>
              <div>
                <div className="font-semibold">{getCategoryLabel(cat)}</div>
                <div className="text-xs opacity-70">{SUB_ACTION_REGISTRY.filter((m) => m.category === cat).length} available actions</div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="mt-1 text-sm text-white/40 hover:text-white/70 transition-colors">Cancel</button>
      </div>
    );
  }

  // ── Kind Picker ──────────────────────
  if (step === "kind" && selectedCat !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep("category")} className="text-white/40 hover:text-white transition-colors text-sm">← Back</button>
          <h2 className="text-base font-semibold text-white">{getCategoryLabel(selectedCat)}</h2>
        </div>
        <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
          {filteredMeta.map((meta) => (
            <button key={meta.kind} onClick={() => handleKindSelect(meta.kind)}
              className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition-colors">
              <span className="mt-0.5 text-xl">{meta.icon}</span>
              <div>
                <div className="text-sm font-semibold text-white">{meta.label}</div>
                <div className="text-xs text-white/50">{meta.description}</div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-sm text-white/40 hover:text-white/70 transition-colors">Cancel</button>
      </div>
    );
  }

  // ── Form ─────────────────────────────
  const meta = SUB_ACTION_REGISTRY.find((m) => m.kind === opts.kind);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {!initial && (
          <button onClick={() => setStep("kind")} className="text-white/40 hover:text-white transition-colors text-sm">← Back</button>
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta?.icon}</span>
            <h2 className="text-base font-semibold text-white">{meta?.label}</h2>
          </div>
          <p className="text-xs text-white/50">{meta?.description}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <Toggle value={enabled} onChange={setEnabled} />
          <span className="text-sm text-white/70">Enabled</span>
        </label>

        <FormBody opts={opts} setOpts={setOpts} allActionNames={allActionNames} />
      </div>

      <div className="flex gap-2 pt-2 border-t border-white/8">
        <button onClick={handleSave} className="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors">
          {initial ? "Save Changes" : "Add Sub-Action"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── FormBody — renders the correct fields by kind ──

function FormBody({
  opts,
  setOpts,
  allActionNames,
}: {
  opts: SubActionOptions;
  setOpts: React.Dispatch<React.SetStateAction<SubActionOptions>>;
  allActionNames: { id: string; name: string }[];
}) {
  // Helper: patch specific fields into the union (cast is safe because we only set fields relevant to the current kind)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch = (fields: Record<string, any>) => setOpts((p) => ({ ...p, ...fields } as SubActionOptions));

  if (opts.kind === "delay") {
    return <Field label="Delay Duration (ms)"><NumberInput value={opts.delayMs} onChange={(v) => patch({ delayMs: v })} min={0} /></Field>;
  }

  if (opts.kind === "break") {
    return <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">🛑 This will immediately stop the execution chain. No further sub-actions will run.</div>;
  }

  if (opts.kind === "set_variable") {
    return <>
      <Field label="Variable Name"><TextInput value={opts.variableName} onChange={(v) => patch({ variableName: v })} placeholder="myVar" /></Field>
      <Field label="Operation">
        <Select value={opts.operation} onChange={(v) => patch({ operation: v })} options={[
          { value: "set", label: "Set (=)" }, { value: "add", label: "Add (+)" },
          { value: "subtract", label: "Subtract (−)" }, { value: "multiply", label: "Multiply (×)" }, { value: "divide", label: "Divide (÷)" },
        ]} />
      </Field>
      <Field label="Value"><TextInput value={opts.value} onChange={(v) => patch({ value: v })} placeholder="0 or %var%" /></Field>
      <Field label="Scope">
        <Select value={opts.scope} onChange={(v) => patch({ scope: v })} options={[
          { value: "local", label: "Local (this execution only)" }, { value: "global", label: "Global (persists across executions)" },
        ]} />
      </Field>
    </>;
  }

  if (opts.kind === "if_else") {
    return <>
      <Field label="Left Variable (e.g. %user%)"><TextInput value={opts.leftVar} onChange={(v) => patch({ leftVar: v })} placeholder="%user%" /></Field>
      <Field label="Operator">
        <Select value={opts.operator} onChange={(v) => patch({ operator: v })} options={[
          { value: "equals", label: "equals (==)" }, { value: "not_equals", label: "not equals (!=)" },
          { value: "greater_than", label: "greater than (>)" }, { value: "less_than", label: "less than (<)" },
          { value: "contains", label: "contains" }, { value: "not_contains", label: "does not contain" }, { value: "regex", label: "matches regex" },
        ]} />
      </Field>
      <Field label="Right Value"><TextInput value={opts.rightValue} onChange={(v) => patch({ rightValue: v })} placeholder="value or %var%" /></Field>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
        ℹ️ Then / Else branches can be configured by adding sub-actions after saving.
      </div>
    </>;
  }

  if (opts.kind === "run_action") {
    return <>
      <Field label="Target Action">
        <Select value={opts.targetActionId} onChange={(v) => {
          const found = allActionNames.find((a) => a.id === v);
          patch({ targetActionId: v, targetActionName: found?.name ?? "" });
        }} options={[{ value: "", label: "— Select Action —" }, ...allActionNames.map((a) => ({ value: a.id, label: a.name }))]} />
      </Field>
      <Field label="Execution Mode">
        <Select value={opts.mode} onChange={(v) => patch({ mode: v })} options={[
          { value: "sync", label: "Synchronous (wait for completion)" }, { value: "async", label: "Asynchronous (fire and forget)" },
        ]} />
      </Field>
    </>;
  }

  if (opts.kind === "twitch_chat_message") {
    return <>
      <Field label="Platform">
        <Select value={opts.platform} onChange={(v) => patch({ platform: v })} options={[
          { value: "twitch", label: "Twitch" }, { value: "kick", label: "Kick" },
        ]} />
      </Field>
      <Field label="Message">
        <textarea value={opts.message} onChange={(e) => patch({ message: e.target.value })} rows={3}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          placeholder="Thanks %user% for the support! PogChamp" />
      </Field>
      <label className="flex items-center gap-2 cursor-pointer">
        <Toggle value={opts.replyToUser} onChange={(v: boolean) => patch({ replyToUser: v })} />
        <span className="text-sm text-white/70">Reply to @user</span>
      </label>
    </>;
  }

  if (opts.kind === "twitch_update_reward_status") {
    return <Field label="New Status">
      <Select value={opts.status} onChange={(v) => patch({ status: v })} options={[
        { value: "fulfilled", label: "✅ Fulfilled (keep points spent)" }, { value: "canceled", label: "↺ Canceled (refund points)" },
      ]} />
    </Field>;
  }

  if (opts.kind === "twitch_target_info") {
    return <Field label="Target Username Variable"><TextInput value={opts.targetVar} onChange={(v) => patch({ targetVar: v })} placeholder="%user%" /></Field>;
  }

  if (opts.kind === "twitch_create_clip") {
    return <>
      <label className="flex items-center gap-2 cursor-pointer">
        <Toggle value={opts.hasDelay} onChange={(v: boolean) => patch({ hasDelay: v })} />
        <span className="text-sm text-white/70">Add 2s delay before capture</span>
      </label>
      <Field label="Store URL in Variable"><TextInput value={opts.storeAs} onChange={(v) => patch({ storeAs: v })} placeholder="clip_url" /></Field>
    </>;
  }

  if (opts.kind === "twitch_timeout_ban") {
    return <>
      <Field label="Action">
        <Select value={opts.action} onChange={(v) => patch({ action: v })} options={[
          { value: "timeout", label: "⏱ Timeout" }, { value: "ban", label: "🔨 Permanent Ban" },
        ]} />
      </Field>
      <Field label="Target (variable or username)"><TextInput value={opts.targetVar} onChange={(v) => patch({ targetVar: v })} placeholder="%user%" /></Field>
      {opts.action === "timeout" && (
        <Field label="Duration (seconds)"><NumberInput value={opts.durationSeconds ?? 600} onChange={(v) => patch({ durationSeconds: v })} min={1} /></Field>
      )}
      <Field label="Reason"><TextInput value={opts.reason} onChange={(v) => patch({ reason: v })} placeholder="Triggered by automation" /></Field>
    </>;
  }

  if (opts.kind === "obs_source_visibility") {
    return <>
      <Field label="Scene Name"><TextInput value={opts.sceneName} onChange={(v) => patch({ sceneName: v })} placeholder="Game" /></Field>
      <Field label="Source Name"><TextInput value={opts.sourceName} onChange={(v) => patch({ sourceName: v })} placeholder="Bomb Drop" /></Field>
      <Field label="Canvas">
        <Select value={opts.canvas} onChange={(v) => patch({ canvas: v })} options={[
          { value: "main", label: "Main (Horizontal)" }, { value: "vertical", label: "Aitum Vertical (9:16)" }, { value: "both", label: "Both Canvases" },
        ]} />
      </Field>
      <Field label="State">
        <Select value={opts.state} onChange={(v) => patch({ state: v })} options={[
          { value: "visible", label: "👁 Visible" }, { value: "hidden", label: "🚫 Hidden" }, { value: "toggle", label: "🔄 Toggle" },
        ]} />
      </Field>
    </>;
  }

  if (opts.kind === "obs_switch_scene") {
    return <>
      <Field label="Scene Name"><TextInput value={opts.sceneName} onChange={(v) => patch({ sceneName: v })} placeholder="Gaming Vertical" /></Field>
      <Field label="Canvas">
        <Select value={opts.canvas} onChange={(v) => patch({ canvas: v })} options={[
          { value: "main", label: "Main (Horizontal)" }, { value: "vertical", label: "Aitum Vertical (9:16)" }, { value: "both", label: "Both Canvases" },
        ]} />
      </Field>
      <Field label="Target">
        <Select value={opts.target} onChange={(v) => patch({ target: v })} options={[
          { value: "program", label: "Program (Live)" }, { value: "preview", label: "Preview (Studio Mode)" },
        ]} />
      </Field>
    </>;
  }

  if (opts.kind === "obs_set_text") {
    return <>
      <Field label="Scene Name"><TextInput value={opts.sceneName} onChange={(v) => patch({ sceneName: v })} placeholder="Game" /></Field>
      <Field label="Text Source Name"><TextInput value={opts.sourceName} onChange={(v) => patch({ sourceName: v })} placeholder="Sub Text" /></Field>
      <Field label="Text Content (supports %vars%)">
        <textarea value={opts.text} onChange={(e) => patch({ text: e.target.value })} rows={3}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          placeholder="Last Sub: %user% (%tier%)" />
      </Field>
    </>;
  }

  if (opts.kind === "obs_media_control") {
    return <>
      <Field label="Media Source Name"><TextInput value={opts.sourceName} onChange={(v) => patch({ sourceName: v })} placeholder="Intro Video" /></Field>
      <Field label="Action">
        <Select value={opts.action} onChange={(v) => patch({ action: v })} options={[
          { value: "play", label: "▶ Play" }, { value: "pause", label: "⏸ Pause" },
          { value: "restart", label: "⟳ Restart" }, { value: "stop", label: "⏹ Stop" },
        ]} />
      </Field>
    </>;
  }

  if (opts.kind === "obs_audio_control") {
    return <>
      <Field label="Audio Source Name"><TextInput value={opts.sourceName} onChange={(v) => patch({ sourceName: v })} placeholder="Desktop Audio" /></Field>
      <Field label="Mode">
        <Select value={opts.mode} onChange={(v) => patch({ mode: v })} options={[
          { value: "volume_db", label: "Set Volume (dB)" }, { value: "volume_mul", label: "Set Volume (Multiplier)" },
          { value: "mute", label: "🔇 Mute" }, { value: "unmute", label: "🔊 Unmute" },
        ]} />
      </Field>
      {(opts.mode === "volume_db" || opts.mode === "volume_mul") && (
        <Field label={opts.mode === "volume_db" ? "Volume (dB, e.g. -6)" : "Multiplier (e.g. 0.5)"}>
          <NumberInput value={opts.value ?? 0} onChange={(v) => patch({ value: v })} />
        </Field>
      )}
    </>;
  }

  if (opts.kind === "play_audio") {
    return <>
      <Field label="Audio Source (path or URL)"><TextInput value={opts.src} onChange={(v) => patch({ src: v })} placeholder="/media/alert.mp3" /></Field>
      <Field label={`Volume: ${opts.volume}%`}>
        <input type="range" min={0} max={100} value={opts.volume} onChange={(e) => patch({ volume: Number(e.target.value) })} className="w-full accent-violet-500" />
      </Field>
      <Field label="Playback Target">
        <Select value={opts.target} onChange={(v) => patch({ target: v })} options={[
          { value: "overlay", label: "Browser Source Overlay" }, { value: "desktop", label: "Local Desktop (Web Audio)" },
        ]} />
      </Field>
    </>;
  }

  if (opts.kind === "display_visual") {
    return <>
      <Field label="Visual Source (path or URL)"><TextInput value={opts.src} onChange={(v) => patch({ src: v })} placeholder="/media/alert.gif" /></Field>
      <Field label="Display Duration (ms)"><NumberInput value={opts.durationMs} onChange={(v) => patch({ durationMs: v })} min={500} /></Field>
      <Field label="Entrance Animation">
        <Select value={opts.animation} onChange={(v) => patch({ animation: v })} options={[
          { value: "none", label: "None" }, { value: "bounce", label: "🏀 Bounce" }, { value: "zoom", label: "🔭 Zoom" },
          { value: "fade", label: "✨ Fade" }, { value: "slide_top", label: "⬇ Slide from Top" },
          { value: "slide_bottom", label: "⬆ Slide from Bottom" }, { value: "shake", label: "💥 Shake" },
        ]} />
      </Field>
      <Field label="Position">
        <Select value={opts.position} onChange={(v) => patch({ position: v })} options={[
          { value: "top_left", label: "↖ Top Left" }, { value: "top_center", label: "⬆ Top Center" }, { value: "top_right", label: "↗ Top Right" },
          { value: "center_left", label: "◀ Center Left" }, { value: "center", label: "⊙ Center" }, { value: "center_right", label: "▶ Center Right" },
          { value: "bottom_left", label: "↙ Bottom Left" }, { value: "bottom_center", label: "⬇ Bottom Center" }, { value: "bottom_right", label: "↘ Bottom Right" },
        ]} />
      </Field>
      <label className="flex items-center gap-2 cursor-pointer">
        <Toggle value={opts.bannerEnabled} onChange={(v: boolean) => patch({ bannerEnabled: v })} />
        <span className="text-sm text-white/70">Show Banner Text</span>
      </label>
      {opts.bannerEnabled && (
        <Field label="Banner Text (supports %vars%)"><TextInput value={opts.bannerText} onChange={(v) => patch({ bannerText: v })} placeholder="%user% redeemed %reward%!" /></Field>
      )}
    </>;
  }

  if (opts.kind === "http_request") {
    return <>
      <Field label="Method">
        <Select value={opts.method} onChange={(v) => patch({ method: v })} options={[
          { value: "GET", label: "GET" }, { value: "POST", label: "POST" }, { value: "PUT", label: "PUT" },
          { value: "DELETE", label: "DELETE" }, { value: "PATCH", label: "PATCH" },
        ]} />
      </Field>
      <Field label="URL (supports %vars%)"><TextInput value={opts.url} onChange={(v) => patch({ url: v })} placeholder="https://api.example.com/endpoint" /></Field>
      <Field label="Request Body (JSON, supports %vars%)">
        <textarea value={opts.body} onChange={(e) => patch({ body: e.target.value })} rows={4}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          placeholder='{"user": "%user%", "action": "trigger"}' />
      </Field>
      <Field label="Response Variable Prefix"><TextInput value={opts.responseVar} onChange={(v) => patch({ responseVar: v })} placeholder="http_result" /></Field>
    </>;
  }

  if (opts.kind === "discord_webhook") {
    return <>
      <Field label="Webhook URL"><TextInput value={opts.webhookUrl} onChange={(v) => patch({ webhookUrl: v })} placeholder="https://discord.com/api/webhooks/..." /></Field>
      <Field label="Embed Title (supports %vars%)"><TextInput value={opts.title} onChange={(v) => patch({ title: v })} placeholder="%user% just subscribed!" /></Field>
      <Field label="Description (supports %vars%)">
        <textarea value={opts.description} onChange={(e) => patch({ description: e.target.value })} rows={3}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          placeholder="A new subscriber! Tier: %tier%" />
      </Field>
      <Field label="Embed Color (hex)">
        <div className="flex gap-2">
          <TextInput value={opts.color} onChange={(v) => patch({ color: v })} placeholder="#9146FF" />
          <input type="color" value={opts.color} onChange={(e) => patch({ color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-white/10 bg-transparent p-0.5" />
        </div>
      </Field>
      <Field label="Author Name (supports %vars%)"><TextInput value={opts.authorName} onChange={(v) => patch({ authorName: v })} placeholder="%user%" /></Field>
      <Field label="Thumbnail URL"><TextInput value={opts.thumbnailUrl} onChange={(v) => patch({ thumbnailUrl: v })} placeholder="https://..." /></Field>
    </>;
  }

  return <div className="text-white/40 text-sm">No configuration needed.</div>;
}
