/**
 * Always-mounted host that receives streamer.bot bridge actions from the
 * Electron main process (HTTP → IPC) and executes them against OBS / webhooks.
 */
import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { useObs } from "../hooks/useObs";
import { getStreamLengthTimecode } from "../lib/obsClient";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function BridgeHost() {
  const { settings } = useStore();
  const { status, state, connect, actions } = useObs();
  const settingsRef = useRef(settings);
  const statusRef = useRef(status);
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);

  settingsRef.current = settings;
  statusRef.current = status;
  stateRef.current = state;
  actionsRef.current = actions;

  // Keep OBS connected for bridge actions when auto-connect is on
  useEffect(() => {
    if (settings.obsAutoConnect && status === "idle") {
      connect(settings.obsHost, settings.obsPort, settings.obsPassword);
    }
  }, [
    settings.obsAutoConnect,
    settings.obsHost,
    settings.obsPort,
    settings.obsPassword,
    status,
    connect,
  ]);

  // Sync bridge auth settings to main process
  useEffect(() => {
    const bridge = window.streamControl?.bridge;
    if (!bridge?.setConfig) return;
    void bridge.setConfig({
      apiKey: settings.bridgeApiKey,
      allowUnauthed: settings.bridgeAllowUnauthed,
    });
  }, [settings.bridgeApiKey, settings.bridgeAllowUnauthed]);

  // Electron owns these registrations, so they remain active while another
  // tab or a fullscreen game has focus. The actions still run through this
  // always-mounted host rather than depending on the Clips tab.
  useEffect(() => {
    const hotkeys = window.streamControl?.hotkeys;
    if (!hotkeys?.configure) return;
    const bindings = [
      { accelerator: settings.momentHotkey, action: "mark_moment" },
      { accelerator: settings.clipHotkey, action: "create_clip" },
      { accelerator: settings.replayHotkey, action: "save_replay" },
    ].filter((binding) => binding.accelerator.trim());
    void hotkeys.configure(bindings);
  }, [settings.momentHotkey, settings.clipHotkey, settings.replayHotkey]);

  useEffect(() => {
    const bridge = window.streamControl?.bridge;
    if (!bridge?.onAction) return;

    return bridge.onAction(async (request) => {
      const s = settingsRef.current;
      const a = actionsRef.current;
      const st = statusRef.current;
      const api = window.streamControl;

      const ensureObs = async () => {
        if (st === "connected") return;
        connect(s.obsHost, s.obsPort, s.obsPassword);
        // Wait briefly for connection
        for (let i = 0; i < 20; i++) {
          await sleep(150);
          if (statusRef.current === "connected") return;
        }
        throw new Error("OBS not connected");
      };

      try {
        const action = String(request.action || "").toLowerCase();
        const params = (request.params || {}) as Record<string, unknown>;

        switch (action) {
          case "ping":
            return {
              ok: true,
              result: { pong: true, at: new Date().toISOString() },
            };

          case "status":
            return {
              ok: true,
              result: {
                obs: statusRef.current,
                streaming: stateRef.current.streaming.active,
                recording: stateRef.current.recording.active,
                scene: stateRef.current.currentScene,
                scenes: stateRef.current.scenes,
              },
            };

          case "set_scene":
          case "scene": {
            await ensureObs();
            const name = String(params.scene || params.name || "").trim();
            if (!name) throw new Error("Missing params.scene");
            a.setScene(name);
            return { ok: true, result: { scene: name } };
          }

          case "start_stream":
            await ensureObs();
            a.startStream();
            return { ok: true, result: { streaming: true } };

          case "stop_stream":
            await ensureObs();
            a.stopStream();
            return { ok: true, result: { streaming: false } };

          case "start_record":
            await ensureObs();
            a.startRecord();
            return { ok: true, result: { recording: true } };

          case "stop_record":
            await ensureObs();
            a.stopRecord();
            return { ok: true, result: { recording: false } };

          case "mute":
          case "set_mute": {
            await ensureObs();
            const input = String(params.input || params.name || "").trim();
            if (!input) throw new Error("Missing params.input");
            const muted =
              params.muted === undefined ? true : Boolean(params.muted);
            a.setMute(input, muted);
            return { ok: true, result: { input, muted } };
          }

          case "set_volume": {
            await ensureObs();
            const input = String(params.input || params.name || "").trim();
            if (!input) throw new Error("Missing params.input");
            const db = Number(params.db ?? params.volumeDb);
            if (!Number.isFinite(db)) throw new Error("Missing params.db");
            a.setVolume(input, db);
            return { ok: true, result: { input, db } };
          }

          case "toggle_source": {
            await ensureObs();
            const id = Number(params.sceneItemId ?? params.id);
            if (!Number.isFinite(id))
              throw new Error("Missing params.sceneItemId");
            const enabled = Boolean(params.enabled);
            a.toggleSceneItem(id, enabled);
            return { ok: true, result: { sceneItemId: id, enabled } };
          }

          case "go_live": {
            await ensureObs();
            const delay = Math.max(0, s.goLiveStepDelayMs || 0);
            const done: string[] = [];
            if (s.goLiveScene.trim()) {
              a.setScene(s.goLiveScene.trim());
              done.push(`scene:${s.goLiveScene.trim()}`);
              if (delay) await sleep(delay);
            }
            if (s.goLiveStartStream) {
              a.startStream();
              done.push("start_stream");
              if (delay) await sleep(delay);
            }
            if (s.goLiveStartRecord) {
              a.startRecord();
              done.push("start_record");
              if (delay) await sleep(delay);
            }
            if (s.goLiveEnableWebhooks && api?.webhooks) {
              const list = await api.webhooks.list();
              for (const wh of list) {
                if (!wh.enabled) await api.webhooks.save({ ...wh, enabled: true });
              }
              done.push("enable_webhooks");
            }
            return { ok: true, result: { steps: done } };
          }

          case "end_stream": {
            await ensureObs();
            const delay = Math.max(0, s.goLiveStepDelayMs || 0);
            const done: string[] = [];
            if (s.goLiveEndScene.trim()) {
              a.setScene(s.goLiveEndScene.trim());
              done.push(`scene:${s.goLiveEndScene.trim()}`);
              if (delay) await sleep(delay);
            }
            if (s.goLiveStopStream) {
              a.stopStream();
              done.push("stop_stream");
              if (delay) await sleep(delay);
            }
            if (s.goLiveStopRecord) {
              a.stopRecord();
              done.push("stop_record");
            }
            return { ok: true, result: { steps: done } };
          }

          case "enable_webhooks": {
            if (!api?.webhooks) throw new Error("Webhooks API unavailable");
            const list = await api.webhooks.list();
            let n = 0;
            for (const wh of list) {
              if (!wh.enabled) {
                await api.webhooks.save({ ...wh, enabled: true });
                n += 1;
              }
            }
            return { ok: true, result: { enabled: n } };
          }

          case "disable_webhooks": {
            if (!api?.webhooks) throw new Error("Webhooks API unavailable");
            const list = await api.webhooks.list();
            let n = 0;
            for (const wh of list) {
              if (wh.enabled) {
                await api.webhooks.save({ ...wh, enabled: false });
                n += 1;
              }
            }
            return { ok: true, result: { disabled: n } };
          }

          case "mark_moment": {
            const note = String(params.note || params.text || "Clip that").trim();
            try {
              const MOMENTS_KEY = "sc:clip-moments:v1";
              const raw = localStorage.getItem(MOMENTS_KEY);
              const prev = raw ? JSON.parse(raw) : [];
              const timecode = getStreamLengthTimecode(stateRef.current);
              const m = {
                id: `m-${Date.now()}-bridge`,
                note,
                at: Date.now(),
                streamTimecode: timecode,
                obsStreaming: stateRef.current.streaming.active,
                source: "bridge",
              };
              const next = [m, ...(Array.isArray(prev) ? prev : [])].slice(0, 100);
              localStorage.setItem(MOMENTS_KEY, JSON.stringify(next));
              window.dispatchEvent(new CustomEvent("sc:moment-created", { detail: m }));
              return { ok: true, result: m };
            } catch (e) {
              return {
                ok: true,
                result: { note, warned: "moment stored via event only" },
              };
            }
          }

          case "create_clip": {
            // Dynamic import-free: use stored tokens + settings from localStorage / store
            const clientId = s.twitchClipsClientId?.trim();
            const channel = s.twitchChannel?.trim();
            if (!clientId) throw new Error("Twitch Clips Client ID not set");
            if (!channel) throw new Error("Twitch channel not set (Chat Overlay)");

            let tokensRaw: string | null = null;
            try {
              tokensRaw = localStorage.getItem("sc:twitch-clips:tokens");
            } catch {
              /* ignore */
            }
            if (!tokensRaw) throw new Error("Twitch clips not connected — open Clips tab");
            const tokens = JSON.parse(tokensRaw);

            const { createTwitchClip, resolveBroadcasterId, publicClipUrl, waitForClip } =
              await import("../lib/twitchClips");

            const resolved = await resolveBroadcasterId(clientId, tokens, channel);
            const created = await createTwitchClip(
              clientId,
              resolved.tokens,
              resolved.broadcasterId,
              Boolean(s.clipsHasDelay)
            );
            try {
              localStorage.setItem(
                "sc:twitch-clips:tokens",
                JSON.stringify(created.tokens)
              );
            } catch {
              /* ignore */
            }
            const waited = await waitForClip(clientId, created.tokens, created.id, 6, 1200);
            try {
              localStorage.setItem(
                "sc:twitch-clips:tokens",
                JSON.stringify(waited.tokens)
              );
            } catch {
              /* ignore */
            }
            const url = waited.clip?.url || publicClipUrl(created.id);

            if (s.clipsAutoPostDiscord && s.clipsDiscordWebhookUrl) {
              try {
                await fetch(s.clipsDiscordWebhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content: `🎬 **${waited.clip?.title || "New clip"}**\n${url}`,
                  }),
                });
              } catch {
                /* non-fatal */
              }
            }

            return {
              ok: true,
              result: {
                id: created.id,
                url,
                editUrl: created.editUrl,
                ready: Boolean(waited.clip),
              },
            };
          }

          case "save_replay": {
            await ensureObs();
            a.saveReplayBuffer();
            return { ok: true, result: { saved: true } };
          }

          default:
            return {
              ok: false,
              error: `Unknown action "${action}". See GET /api/bridge/actions`,
            };
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });
  }, [connect]);

  return null;
}
