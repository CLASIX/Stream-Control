/**
 * Clips helper module.
 *
 * - Mark moments with stream-relative timestamps (works without Twitch API)
 * - Create real Twitch clips via Helix (clips:edit OAuth)
 * - Save OBS replay buffer (instant local clip if replay is running)
 * - Post clip / moment links to Discord via webhook
 * - streamer.bot can call create_clip / mark_moment via the Bridge
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { useObs } from "../hooks/useObs";
import { getStreamLengthTimecode } from "../lib/obsClient";
import type { Tab } from "../types";
import { FreeformBoard, type FreeformBoardItem } from "../components/FreeformBoard";
import { applyOrder } from "../lib/reorder";
import { HotkeyControl } from "../components/HotkeyControl";
import {
  createTwitchClip,
  listRecentClips,
  pollTwitchDeviceLogin,
  publicClipUrl,
  resolveBroadcasterId,
  startTwitchDeviceLogin,
  waitForClip,
  type DeviceCodeSession,
  type TwitchClip,
  type TwitchClipTokens,
} from "../lib/twitchClips";

const TOKENS_KEY = "sc:twitch-clips:tokens";
const JUST_CONNECTED_KEY = "sc:twitch-clips:just-connected";
const MOMENTS_KEY = "sc:clip-moments:v1";

export interface ClipMoment {
  id: string;
  note: string;
  at: number; // Date.now()
  streamTimecode: string;
  obsStreaming: boolean;
  source: "manual" | "bridge" | "hotkey";
}

function ClipsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
    </svg>
  );
}

function ScissorsClipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.5 7.5 20 18M20 6 8.5 16.5" strokeLinecap="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 3.5h11l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 19V5a1.5 1.5 0 0 1 1.5-1.5z" strokeLinejoin="round" />
      <path d="M8 3.5v5h7v-5M7 20v-6h10v6" strokeLinejoin="round" />
    </svg>
  );
}

function loadTokens(): TwitchClipTokens | null {
  try {
    const just = localStorage.getItem(JUST_CONNECTED_KEY);
    if (just) {
      localStorage.removeItem(JUST_CONNECTED_KEY);
      localStorage.setItem(TOKENS_KEY, just);
      return JSON.parse(just) as TwitchClipTokens;
    }
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as TwitchClipTokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: TwitchClipTokens | null) {
  try {
    if (!t) localStorage.removeItem(TOKENS_KEY);
    else localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

function loadMoments(): ClipMoment[] {
  try {
    const raw = localStorage.getItem(MOMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMoments(m: ClipMoment[]) {
  try {
    localStorage.setItem(MOMENTS_KEY, JSON.stringify(m.slice(0, 100)));
  } catch {
    /* ignore */
  }
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function cleanTimecode(tc: string): string {
  return (tc.split(".")[0] || tc || "00:00:00").trim();
}

