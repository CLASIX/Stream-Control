/**
 * streamer.bot bridge documentation + local API key settings.
 *
 * The HTTP endpoints live on the Electron desktop server (port 8080).
 * streamer.bot (or any tool) POSTs JSON actions; BridgeHost executes them.
 */
import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { Tab } from "../types";

function BridgeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 12h8" />
      <path d="M12 8v8" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

const ACTIONS: { action: string; desc: string; body?: string }[] = [
  { action: "ping", desc: "Health check", body: '{"action":"ping"}' },
  { action: "status", desc: "OBS + stream status snapshot", body: '{"action":"status"}' },
  {
    action: "set_scene",
    desc: "Switch OBS program scene",
    body: '{"action":"set_scene","params":{"scene":"Starting Soon"}}',
  },
  { action: "start_stream", desc: "Start OBS stream", body: '{"action":"start_stream"}' },
  { action: "stop_stream", desc: "Stop OBS stream", body: '{"action":"stop_stream"}' },
  { action: "start_record", desc: "Start OBS recording", body: '{"action":"start_record"}' },
  { action: "stop_record", desc: "Stop OBS recording", body: '{"action":"stop_record"}' },
  {
    action: "mute",
    desc: "Mute / unmute an audio input",
    body: '{"action":"mute","params":{"input":"Mic/Aux","muted":true}}',
  },
  {
    action: "set_volume",
    desc: "Set input volume in dB",
    body: '{"action":"set_volume","params":{"input":"Desktop Audio","db":-6}}',
  },
  {
    action: "toggle_source",
    desc: "Enable/disable a scene item by id",
    body: '{"action":"toggle_source","params":{"sceneItemId":3,"enabled":false}}',
  },
  {
    action: "go_live",
    desc: "Run the full Go Live sequence (same as the Go Live button)",
    body: '{"action":"go_live"}',
  },
  {
    action: "end_stream",
    desc: "Run the full End Stream sequence",
    body: '{"action":"end_stream"}',
  },
  {
    action: "enable_webhooks",
    desc: "Enable all Discord live webhooks",
    body: '{"action":"enable_webhooks"}',
  },
  {
    action: "disable_webhooks",
    desc: "Disable all Discord live webhooks",
    body: '{"action":"disable_webhooks"}',
  },
  {
    action: "mark_moment",
    desc: "Log a clip moment with note + stream timecode",
    body: '{"action":"mark_moment","params":{"note":"insane play"}}',
  },
  {
    action: "create_clip",
    desc: "Create a Twitch clip (requires Clips OAuth)",
    body: '{"action":"create_clip"}',
  },
  {
    action: "save_replay",
    desc: "Save OBS Replay Buffer",
    body: '{"action":"save_replay"}',
  },
];

function BridgeModule() {
  const { settings, update } = useStore();
  const isDesktop = Boolean(window.streamControl?.isDesktop);
  const [copied, setCopied] = useState<string | null>(null);

  const base = useMemo(() => {
    // Desktop app always serves on 8080; browser-dev may differ
    if (isDesktop || window.location.port === "8080") {
      return "http://127.0.0.1:8080";
    }
    return window.location.origin;
  }, [isDesktop]);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const curlExample = `curl -X POST ${base}/api/bridge/action \\\n  -H "Content-Type: application/json" \\\n  -H "X-Stream-Control-Key: ${settings.bridgeApiKey || "YOUR_KEY"}" \\\n  -d "{\\"action\\":\\"go_live\\"}"`;

  return (
    <div className="max-w-4xl">
      <header className="mb-4">
        <h2 className="text-2xl font-bold">streamer.bot Bridge</h2>
        <p className="mt-1 text-sm text-white/50">
          Local HTTP API so streamer.bot (alerts & commands) can drive Stream Control
          (OBS, Go Live, webhooks) without duplicating chat logic.
        </p>
      </header>

      {!isDesktop && (
        <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100/80">
          Bridge HTTP endpoints are served by the desktop app on port 8080. Launch Stream Control
          with the EXE / BAT for streamer.bot to reach them.
        </div>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
            Endpoints
          </h3>
          <div className="space-y-2 text-xs">
            <div className="rounded-lg bg-black/30 px-3 py-2 font-mono text-white/70">
              GET {base}/api/bridge/health
            </div>
            <div className="rounded-lg bg-black/30 px-3 py-2 font-mono text-white/70">
              GET {base}/api/bridge/actions
            </div>
            <div className="rounded-lg bg-black/30 px-3 py-2 font-mono text-white/70">
              POST {base}/api/bridge/action
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-white/40">
            Body:{" "}
            <code className="text-white/60">{`{"{ action, params? }"}`}</code>. Optional header{" "}
            <code className="text-white/60">X-Stream-Control-Key</code> or{" "}
            <code className="text-white/60">?key=</code>.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
            Security
          </h3>
          <label className="block text-xs text-white/65">
            API key (optional)
            <input
              value={settings.bridgeApiKey}
              onChange={(e) => update({ bridgeApiKey: e.target.value })}
              placeholder="leave blank if allow-unauthed is on"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#5865F2]"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={settings.bridgeAllowUnauthed}
              onChange={(e) => update({ bridgeAllowUnauthed: e.target.checked })}
              className="accent-[#5865F2]"
            />
            Allow unauthenticated local requests
          </label>
          <p className="text-[11px] leading-relaxed text-white/35">
            The server only binds to 127.0.0.1. Still set a key if other local apps share your PC.
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
            streamer.bot setup
          </h3>
        </div>
        <ol className="space-y-2 text-xs leading-relaxed text-white/55">
          <li>
            1. In streamer.bot, add an action (e.g. on stream start, or a chat command you already
            use for production — not public chat spam).
          </li>
          <li>
            2. Add a <strong className="text-white/75">C#</strong> or{" "}
            <strong className="text-white/75">HTTP</strong> sub-action that POSTs to{" "}
            <code className="text-white/70">{base}/api/bridge/action</code>.
          </li>
          <li>
            3. JSON body example:{" "}
            <code className="text-white/70">{`{"{ \"action\": \"go_live\" }"}`}</code>
          </li>
          <li>
            4. Keep alerts & chat commands in streamer.bot. Use this bridge only for OBS / Go Live /
            webhooks.
          </li>
        </ol>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-white/60">
          {curlExample}
        </pre>
        <button
          onClick={() => void copy(curlExample, "curl")}
          className="mt-2 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/12"
        >
          {copied === "curl" ? "Copied" : "Copy curl example"}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/55">
          Available actions
        </h3>
        <div className="space-y-2">
          {ACTIONS.map((a) => (
            <div
              key={a.action}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-[#b8c0ff]">{a.action}</p>
                <p className="mt-0.5 text-[11px] text-white/45">{a.desc}</p>
              </div>
              {a.body && (
                <button
                  onClick={() => void copy(a.body!, a.action)}
                  className="shrink-0 rounded-lg bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/60 hover:bg-white/12"
                >
                  {copied === a.action ? "Copied" : "Copy JSON"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const bridgeTab: Tab = {
  id: "bridge",
  name: "Bridge",
  icon: <BridgeIcon />,
  description: "streamer.bot HTTP bridge for OBS and Go Live.",
  Component: BridgeModule,
};

export const bridgeModule = bridgeTab;