function ClipsModule() {
  const { settings, update } = useStore();
  const { status, state, connect, actions } = useObs();
  const [tokens, setTokens] = useState<TwitchClipTokens | null>(() => loadTokens());
  const [moments, setMoments] = useState<ClipMoment[]>(() => loadMoments());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [recent, setRecent] = useState<TwitchClip[]>([]);
  const [lastClip, setLastClip] = useState<{
    id: string;
    url: string;
    editUrl: string;
    title?: string;
    thumb?: string;
  } | null>(null);
  const [deviceSession, setDeviceSession] = useState<DeviceCodeSession | null>(
    null
  );
  const [, setDeviceSecondsLeft] = useState(0);
  const [devicePolling, setDevicePolling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Quiet OBS connect so replay buffer / timecode work
  useEffect(() => {
    if (status === "idle") {
      connect(settings.obsHost, settings.obsPort, settings.obsPassword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const onMomentCreated = (event: Event) => {
      const moment = (event as CustomEvent<ClipMoment>).detail;
      if (!moment?.id) return;
      setMoments((previous) =>
        previous.some((item) => item.id === moment.id)
          ? previous
          : [moment, ...previous].slice(0, 100)
      );
    };
    window.addEventListener("sc:moment-created", onMomentCreated);
    return () => window.removeEventListener("sc:moment-created", onMomentCreated);
  }, []);

  const persistTokens = useCallback((t: TwitchClipTokens | null) => {
    setTokens(t);
    saveTokens(t);
    window.dispatchEvent(new Event("sc:twitch-chat-auth-changed"));
    if (t?.refresh) {
      update({
        twitchClipsRefreshToken: t.refresh,
        twitchClipsUserLogin: t.login || "",
      });
    }
  }, [update]);

  const addMoment = useCallback(
    (source: ClipMoment["source"] = "manual", momentNote = "") => {
      const timecode = getStreamLengthTimecode(state);
      const m: ClipMoment = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        note: (momentNote || note).trim() || "Clip that",
        at: Date.now(),
        streamTimecode: timecode,
        obsStreaming: state.streaming.active,
        source,
      };
      setMoments((prev) => {
        const next = [m, ...prev].slice(0, 100);
        saveMoments(next);
        return next;
      });
      setNote("");
      setNotice({
        kind: "success",
        text: `Moment marked at ${m.streamTimecode}${
          m.obsStreaming ? " (stream time)" : " (local time — stream not active in OBS)"
        }`,
      });
      return m;
    },
    [note, state.streaming.timecode, state.streaming.active]
  );

  const removeMoment = (id: string) => {
    setMoments((prev) => {
      const next = prev.filter((m) => m.id !== id);
      saveMoments(next);
      return next;
    });
  };

  const connectTwitch = async () => {
    try {
      if (!settings.twitchClipsClientId.trim()) {
        setNotice({
          kind: "error",
          text: "Paste a Twitch Client ID first (dev.twitch.tv → your app).",
        });
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setDevicePolling(true);
      setNotice({
        kind: "info",
        text: "Starting Twitch device login (no HTTPS redirect needed)…",
      });

      const session = await startTwitchDeviceLogin(settings.twitchClipsClientId);
      setDeviceSession(session);
      setDeviceSecondsLeft(
        Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))
      );

      // Open activate page for the user
      const openUrl =
        session.verificationUriComplete || session.verificationUri;
      window.open(openUrl, "_blank", "noopener,noreferrer");

      setNotice({
        kind: "info",
        text: `Enter code ${session.userCode} on Twitch if the page doesn’t show it automatically.`,
      });

      const tokens = await pollTwitchDeviceLogin(session, {
        signal: ac.signal,
        onTick: setDeviceSecondsLeft,
      });

      persistTokens(tokens);
      setDeviceSession(null);
      setDevicePolling(false);
      setNotice({
        kind: "success",
        text: `Connected as ${tokens.displayName || tokens.login || "Twitch user"}.`,
      });
    } catch (e) {
      setDevicePolling(false);
      if (e instanceof Error && e.message === "Login cancelled") {
        setNotice({ kind: "info", text: "Login cancelled." });
        return;
      }
      setNotice({
        kind: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const cancelDeviceLogin = () => {
    abortRef.current?.abort();
    setDeviceSession(null);
    setDevicePolling(false);
    setNotice({ kind: "info", text: "Login cancelled." });
  };

  const disconnectTwitch = () => {
    persistTokens(null);
    setRecent([]);
    setLastClip(null);
    update({ twitchClipsRefreshToken: "", twitchClipsUserLogin: "" });
    setNotice({ kind: "info", text: "Twitch clips disconnected." });
  };

  const createClip = async () => {
    if (!tokens) {
      setNotice({ kind: "error", text: "Connect Twitch first to create clips." });
      return;
    }
    const clientId = settings.twitchClipsClientId.trim();
    const channel = settings.twitchChannel.trim();
    if (!clientId || !channel) {
      setNotice({
        kind: "error",
        text: "Need Twitch Client ID + channel name (set channel in Chat Overlay).",
      });
      return;
    }

    setBusy(true);
    setNotice({ kind: "info", text: "Creating clip… (Twitch may take a few seconds)" });
    try {
      const resolved = await resolveBroadcasterId(clientId, tokens, channel);
      let t = resolved.tokens;
      const created = await createTwitchClip(
        clientId,
        t,
        resolved.broadcasterId,
        settings.clipsHasDelay
      );
      t = created.tokens;
      persistTokens(t);

      const waited = await waitForClip(clientId, t, created.id);
      t = waited.tokens;
      persistTokens(t);

      const clipUrl = publicClipUrl(created.id);
      const clip = waited.clip;
      setLastClip({
        id: created.id,
        url: clip?.url || clipUrl,
        editUrl: created.editUrl,
        title: clip?.title,
        thumb: clip?.thumbnail_url,
      });

      // Auto-mark a moment too
      addMoment("manual", note || clip?.title || "Twitch clip");

      if (settings.clipsAutoPostDiscord && settings.clipsDiscordWebhookUrl) {
        await postDiscordClip(
          settings.clipsDiscordWebhookUrl,
          clip?.url || clipUrl,
          clip?.title || "New clip",
          clip?.thumbnail_url,
          settings.clipsDiscordMessage
        );
      }

      setNotice({
        kind: "success",
        text: waited.clip
          ? "Clip created and ready."
          : "Clip requested — it may still be processing. Open the edit link in a few seconds.",
      });

      // Refresh recent list
      void refreshRecent(t);
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const refreshRecent = async (tok?: TwitchClipTokens) => {
    const t0 = tok || tokens;
    if (!t0 || !settings.twitchClipsClientId.trim() || !settings.twitchChannel.trim())
      return;
    try {
      const resolved = await resolveBroadcasterId(
        settings.twitchClipsClientId.trim(),
        t0,
        settings.twitchChannel.trim()
      );
      const listed = await listRecentClips(
        settings.twitchClipsClientId.trim(),
        resolved.tokens,
        resolved.broadcasterId,
        10
      );
      persistTokens(listed.tokens);
      setRecent(listed.clips);
    } catch {
      /* ignore list errors */
    }
  };

  useEffect(() => {
    if (tokens && settings.twitchClipsClientId && settings.twitchChannel) {
      void refreshRecent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens?.access, settings.twitchChannel]);

  const saveReplay = () => {
    if (status !== "connected") {
      setNotice({
        kind: "error",
        text: "Connect OBS first (OBS Dashboard tab).",
      });
      return;
    }
    if (!state.replayBuffer) {
      setNotice({
        kind: "error",
        text: "Replay Buffer is off in OBS. Start it in OBS (or enable via OBS) then try again.",
      });
      return;
    }
    actions.saveReplayBuffer();
    addMoment("manual", note || "OBS replay saved");
    setNotice({
      kind: "success",
      text: "OBS Replay Buffer save requested — check your OBS recordings folder.",
    });
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ kind: "success", text: `${label} copied.` });
    } catch {
      setNotice({ kind: "error", text: "Could not copy to clipboard." });
    }
  };

  const editMode = settings.editMode;
  const obsStreaming = state.streaming.active;

  const clipCards: { id: string; title: string; node: ReactNode }[] = [
    {
      id: "actions",
      title: "Actions",
      node: (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
          <label className="block text-xs text-white/65">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. insane 1v3 / funny fail"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-[#9146FF]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addMoment("manual");
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-center transition-colors hover:bg-white/[0.09]">
              <button
                onClick={() => addMoment("manual")}
                className="flex w-full flex-col items-center gap-2"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80">
                  <BookmarkIcon />
                </span>
                <span className="text-sm font-bold text-white">Mark moment</span>
              </button>
              <HotkeyControl
                label="Mark moment"
                value={settings.momentHotkey}
                onChange={(v) => update({ momentHotkey: v })}
              />
            </div>

            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-[#9146FF]/25 bg-[#9146FF]/10 p-4 text-center transition-colors hover:bg-[#9146FF]/15">
              <button
                onClick={() => void createClip()}
                disabled={busy || !tokens}
                className="flex w-full flex-col items-center gap-2 disabled:opacity-40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#9146FF]/25 text-[#c9a8ff]">
                  <ScissorsClipIcon />
                </span>
                <span className="text-sm font-bold text-white">
                  {busy ? "Clipping…" : "Create Twitch clip"}
                </span>
              </button>
              <HotkeyControl
                label="Create clip"
                value={settings.clipHotkey}
                onChange={(v) => update({ clipHotkey: v })}
              />
            </div>

            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center transition-colors hover:bg-emerald-500/15">
              <button
                onClick={saveReplay}
                className="flex w-full flex-col items-center gap-2"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-300">
                  <SaveIcon />
                </span>
                <span className="text-sm font-bold text-white">Save OBS replay</span>
              </button>
              <HotkeyControl
                label="Save replay"
                value={settings.replayHotkey}
                onChange={(v) => update({ replayHotkey: v })}
              />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-white/35">
            <strong className="text-white/55">Mark moment</strong> always works.{" "}
            <strong className="text-white/55">Twitch clip</strong> needs OAuth + live channel.{" "}
            <strong className="text-white/55">OBS replay</strong> needs Replay Buffer running.
            Click a hotkey badge to bind a key — works anywhere in the app except while typing in a field.
          </p>
          {lastClip && (
            <div className="rounded-2xl border border-[#9146FF]/30 bg-[#9146FF]/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#c9a8ff]">
                Last clip
              </p>
              <div className="mt-2 flex gap-3">
                {lastClip.thumb && (
                  <img
                    src={lastClip.thumb}
                    alt=""
                    className="h-16 w-28 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {lastClip.title || lastClip.id}
                  </p>
                  <a
                    href={lastClip.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-xs text-[#c9a8ff] hover:underline"
                  >
                    {lastClip.url}
                  </a>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => void copyText(lastClip.url, "Clip URL")}
                      className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80"
                    >
                      Copy link
                    </button>
                    <a
                      href={lastClip.editUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80"
                    >
                      Edit on Twitch
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "moments",
      title: "Moments",
      node: (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
              Moments ({moments.length})
            </h3>
            {moments.length > 0 && (
              <button
                onClick={() => {
                  setMoments([]);
                  saveMoments([]);
                }}
                className="text-[11px] text-white/40 hover:text-red-300"
              >
                Clear all
              </button>
            )}
          </div>
          {moments.length === 0 ? (
            <p className="text-xs text-white/40">
              No moments yet. Hit “Mark moment” when something clip-worthy happens.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {moments.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{m.note}</p>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      <span className="font-mono text-white/60">{m.streamTimecode}</span>
                      {" · "}
                      {fmtTime(m.at)}
                      {m.obsStreaming ? " · live" : " · offline"}
                    </p>
                  </div>
                  <button
                    onClick={() => removeMoment(m.id)}
                    className="shrink-0 text-[11px] text-white/35 hover:text-red-300"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      id: "connection",
      title: "Twitch",
      node: (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
            Twitch connection
          </h3>
          <p className="text-[11px] leading-relaxed text-white/40">
            Client ID is managed in <strong className="text-white/70">Settings</strong>.
            Channel:{" "}
            <span className="font-semibold text-white/70">
              {settings.twitchChannel.trim() || "(set in Settings)"}
            </span>
          </p>
          {deviceSession && (
            <div className="rounded-xl border border-[#9146FF]/30 bg-[#9146FF]/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#c9a8ff]">
                Authorize on Twitch
              </p>
              <p className="mt-2 text-sm text-white/80">
                Code:{" "}
                <span className="font-mono text-2xl font-black tracking-widest text-white">
                  {deviceSession.userCode}
                </span>
              </p>
              <button
                onClick={cancelDeviceLogin}
                className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/70"
              >
                Cancel
              </button>
            </div>
          )}
          {tokens ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <span className="text-xs text-emerald-200">
                Connected as{" "}
                <strong>{tokens.displayName || tokens.login || "Twitch user"}</strong>
              </span>
              <button
                onClick={disconnectTwitch}
                className="text-[11px] font-semibold text-emerald-200/70 hover:text-white"
              >
                Disconnect
              </button>
            </div>
          ) : (
            !deviceSession && (
              <button
                onClick={() => void connectTwitch()}
                disabled={devicePolling}
                className="w-full rounded-xl bg-[#9146FF] py-2.5 text-sm font-bold text-white hover:bg-[#a970ff] disabled:opacity-40"
              >
                Connect Twitch (device code)
              </button>
            )
          )}
          <label className="flex items-center gap-2 text-xs text-white/65">
            <input
              type="checkbox"
              checked={settings.clipsHasDelay}
              onChange={(e) => update({ clipsHasDelay: e.target.checked })}
              className="accent-[#9146FF]"
            />
            Delay capture window slightly
          </label>
        </div>
      ),
    },
    {
      id: "discord",
      title: "Discord",
      node: (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
            Discord share
          </h3>
          <label className="block text-xs text-white/65">
            Webhook URL (optional)
            <input
              value={settings.clipsDiscordWebhookUrl}
              onChange={(e) => update({ clipsDiscordWebhookUrl: e.target.value })}
              placeholder="https://discord.com/api/webhooks/…"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-[#5865F2]"
            />
          </label>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs text-white/65">Message template</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => update({ clipsDiscordMessage: "@everyone Check out this new stream clip: {title}\n{url}" })}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] text-white/60 hover:text-white transition-colors"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => update({ clipsDiscordMessage: "🔥 **INSANE HIGHLIGHT:** {title}\n👉 Watch here: {url}" })}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] text-white/60 hover:text-white transition-colors"
                >
                  Hype
                </button>
              </div>
            </div>
            <textarea
              value={settings.clipsDiscordMessage}
              onChange={(e) => update({ clipsDiscordMessage: e.target.value })}
              placeholder="@everyone Check out this new stream clip: {title}&#10;{url}"
              rows={3}
              className="w-full resize-y rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[#5865F2] transition-colors font-mono"
            />
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Supports <code className="text-white/60">{`{title}`}</code> and <code className="text-white/60">{`{url}`}</code> variables.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.clipsAutoPostDiscord}
                onChange={(e) => update({ clipsAutoPostDiscord: e.target.checked })}
                className="accent-[#5865F2] h-3.5 w-3.5"
              />
              Auto-post new Twitch clips to Discord
            </label>
            <button
              type="button"
              onClick={async () => {
                if (!settings.clipsDiscordWebhookUrl) {
                  setNotice({ kind: "error", text: "Enter a Discord Webhook URL first." });
                  return;
                }
                try {
                  await postDiscordClip(
                    settings.clipsDiscordWebhookUrl,
                    "https://clips.twitch.tv/SampleClipUrl",
                    "Sample Epic Stream Highlight",
                    undefined,
                    settings.clipsDiscordMessage
                  );
                  setNotice({ kind: "success", text: "Test clip message posted to Discord!" });
                } catch (err) {
                  setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold text-xs transition-colors"
            >
              Test Discord Share
            </button>
          </div>
        </div>
      ),
    },
    {
      id: "recent",
      title: "Recent clips",
      node: (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
              Recent channel clips
            </h3>
            <button
              onClick={() => void refreshRecent()}
              disabled={!tokens}
              className="text-[11px] font-semibold text-white/45 hover:text-white disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
          {!tokens ? (
            <p className="text-xs text-white/40">Connect Twitch to load recent clips.</p>
          ) : recent.length === 0 ? (
            <p className="text-xs text-white/40">No recent clips found.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto [scrollbar-width:thin]">
              {recent.map((c) => (
                <li key={c.id} className="flex gap-2 rounded-lg bg-black/25 p-2">
                  <img
                    src={c.thumbnail_url}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{c.title}</p>
                    <button
                      onClick={() => void copyText(c.url, "Clip URL")}
                      className="mt-0.5 text-[10px] text-[#c9a8ff] hover:underline"
                    >
                      Copy link
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
  ];

  const boardItems: FreeformBoardItem[] = applyOrder(
    clipCards,
    settings.clipsModuleOrder || [],
    (c) => c.id
  ).map((c, i) => ({
    id: c.id,
    title: c.title,
    node: c.node,
    defaultW: 380,
    defaultX: (i % 2) * 400,
    defaultY: Math.floor(i / 2) * 300,
  }));

  return (
    <div className="w-full min-w-0">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 pr-[150px] sm:pr-[160px] pt-6">
        <div className="flex items-center gap-3">
          <ClipsIcon />
          <div>
            <h2 className="text-2xl font-bold">Clips</h2>
            <p className="mt-1 text-sm text-white/50">
              Mark moments, create Twitch clips, save OBS replay, share to Discord.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editMode && (
            <span className="rounded-full border border-[#9146FF]/30 bg-[#9146FF]/15 px-3 py-1.5 text-[11px] font-semibold text-[#c9a8ff]">
              Edit mode — drag cards · controls locked
            </span>
          )}
          {obsStreaming && (
            <div className="rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300">
              LIVE · {cleanTimecode(state.streaming.timecode)}
            </div>
          )}
        </div>
      </header>

      {notice && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
              : notice.kind === "error"
                ? "border-red-500/20 bg-red-500/10 text-red-100"
                : "border-white/10 bg-white/5 text-white/70"
          }`}
        >
          {notice.text}
        </div>
      )}

      <FreeformBoard
        items={boardItems}
        layout={settings.clipsBoardLayout || {}}
        onChange={(clipsBoardLayout) => update({ clipsBoardLayout })}
        editMode={editMode}
        minHeight={700}
      />
    </div>
  );
}


async function postDiscordClip(
  webhookUrl: string,
  url: string,
  title: string,
  thumb?: string,
  customMessage?: string
): Promise<void> {
  if (!webhookUrl.includes("/api/webhooks/")) {
    throw new Error("Invalid Discord webhook URL");
  }
  const defaultMsg = `🎬 **${title}**\n${url}`;
  const content = customMessage
    ? customMessage.split("{title}").join(title).split("{url}").join(url)
    : defaultMsg;

  const body = {
    content,
    embeds: thumb
      ? [
          {
            title,
            url,
            color: 0x9146ff,
            image: { url: thumb },
            footer: { text: "Stream Control · Clips" },
          },
        ]
      : undefined,
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Discord post failed (${res.status})`);
  }
}

export const clipsTab: Tab = {
  id: "clips",
  name: "Clips",
  icon: <ClipsIcon />,
  description: "Mark moments, create Twitch clips, save OBS replay.",
  Component: ClipsModule,
};

export const clipsModule = clipsTab;

// Expose moment helpers for bridge host via window custom event bus
if (typeof window !== "undefined") {
  window.addEventListener("sc:mark-moment", ((e: CustomEvent<{ note?: string }>) => {
    try {
      const note = e.detail?.note || "Clip that";
      const raw = localStorage.getItem(MOMENTS_KEY);
      const prev: ClipMoment[] = raw ? JSON.parse(raw) : [];
      const m: ClipMoment = {
        id: `m-${Date.now()}-bridge`,
        note,
        at: Date.now(),
        streamTimecode: "—",
        obsStreaming: false,
        source: "bridge",
      };
      localStorage.setItem(MOMENTS_KEY, JSON.stringify([m, ...prev].slice(0, 100)));
    } catch {
      /* ignore */
    }
  }) as EventListener);
}
