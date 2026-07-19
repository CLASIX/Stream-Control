/**
 * OBS Control — production panel (formerly "Go Live").
 *
 * One-click start/end stream sequences + live OBS performance stats
 * (CPU / FPS / dropped frames / render time). streamer.bot can trigger
 * the same sequences via the Bridge module.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { useObs } from "../hooks/useObs";
import { useChatSession } from "../lib/chatSession";
import { ChatFeed } from "../components/ChatFeed";
import { StatusDot } from "../components/StatusDot";
import { TwitchIcon, KickIcon } from "../components/PlatformIcon";
import type { Tab } from "../types";
import { FreeformBoard, type FreeformBoardItem } from "../components/FreeformBoard";
import { SortableList } from "../components/SortableList";
import { applyOrder } from "../lib/reorder";
import { DragHandle } from "../components/DragHandle";
import { TileCard } from "../components/TileCard";

function ObsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function SourceKindIcon({ inputKind, isGroup, sourceType }: { inputKind?: string; isGroup?: boolean; sourceType?: string }) {
  if (isGroup || inputKind === "group") return <span>📁</span>;
  if (!inputKind && !sourceType) return <span>💠</span>;
  const k = (inputKind || "").toLowerCase();
  const t = (sourceType || "").toLowerCase();
  if (k.includes("dshow") || k.includes("av_capture") || k.includes("camera") || k.includes("video_capture")) return <span>📷</span>;
  if (k.includes("monitor") || k.includes("display")) return <span>🖥️</span>;
  if (k.includes("window") || k.includes("game") || k.includes("app_input")) return <span>🎮</span>;
  if (k.includes("browser") || k.includes("web")) return <span>🌐</span>;
  if (k.includes("ffmpeg") || k.includes("vlc") || k.includes("media")) return <span>🎬</span>;
  if (k.includes("image") || k.includes("slideshow") || k.includes("pic")) return <span>🖼️</span>;
  if (k.includes("text") || k.includes("gdiplus") || k.includes("ft2")) return <span>📝</span>;
  if (k.includes("wasapi") || k.includes("pulse") || k.includes("alsa") || k.includes("audio")) return <span>🎙️</span>;
  if (t === "obs_source_type_scene" || k.includes("scene")) return <span>🎞️</span>;
  return <span>💠</span>;
}

function StatCard({
  label,
  value,
  warn,
  sub,
  editMode = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
  sub?: string;
  editMode?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-2.5 py-1.5 min-w-0 flex flex-col justify-between h-full min-h-[54px] overflow-hidden ${
      editMode ? "border-dashed border-white/25 bg-white/[0.05]" : "border-white/10 bg-white/[0.04]"
    }`}>
      <div>
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/45 truncate">
          <DragHandle visible={Boolean(editMode)} />
          <span className="truncate">{label}</span>
        </div>
        <div
          className={`mt-0.5 font-mono text-xs sm:text-sm font-extrabold tabular-nums truncate ${
            warn ? "text-amber-400" : "text-white"
          }`}
          title={value}
        >
          {value}
        </div>
      </div>
      {sub && <div className="mt-0.5 text-[9px] text-white/35 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatViewers(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

function parseObsTimecode(timecode: string): number | null {
  const raw = (timecode.split(".")[0] || timecode).trim();
  const parts = raw.split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 1) return parts[0] * 1000;
  return null;
}

interface PlatformLiveInfo {
  channel: string;
  live: boolean;
  viewers: number;
  title: string;
  game: string;
  displayName: string;
  startedAt: string;
  error?: string | null;
}

interface LiveStatusPayload {
  ok: boolean;
  at?: string;
  twitch: PlatformLiveInfo | null;
  kick: PlatformLiveInfo | null;
}

function StreamPreviewCard({
  editMode,
  client,
  status,
  state,
  fps = 30,
  onFpsChange,
}: {
  editMode?: boolean;
  client: any;
  status: string;
  state: any;
  actions?: any;
  fps?: 15 | 30 | 60;
  onFpsChange?: (fps: 15 | 30 | 60) => void;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (status !== "connected" || !active || !client?.getSourceScreenshot) {
      if (status !== "connected") setImageSrc(null);
      return;
    }
    let cancelled = false;
    const intervalMs = Math.round(1000 / fps);
    const pull = async () => {
      const sourceName = state.currentScene || state.scenes[0] || "";
      if (!sourceName) return;
      const img = await client.getSourceScreenshot(sourceName, 960, "jpeg", 75);
      if (!cancelled && img) {
        setImageSrc(img);
      }
    };
    void pull();
    const timer = setInterval(pull, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, active, fps, client, state.currentScene, state.scenes]);

  const [transitioning, setTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);

  useEffect(() => {
    let timer: any = null;
    const onTransition = (e: any) => {
      if (timer) clearInterval(timer);
      const dur = typeof e?.detail === "number" && e.detail > 0 ? e.detail : (state.transitionDuration || 300);
      setTransitioning(true);
      setTransitionProgress(0);
      const start = Date.now();
      timer = setInterval(() => {
        const elapsed = Date.now() - start;
        const p = Math.min(100, Math.round((elapsed / dur) * 100));
        setTransitionProgress(p);
        if (p >= 100) {
          clearInterval(timer);
          setTimeout(() => setTransitioning(false), 150);
        }
      }, 16);
    };
    const onEnd = () => {
      if (timer) clearInterval(timer);
      setTransitionProgress(100);
      setTimeout(() => setTransitioning(false), 150);
    };
    window.addEventListener("sc:obs-transition", onTransition);
    window.addEventListener("sc:obs-transition-end", onEnd);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("sc:obs-transition", onTransition);
      window.removeEventListener("sc:obs-transition-end", onEnd);
    };
  }, [state.transitionDuration]);

  return (
    <TileCard title="Stream Preview" editMode={Boolean(editMode)}>
      <div className="flex flex-col gap-3">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 relative overflow-hidden">
          {transitioning && (
            <div
              className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-rose-500 to-red-500 animate-pulse transition-all duration-75 z-20"
              style={{ width: `${transitionProgress}%` }}
            />
          )}
          <div className="flex items-center gap-3 relative z-10">
            {status === "connected" && (
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-bold text-xs transition cursor-pointer ${
                  active
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30"
                }`}
                title={active ? "Click to pause live preview" : "Click to resume live preview"}
              >
                <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {active ? "Preview Playing" : "Preview Paused"}
              </button>
            )}
            {state.streaming.active && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/50 px-2.5 py-1 font-bold text-red-300">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                LIVE {state.streaming.timecode.split(".")[0] || state.streaming.timecode}
              </span>
            )}
            {state.recording.active && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 px-2.5 py-1 font-bold text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                REC {state.recording.timecode.split(".")[0] || state.recording.timecode}
              </span>
            )}
            {status === "connected" && state.currentScene && (
              <span className="text-white/60 font-medium bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                Scene: <span className="text-white font-bold">{state.currentScene}</span>
              </span>
            )}
            {transitioning && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 px-2.5 py-1 font-extrabold text-amber-300 animate-pulse">
                <span>⚡</span> TRANSITIONING ({transitionProgress}%)
              </span>
            )}
          </div>

          {status === "connected" && (
            <div className="flex items-center gap-2">
              <span className="text-white/45 text-[11px]">Refresh:</span>
              <div className="flex rounded-lg bg-white/5 border border-white/10 p-0.5">
                {([15, 30, 60] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => onFpsChange?.(r)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                      fps === r ? "bg-white/20 text-white" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {r} fps
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Video Frame */}
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black/60 border border-white/10 relative flex items-center justify-center shadow-xl">
          {status === "connected" ? (
            imageSrc && active ? (
              <img
                src={imageSrc}
                alt="Live stream preview"
                className="w-full h-full object-contain"
              />
            ) : !active && imageSrc ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={imageSrc}
                  alt="Paused preview"
                  className="w-full h-full object-contain opacity-50"
                />
                <span className="absolute rounded-full bg-black/80 border border-white/20 px-4 py-2 text-sm font-semibold text-white">
                  Preview Paused
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-white/50 p-6 text-center">
                <span className="h-6 w-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                <span className="text-sm font-medium">
                  Waiting for frame from OBS ({state.currentScene || "Program"})...
                </span>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-white/50 p-8 text-center max-w-sm">
              <ObsIcon />
              <div>
                <h4 className="text-sm font-bold text-white/80">OBS Offline</h4>
                <p className="mt-1 text-xs text-white/45">
                  Connect to OBS Studio above to watch live scene preview and control your broadcast.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </TileCard>
  );
}

function VerticalStreamPreviewCard({
  editMode,
  client,
  status,
  state,
  fps = 30,
  onFpsChange,
}: {
  editMode?: boolean;
  client: any;
  status: string;
  state: any;
  fps?: 15 | 30 | 60;
  onFpsChange?: (fps: 15 | 30 | 60) => void;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  const vCanvasUuid = state.verticalCanvasUuid || null;
  const activeVertScene = state.studioModeEnabled ? (state.verticalPreviewScene || state.verticalCurrentScene) : state.verticalCurrentScene;

  useEffect(() => {
    if (status !== "connected" || !active || !client?.getSourceScreenshot) {
      if (status !== "connected") setImageSrc(null);
      return;
    }
    let cancelled = false;
    const intervalMs = Math.round(1000 / fps);
    const pull = async () => {
      const vertScene = state.studioModeEnabled ? (state.verticalPreviewScene || state.verticalCurrentScene) : state.verticalCurrentScene;
      const fallbackScene = vertScene || (state.verticalScenes && state.verticalScenes[0]) || state.currentScene || "";

      let img: string | null = null;

      // 1. Try capturing fallbackScene directly (first with canvasUuid, then without canvasUuid)
      if (fallbackScene) {
        if (vCanvasUuid) {
          img = await client.getSourceScreenshot(fallbackScene, 540, "jpeg", 75, vCanvasUuid);
        }
        if (!img) {
          img = await client.getSourceScreenshot(fallbackScene, 540, "jpeg", 75);
        }
      }

      // 2. Try candidate vertical scenes
      if (!img && state.verticalScenes && state.verticalScenes.length > 0 && fallbackScene !== state.verticalScenes[0]) {
        img = await client.getSourceScreenshot(state.verticalScenes[0], 540, "jpeg", 75);
      }
      if (!img && state.scenes && state.scenes.length > 0) {
        const vCandidate = state.scenes.find((s: string) => s !== fallbackScene && (s.toLowerCase().includes("[v]") || s.toLowerCase().includes("vert") || s.toLowerCase().includes("aitum")));
        if (vCandidate) {
          img = await client.getSourceScreenshot(vCandidate, 540, "jpeg", 75);
        }
      }

      // 3. Last resort fallback: direct Aitum Virtual Output source names
      if (!img) {
        img = await client.getSourceScreenshot("Aitum Vertical", 540, "jpeg", 75);
      }
      if (!img) {
        img = await client.getSourceScreenshot("Vertical Canvas", 540, "jpeg", 75);
      }

      if (!cancelled && img) {
        setImageSrc(img);
      }
    };
    void pull();
    const timer = setInterval(pull, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, active, fps, client, vCanvasUuid, activeVertScene, state.verticalCurrentScene, state.verticalPreviewScene, state.verticalScenes, state.currentScene, state.scenes, state.studioModeEnabled]);

  const [transitioning, setTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);

  useEffect(() => {
    let timer: any = null;
    const onTransition = (e: any) => {
      if (timer) clearInterval(timer);
      const dur = Math.max(1200, typeof e?.detail === "number" && e.detail > 0 ? e.detail : (state.transitionDuration || 1200));
      setTransitioning(true);
      setTransitionProgress(0);
      const start = Date.now();
      timer = setInterval(() => {
        const elapsed = Date.now() - start;
        const p = Math.min(100, Math.round((elapsed / dur) * 100));
        setTransitionProgress(p);
        if (p >= 100) {
          clearInterval(timer);
          setTimeout(() => setTransitioning(false), 150);
        }
      }, 16);
    };
    const onEnd = () => {
      if (timer) clearInterval(timer);
      setTransitionProgress(100);
      setTimeout(() => setTransitioning(false), 150);
    };
    window.addEventListener("sc:obs-transition", onTransition);
    window.addEventListener("sc:obs-transition-end", onEnd);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("sc:obs-transition", onTransition);
      window.removeEventListener("sc:obs-transition-end", onEnd);
    };
  }, [state.transitionDuration]);

  return (
    <TileCard title="Vertical Stream Preview" editMode={Boolean(editMode)} className="flex-1 w-full h-full min-h-0 overflow-hidden">
      <div className="flex flex-col gap-3 flex-1 min-h-0 h-full w-full overflow-hidden">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs relative overflow-hidden shrink-0 w-full min-h-[44px]">
          {transitioning && (
            <div
              className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-rose-500 to-red-500 animate-pulse transition-all duration-75 z-20 shadow-lg"
              style={{ width: `${transitionProgress}%` }}
            />
          )}
          <div className="flex items-center gap-2 relative z-10 min-w-0 flex-1">
            {status === "connected" && (
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bold text-xs transition cursor-pointer shrink-0 ${
                  active
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30"
                }`}
                title={active ? "Click to pause vertical preview" : "Click to resume vertical preview"}
              >
                <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {active ? "Playing" : "Paused"}
              </button>
            )}

            {status === "connected" && (
              <span className="text-white/60 font-medium bg-white/5 border border-white/10 px-2.5 py-1 rounded-full truncate max-w-[220px]">
                Scene: <span className="text-white font-bold">{activeVertScene || state.verticalScenes?.[0] || "—"}</span>
              </span>
            )}
          </div>

          {status === "connected" && (
            <div className="flex items-center gap-1.5 shrink-0 relative z-10">
              <span className="text-white/45 text-[11px] hidden sm:inline">Refresh:</span>
              <div className="flex rounded-lg bg-white/5 border border-white/10 p-0.5">
                {([15, 30, 60] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => onFpsChange?.(r)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                      fps === r ? "bg-white/20 text-white" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {r} fps
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 9:16 Vertical Video Player Container */}
        <div className="aspect-[9/16] w-full max-h-[580px] sm:max-h-[680px] mx-auto rounded-2xl overflow-hidden bg-black/60 border border-white/10 relative flex items-center justify-center shadow-xl flex-1 min-h-0">
          {status === "connected" ? (
            imageSrc && active ? (
              <img
                src={imageSrc}
                alt="Vertical live stream preview"
                className="w-full h-full object-contain"
              />
            ) : !active && imageSrc ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={imageSrc}
                  alt="Paused preview"
                  className="w-full h-full object-contain opacity-50"
                />
                <span className="absolute rounded-full bg-black/80 border border-white/20 px-4 py-2 text-sm font-semibold text-white">
                  Preview Paused
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-white/50 p-6 text-center">
                <span className="h-6 w-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                <span className="text-sm font-medium">
                  {activeVertScene ? `Waiting for vertical frame from "${activeVertScene}"...` : "Connecting to Aitum Vertical Canvas..."}
                </span>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-white/50 p-8 text-center max-w-sm">
              <ObsIcon />
              <div>
                <h4 className="text-sm font-bold text-white/80">OBS Offline</h4>
                <p className="mt-1 text-xs text-white/45">
                  Connect to OBS Studio above to watch live vertical preview.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </TileCard>
  );
}

function ScenesSourcesDockCard({
  editMode,
  client,
  status,
  state,
  actions,
}: {
  editMode?: boolean;
  client: any;
  status: string;
  state: any;
  actions: any;
}) {
  const { settings, update } = useStore();
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [selectedVScene, setSelectedVScene] = useState<string>("");
  const [sourcesList, setSourcesList] = useState<any[]>([]);
  const [loadingSources, setLoadingSources] = useState<boolean>(false);

  // Group expansion state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [groupItemsMap, setGroupItemsMap] = useState<Record<string, any[]>>({});
  const [loadingGroups, setLoadingGroups] = useState<Record<string, boolean>>({});

  // Context menu popover for linking across canvases (`obsLinkedItems`)
  const [linkMenu, setLinkMenu] = useState<{
    key: string;
    name: string;
    type: "scene" | "source" | "vScene" | "vSource";
  } | null>(null);

  const activeMainScene = state.studioModeEnabled ? (state.previewScene || state.currentScene) : state.currentScene;
  const activeVertScene = state.studioModeEnabled ? (state.verticalPreviewScene || state.verticalCurrentScene) : state.verticalCurrentScene;

  // Always sync selectedScene / selectedVScene to the live active scene so when switching tabs, the ACTIVE scene is highlighted right away!
  useEffect(() => {
    if (activeMainScene) {
      setSelectedScene(activeMainScene);
    }
  }, [activeMainScene]);

  useEffect(() => {
    if (activeVertScene) {
      setSelectedVScene(activeVertScene);
    } else if (!selectedVScene && state.scenes.length > 0) {
      const vCandidate = state.scenes.find((s: string) => s.toLowerCase().includes("[v]") || s.toLowerCase().includes("vert") || s.toLowerCase().includes("aitum")) || state.scenes[0] || "";
      setSelectedVScene(vCandidate);
    }
  }, [activeVertScene, state.scenes]);

  const [transitioning, setTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<"scenes" | "sources" | "vScenes" | "vSources" | "hidden">("scenes");

  // If editMode is toggled off while looking at "hidden", snap back to "scenes" cleanly
  useEffect(() => {
    if (!editMode && activeTab === "hidden") {
      setActiveTab("scenes");
    }
  }, [editMode, activeTab]);

  const targetSceneName = activeTab === "vScenes" || activeTab === "vSources"
    ? (selectedVScene || activeVertScene || state.verticalCurrentScene || state.currentScene)
    : (selectedScene || activeMainScene || state.currentScene);

  useEffect(() => {
    if (status !== "connected" || !targetSceneName || !client || activeTab === "hidden") {
      if (status !== "connected" || activeTab === "hidden") setSourcesList([]);
      return;
    }
    const isVTab = activeTab === "vScenes" || activeTab === "vSources";
    if (isVTab && state.verticalCanvasUuid && targetSceneName === state.verticalCurrentScene && state.verticalSceneItems && state.verticalSceneItems.length > 0) {
      setSourcesList(state.verticalSceneItems);
      return;
    }
    if (!isVTab && targetSceneName === state.currentScene && state.sceneItems && state.sceneItems.length > 0) {
      setSourcesList(state.sceneItems);
      return;
    }
    let cancelled = false;
    setLoadingSources(true);
    const reqData: any = { sceneName: targetSceneName };
    if (isVTab && state.verticalCanvasUuid) reqData.canvasUuid = state.verticalCanvasUuid;
    client
      .call("GetSceneItemList", reqData)
      .then((res: any) => {
        if (cancelled) return;
        const mapped = (res?.sceneItems || []).slice().reverse().map((item: any) => ({
          sceneItemId: item.sceneItemId,
          sourceName: item.sourceName,
          inputKind: item.inputKind || "",
          sourceType: item.sourceType || "",
          sceneItemEnabled: item.sceneItemEnabled,
          isGroup: Boolean(item.isGroup),
        }));
        setSourcesList(mapped);
      })
      .catch(() => {
        if (!cancelled) setSourcesList([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, targetSceneName, activeTab, client, state.currentScene, state.sceneItems, state.verticalCurrentScene, state.verticalSceneItems, state.verticalCanvasUuid]);

  const triggerTransitionBar = (customDur?: number) => {
    setTransitioning(true);
    setTransitionProgress(0);
    const dur = Math.max(1200, typeof customDur === "number" && customDur > 0 ? customDur : (state.transitionDuration || 1200));
    window.dispatchEvent(new CustomEvent("sc:obs-transition", { detail: dur }));
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, Math.round((elapsed / dur) * 100));
      setTransitionProgress(p);
      if (p >= 100) {
        clearInterval(timer);
        setTimeout(() => setTransitioning(false), 200);
      }
    }, 16);
  };

  // Helper to link or unlink two items (`keyA <-> keyB`)
  const toggleLink = (keyA: string, keyB: string) => {
    const current = { ...(settings.obsLinkedItems || {}) };
    const listA = new Set(current[keyA] || []);
    const listB = new Set(current[keyB] || []);

    if (listA.has(keyB)) {
      listA.delete(keyB);
      listB.delete(keyA);
    } else {
      listA.add(keyB);
      listB.add(keyA);
    }

    if (listA.size === 0) delete current[keyA];
    else current[keyA] = Array.from(listA);

    if (listB.size === 0) delete current[keyB];
    else current[keyB] = Array.from(listB);

    update({ obsLinkedItems: current });
  };

  // Trigger linked source toggles across Main <-> Vertical canvas
  const executeLinkedSourceToggle = async (toggledSourceName: string, isVSources: boolean, newEnabled: boolean) => {
    const key = isVSources ? `vSource:${toggledSourceName}` : `source:${toggledSourceName}`;
    const linkedTargets = (settings.obsLinkedItems || {})[key] || [];
    for (const target of linkedTargets) {
      if (target.startsWith("vSource:") && state.verticalCanvasUuid && actions.toggleVerticalSceneItem) {
        const linkedName = target.slice(8);
        const vItem = (state.verticalSceneItems || []).find((i: any) => i.sourceName === linkedName);
        if (vItem) {
          await actions.toggleVerticalSceneItem(vItem.sceneItemId, newEnabled, state.verticalCurrentScene);
        } else {
          await client?.call("SetSceneItemEnabled", {
            sceneName: state.verticalCurrentScene,
            sceneItemEnabled: newEnabled,
            sourceName: linkedName,
            canvasUuid: state.verticalCanvasUuid,
          }).catch(() => {});
        }
      } else if (target.startsWith("source:")) {
        const linkedName = target.slice(7);
        const mItem = (state.sceneItems || []).find((i: any) => i.sourceName === linkedName);
        if (mItem) {
          await actions.toggleSceneItem(mItem.sceneItemId, newEnabled, state.currentScene);
        } else {
          await client?.call("SetSceneItemEnabled", {
            sceneName: state.currentScene,
            sceneItemEnabled: newEnabled,
            sourceName: linkedName,
          }).catch(() => {});
        }
      }
    }
  };

  // Trigger linked scene switch across Main <-> Vertical canvas
  const executeLinkedSceneSwitch = async (clickedSceneName: string, isVScenes: boolean) => {
    const key = isVScenes ? `vScene:${clickedSceneName}` : `scene:${clickedSceneName}`;
    const linkedTargets = (settings.obsLinkedItems || {})[key] || [];
    for (const target of linkedTargets) {
      if (target.startsWith("vScene:") && state.verticalCanvasUuid) {
        const linkedScene = target.slice(7);
        if ((state.verticalScenes || []).includes(linkedScene)) {
          if (state.studioModeEnabled && actions.setVerticalPreviewScene) {
            await actions.setVerticalPreviewScene(linkedScene);
          } else if (actions.setVerticalScene) {
            await actions.setVerticalScene(linkedScene);
          }
        }
      } else if (target.startsWith("scene:")) {
        const linkedScene = target.slice(6);
        if ((state.scenes || []).includes(linkedScene)) {
          if (state.studioModeEnabled && actions.setPreviewScene) {
            await actions.setPreviewScene(linkedScene);
          } else if (actions.setScene) {
            await actions.setScene(linkedScene);
          }
        }
      }
    }
  };

  const rawScenesList = activeTab === "vScenes"
    ? (state.verticalCanvasUuid && state.verticalScenes && state.verticalScenes.length > 0 ? state.verticalScenes : state.scenes)
    : state.scenes;

  const visibleScenesList = rawScenesList.filter((s: string) => {
    const key = activeTab === "vScenes" ? `vScene:${s}` : `scene:${s}`;
    return !(settings.obsHiddenItems || []).includes(key);
  });

  const hiddenScenesList = rawScenesList.filter((s: string) => {
    const key = activeTab === "vScenes" ? `vScene:${s}` : `scene:${s}`;
    return (settings.obsHiddenItems || []).includes(key);
  });

  // Order visible scenes according to saved order, with any items not yet in savedOrder preserving native OBS index order
  const activeScenesList = applyOrder(
    visibleScenesList,
    activeTab === "vScenes" ? (settings.obsVScenesOrder || []) : (settings.obsScenesOrder || []),
    (s: string) => s
  );

  const visibleSourcesList = sourcesList.filter((item: any) => {
    const key = activeTab === "vSources" ? `vSource:${item.sourceName}` : `source:${item.sourceName}`;
    return !(settings.obsHiddenItems || []).includes(key);
  });

  const hiddenSourcesList = sourcesList.filter((item: any) => {
    const key = activeTab === "vSources" ? `vSource:${item.sourceName}` : `source:${item.sourceName}`;
    return (settings.obsHiddenItems || []).includes(key);
  });

  const orderedSourcesList = applyOrder(
    visibleSourcesList,
    activeTab === "vSources" ? (settings.obsVSourcesOrder || []) : (settings.obsSourcesOrder || []),
    (item: any) => item.sourceName
  );

  // The 4 symmetrical main tabs
  const mainTabs: { id: "scenes" | "sources" | "vScenes" | "vSources"; label: string }[] = [
    { id: "scenes", label: "SCENES" },
    { id: "sources", label: "SOURCES" },
    { id: "vScenes", label: "VERTICAL SCENES" },
    { id: "vSources", label: "VERTICAL SOURCES" },
  ];

  const orderedTabs = applyOrder(
    mainTabs,
    settings.obsScenesSourcesTabOrder || ["scenes", "sources", "vScenes", "vSources"],
    (t) => t.id
  );

  return (
    <TileCard title="Scenes & Sources" editMode={Boolean(editMode)} className="flex-1 w-full h-full min-h-0 overflow-hidden">
      <div className="flex flex-col gap-3 flex-1 min-h-0 h-full w-full overflow-hidden relative">
        {/* Top Header & Studio Mode Bar */}
        <div className="flex items-center justify-between gap-3 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs relative overflow-hidden shrink-0 w-full min-h-[44px]">
          {transitioning && (
            <div
              className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-rose-500 to-red-500 animate-pulse transition-all duration-75 z-20 shadow-lg"
              style={{ width: `${transitionProgress}%` }}
            />
          )}
          <div className="flex items-center gap-2.5 relative z-10 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => actions.setStudioMode(!state.studioModeEnabled)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-bold transition cursor-pointer shrink-0 ${
                state.studioModeEnabled
                  ? "bg-[#9146FF] text-white shadow-lg shadow-[#9146FF]/30"
                  : "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white"
              }`}
              title="Toggle OBS Studio Mode"
            >
              <span className={`h-2 w-2 rounded-full ${state.studioModeEnabled ? "bg-white animate-pulse" : "bg-white/30"}`} />
              Studio Mode: {state.studioModeEnabled ? "ON" : "OFF"}
            </button>

            {status === "connected" && (
              <div className="flex items-center gap-3 text-xs truncate">
                <span className="text-white/70 truncate">
                  Program: <strong className="text-emerald-300 ml-0.5">{state.currentScene || "—"}</strong>
                </span>
                {state.studioModeEnabled && (
                  <span className="text-white/70 truncate">
                    Preview: <strong className="text-amber-300 ml-0.5">{state.previewScene || "—"}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {status === "connected" && state.studioModeEnabled && (
            <button
              type="button"
              onClick={() => {
                actions.triggerTransition();
                triggerTransitionBar();
              }}
              className="rounded-lg bg-gradient-to-r from-red-500 to-rose-600 hover:brightness-110 px-3 py-1 font-extrabold text-white shadow-lg transition flex items-center justify-center gap-1 cursor-pointer relative z-10 shrink-0 w-32"
              title="Transition Preview scene directly to Program"
            >
              <span>TRANSITION</span>
              <span>→</span>
            </button>
          )}
        </div>

        {/* View Switcher Pill Bar */}
        {status === "connected" && (
          <div className="flex flex-col gap-1.5 shrink-0 w-full">
            <SortableList
              items={orderedTabs}
              getId={(t) => t.id}
              onReorder={(newOrder) => update({ obsScenesSourcesTabOrder: newOrder })}
              editMode={Boolean(editMode)}
              className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-black/40 border border-white/10 rounded-xl p-1 text-[11px] sm:text-xs w-full items-stretch"
              renderItem={(t) => (
                <button
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`w-full py-1.5 rounded-lg font-extrabold transition cursor-pointer text-center truncate px-1.5 min-h-[32px] ${
                    activeTab === t.id ? "bg-[#9146FF] text-white shadow" : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {t.label}
                </button>
              )}
            />

            {/* Symmetrical Hidden Items bar ONLY in Edit layout mode */}
            {editMode && (
              <div className="flex items-center justify-between gap-2 bg-[#17171d] border border-white/15 rounded-xl px-3 py-1.5 text-xs shadow-md">
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-sm">🙈</span>
                  <span className="font-semibold">Hidden Dock Items ({(settings.obsHiddenItems || []).length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === "hidden" ? "scenes" : "hidden")}
                  className={`px-3 py-1 rounded-lg font-extrabold transition cursor-pointer text-xs ${
                    activeTab === "hidden"
                      ? "bg-[#9146FF] text-white shadow"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {activeTab === "hidden" ? "← Back to Dock" : "Manage Hidden Items →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Popover Context Menu for Linking across Main <-> Vertical Canvas */}
        {linkMenu && (
          <div
            className="absolute z-50 bg-[#1e1e26] border border-white/25 rounded-2xl shadow-2xl p-3 w-72 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-2 text-xs"
            style={{ top: 110, right: 16 }}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2 text-white/80 font-bold">
              <span className="truncate">Link "{linkMenu.name}" across canvases</span>
              <button
                type="button"
                onClick={() => setLinkMenu(null)}
                className="text-white/40 hover:text-white px-1.5 text-sm font-bold rounded hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-white/50 leading-relaxed">
              Select {linkMenu.type.includes("Source") ? "sources" : "scenes"} on the {linkMenu.type.startsWith("v") ? "Main Canvas" : "Vertical Canvas"} to link/sync toggles:
            </p>

            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {(() => {
                const isVerticalSrc = linkMenu.type === "vSource";
                const isMainSrc = linkMenu.type === "source";
                const isVerticalScn = linkMenu.type === "vScene";
                const isMainScn = linkMenu.type === "scene";

                const candidates: { key: string; label: string }[] = [];
                if (isMainSrc) {
                  (state.verticalSceneItems || []).forEach((i: any) => candidates.push({ key: `vSource:${i.sourceName}`, label: `Vertical Source: ${i.sourceName}` }));
                } else if (isVerticalSrc) {
                  (state.sceneItems || []).forEach((i: any) => candidates.push({ key: `source:${i.sourceName}`, label: `Main Source: ${i.sourceName}` }));
                } else if (isMainScn) {
                  (state.verticalScenes || []).forEach((s: string) => candidates.push({ key: `vScene:${s}`, label: `Vertical Scene: ${s}` }));
                } else if (isVerticalScn) {
                  (state.scenes || []).forEach((s: string) => candidates.push({ key: `scene:${s}`, label: `Main Scene: ${s}` }));
                }

                if (candidates.length === 0) {
                  return <div className="py-4 text-center text-white/35 text-[11px]">No candidate {linkMenu.type.includes("Source") ? "sources" : "scenes"} found on other canvas</div>;
                }

                return candidates.map((cand) => {
                  const isLinked = ((settings.obsLinkedItems || {})[linkMenu.key] || []).includes(cand.key);
                  return (
                    <button
                      key={cand.key}
                      type="button"
                      onClick={() => toggleLink(linkMenu.key, cand.key)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition ${
                        isLinked ? "bg-[#9146FF]/20 text-white font-bold ring-1 ring-[#9146FF]" : "hover:bg-white/10 text-white/70 hover:text-white"
                      }`}
                    >
                      <span className="truncate pr-2">{cand.label}</span>
                      <span className={`h-4 w-4 rounded flex items-center justify-center text-[10px] ${isLinked ? "bg-[#9146FF] text-white font-extrabold" : "border border-white/20"}`}>
                        {isLinked ? "✓" : ""}
                      </span>
                    </button>
                  );
                });
              })()}
            </div>

            {((settings.obsLinkedItems || {})[linkMenu.key] || []).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const current = { ...(settings.obsLinkedItems || {}) };
                  const targets = current[linkMenu.key] || [];
                  delete current[linkMenu.key];
                  for (const t of targets) {
                    if (current[t]) {
                      current[t] = current[t].filter((x) => x !== linkMenu.key);
                      if (current[t].length === 0) delete current[t];
                    }
                  }
                  update({ obsLinkedItems: current });
                  setLinkMenu(null);
                }}
                className="w-full mt-1 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-center text-[11px] transition"
              >
                Unlink All from "{linkMenu.name}"
              </button>
            )}
          </div>
        )}

        {/* Single-Column Dock Content */}
        {status === "connected" ? (
          activeTab === "hidden" ? (
            /* Hidden Items Tab */
            <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col flex-1 min-h-[160px] h-full overflow-hidden w-full">
              <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-white/50 shrink-0">
                <span>Hidden Items ({(settings.obsHiddenItems || []).length})</span>
                {(settings.obsHiddenItems || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => update({ obsHiddenItems: [] })}
                    className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-bold normal-case text-[10px]"
                  >
                    Restore All
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0">
                {(settings.obsHiddenItems || []).length === 0 ? (
                  <div className="py-12 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-1.5">
                    <span>No hidden items right now.</span>
                    <span className="text-white/30 text-[11px] max-w-xs">In Edit layout mode, click the 🙈 Hide button next to any scene or source to tuck it away.</span>
                  </div>
                ) : (
                  (settings.obsHiddenItems || []).map((hiddenKey: string) => {
                    const parts = hiddenKey.split(":");
                    const type = parts[0];
                    const name = parts.slice(1).join(":");
                    const typeLabel = type === "scene" ? "Scene" : type === "source" ? "Source" : type === "vScene" ? "Vertical Scene" : type === "vSource" ? "Vertical Source" : type;

                    return (
                      <div
                        key={hiddenKey}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-xs transition"
                      >
                        <div className="min-w-0 flex-1 truncate flex items-center gap-2">
                          <span className="text-white/45 text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-white/5 border border-white/10 shrink-0">{typeLabel}</span>
                          <span className="text-white font-medium truncate">{name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            update({ obsHiddenItems: (settings.obsHiddenItems || []).filter(k => k !== hiddenKey) });
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold shrink-0 flex items-center gap-1"
                        >
                          <span>👁️</span>
                          <span>Unhide</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : activeTab === "scenes" || activeTab === "vScenes" ? (
            /* Scenes List */
            <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col flex-1 min-h-[160px] h-full overflow-hidden w-full">
              <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-white/50 shrink-0">
                <span>{activeTab === "vScenes" ? "Vertical Scenes" : "Scenes"} ({activeScenesList.length})</span>
                <span className="text-white/30 font-normal normal-case">{editMode ? "Drag to reorder · Hide moves down" : "Right-click or 🔗 to link · Click to switch"}</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0 flex flex-col">
                <SortableList
                  items={activeScenesList}
                  getId={(s) => s}
                  onReorder={(newOrder) => update(activeTab === "vScenes" ? { obsVScenesOrder: newOrder } : { obsScenesOrder: newOrder })}
                  editMode={Boolean(editMode)}
                  className="space-y-1 shrink-0"
                  renderItem={(scene) => {
                    const isProgram = activeTab === "vScenes" && state.verticalCanvasUuid ? scene === state.verticalCurrentScene : scene === state.currentScene;
                    const isPreview = activeTab === "vScenes" && state.verticalCanvasUuid ? scene === state.verticalPreviewScene : scene === state.previewScene;
                    const isSelected = activeTab === "vScenes"
                      ? scene === (selectedVScene || activeVertScene || state.verticalCurrentScene)
                      : scene === (selectedScene || activeMainScene || state.currentScene);
                    const itemKey = activeTab === "vScenes" ? `vScene:${scene}` : `scene:${scene}`;
                    const linkedTargets = (settings.obsLinkedItems || {})[itemKey] || [];
                    const isLinked = linkedTargets.length > 0;

                    return (
                      <div
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLinkMenu({
                            key: itemKey,
                            name: scene,
                            type: activeTab === "vScenes" ? "vScene" : "scene",
                          });
                        }}
                        className={`w-full rounded-lg flex items-center justify-between text-xs transition ${
                          isSelected
                            ? "bg-white/15 text-white ring-1 ring-white/30 font-bold"
                            : "hover:bg-white/8 text-white/70 hover:text-white"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            const isVScenes = activeTab === "vScenes";
                            if (isVScenes) {
                              setSelectedVScene(scene);
                              if (state.verticalCanvasUuid) {
                                if (state.studioModeEnabled && actions.setVerticalPreviewScene) {
                                  await actions.setVerticalPreviewScene(scene);
                                } else if (actions.setVerticalScene) {
                                  await actions.setVerticalScene(scene);
                                  triggerTransitionBar();
                                }
                              } else {
                                if (state.studioModeEnabled) {
                                  await actions.setPreviewScene(scene);
                                } else {
                                  await actions.setScene(scene);
                                  triggerTransitionBar();
                                }
                              }
                            } else {
                              setSelectedScene(scene);
                              if (state.studioModeEnabled) {
                                await actions.setPreviewScene(scene);
                              } else {
                                await actions.setScene(scene);
                                triggerTransitionBar();
                              }
                            }
                            await executeLinkedSceneSwitch(scene, isVScenes);
                          }}
                          className="flex-1 text-left px-3 py-2 flex items-center justify-between min-w-0 cursor-pointer"
                        >
                          <span className="truncate pr-2">{scene}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isProgram && (
                              <span className="rounded bg-red-500/20 border border-red-500/50 px-1.5 py-0.5 text-[9px] font-extrabold text-red-300">
                                PROGRAM
                              </span>
                            )}
                            {state.studioModeEnabled && isPreview && (
                              <span className="rounded bg-amber-500/20 border border-amber-500/50 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-300">
                                PREVIEW
                              </span>
                            )}
                          </div>
                        </button>

                        <div className="flex items-center gap-1.5 pr-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLinkMenu({
                                key: itemKey,
                                name: scene,
                                type: activeTab === "vScenes" ? "vScene" : "scene",
                              });
                            }}
                            className={`p-1 rounded transition ${
                              isLinked ? "bg-[#9146FF]/30 text-[#c9a8ff] ring-1 ring-[#9146FF]/50" : "text-white/35 hover:text-white hover:bg-white/10"
                            }`}
                            title={isLinked ? `Linked across canvases (${linkedTargets.length})` : "Right-click or click to link across canvases"}
                          >
                            🔗
                          </button>

                          {editMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                update({ obsHiddenItems: [...(settings.obsHiddenItems || []), itemKey] });
                              }}
                              className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 text-[10px] font-bold"
                              title="Hide scene to bottom of list"
                            >
                              🙈 Hide
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />

                {/* In editMode, hidden items drop to bottom right here */}
                {editMode && hiddenScenesList.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-dashed border-white/15 space-y-1 shrink-0">
                    <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-red-400/80">
                      <span>Hidden from Dock ({hiddenScenesList.length})</span>
                      <span>Click Unhide to restore</span>
                    </div>
                    {hiddenScenesList.map((scene: string) => {
                      const itemKey = activeTab === "vScenes" ? `vScene:${scene}` : `scene:${scene}`;
                      return (
                        <div
                          key={`hidden-scene-${scene}`}
                          className="w-full rounded-lg flex items-center justify-between px-3 py-1.5 text-xs bg-red-500/10 border border-red-500/20 text-white/50 opacity-80"
                        >
                          <span className="truncate font-semibold">{scene}</span>
                          <button
                            type="button"
                            onClick={() => {
                              update({ obsHiddenItems: (settings.obsHiddenItems || []).filter(k => k !== itemKey) });
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold"
                          >
                            👁️ Unhide
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Sources List */
            <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col flex-1 min-h-[160px] h-full overflow-hidden w-full">
              <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-white/50 shrink-0">
                <span className="truncate">Sources: {targetSceneName} ({orderedSourcesList.length})</span>
                <div className="flex items-center gap-2">
                  {loadingSources && <span className="text-[10px] text-white/40 normal-case">Loading…</span>}
                  <span className="text-white/30 font-normal normal-case">{editMode ? "Drag to reorder · Hide moves down" : "Right-click or 🔗 to link across canvases"}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0 flex flex-col">
                {orderedSourcesList.length === 0 && !loadingSources ? (
                  <div className="py-8 text-center text-xs text-white/35">
                    No active sources in this scene
                  </div>
                ) : (
                  <SortableList
                    items={orderedSourcesList}
                    getId={(item: any) => `${item.sceneItemId}-${item.sourceName}`}
                    onReorder={(newIds) => {
                      const newNames = newIds.map((id) => id.split("-").slice(1).join("-"));
                      update(activeTab === "vSources" ? { obsVSourcesOrder: newNames } : { obsSourcesOrder: newNames });
                    }}
                    editMode={Boolean(editMode)}
                    className="space-y-1 shrink-0"
                    renderItem={(item: any) => {
                      const enabled = Boolean(item.sceneItemEnabled);
                      const isGroup = Boolean(item.isGroup);
                      const isVSources = activeTab === "vSources";
                      const itemKey = isVSources ? `vSource:${item.sourceName}` : `source:${item.sourceName}`;
                      const isGroupExpanded = Boolean(expandedGroups[item.sourceName]);
                      const linkedTargets = (settings.obsLinkedItems || {})[itemKey] || [];
                      const isLinked = linkedTargets.length > 0;

                      return (
                        <div
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLinkMenu({
                              key: itemKey,
                              name: item.sourceName,
                              type: isVSources ? "vSource" : "source",
                            });
                          }}
                          className="rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-xs transition"
                        >
                          <div className="flex items-center justify-between gap-2 px-3 py-1.5 min-h-[36px]">
                            {isGroup ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = !isGroupExpanded;
                                  setExpandedGroups((prev) => ({ ...prev, [item.sourceName]: next }));
                                  if (next && !groupItemsMap[item.sourceName]) {
                                    setLoadingGroups((prev) => ({ ...prev, [item.sourceName]: true }));
                                    const childItems = await client.getGroupSceneItemList(
                                      item.sourceName,
                                      isVSources && state.verticalCanvasUuid ? state.verticalCanvasUuid : undefined
                                    );
                                    setGroupItemsMap((prev) => ({ ...prev, [item.sourceName]: childItems }));
                                    setLoadingGroups((prev) => ({ ...prev, [item.sourceName]: false }));
                                  }
                                }}
                                className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer font-bold text-amber-300/90 hover:text-amber-300"
                              >
                                <span className="text-[10px] w-3 text-center">{isGroupExpanded ? "▼" : "▶"}</span>
                                <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded bg-white/5 border border-white/10 text-xs shadow-inner" title="Group">
                                  <SourceKindIcon isGroup={true} />
                                </span>
                                <span className="truncate">Group: {item.sourceName}</span>
                              </button>
                            ) : (
                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded bg-white/5 border border-white/10 text-xs shadow-inner" title={`Type: ${item.inputKind || "Source"}`}>
                                  <SourceKindIcon inputKind={item.inputKind} sourceType={item.sourceType} />
                                </span>
                                <span className={`min-w-0 flex-1 truncate ${enabled ? "text-white font-medium" : "text-white/60 font-normal"}`}>
                                  {item.sourceName}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Link Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLinkMenu({
                                    key: itemKey,
                                    name: item.sourceName,
                                    type: isVSources ? "vSource" : "source",
                                  });
                                }}
                                className={`p-1 rounded transition ${
                                  isLinked ? "bg-[#9146FF]/30 text-[#c9a8ff] ring-1 ring-[#9146FF]/50" : "text-white/35 hover:text-white hover:bg-white/10"
                                }`}
                                title={isLinked ? `Linked across canvases (${linkedTargets.length})` : "Right-click or click to link across canvases"}
                              >
                                🔗
                              </button>

                              {editMode && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    update({ obsHiddenItems: [...(settings.obsHiddenItems || []), itemKey] });
                                  }}
                                  className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 text-[10px] font-bold"
                                  title="Hide source to bottom of list"
                                >
                                  🙈 Hide
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={async () => {
                                  const newEnabled = !enabled;
                                  if (isVSources && state.verticalCanvasUuid && actions.toggleVerticalSceneItem) {
                                    await actions.toggleVerticalSceneItem(item.sceneItemId, newEnabled, targetSceneName);
                                  } else {
                                    await actions.toggleSceneItem(item.sceneItemId, newEnabled, targetSceneName);
                                  }
                                  setSourcesList((prev) =>
                                    prev.map((i) => (i.sceneItemId === item.sceneItemId ? { ...i, sceneItemEnabled: newEnabled } : i))
                                  );
                                  await executeLinkedSourceToggle(item.sourceName, isVSources, newEnabled);
                                }}
                                className={`shrink-0 p-1.5 rounded-md transition cursor-pointer ${
                                  enabled
                                    ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
                                    : "text-red-400 hover:text-red-300 hover:bg-red-400/10 opacity-100"
                                }`}
                                title={enabled ? "Source visible (click to hide)" : "Source hidden (click to show)"}
                              >
                                {enabled ? "👁️" : "🚫"}
                              </button>
                            </div>
                          </div>

                          {/* Nested group items */}
                          {isGroup && isGroupExpanded && (
                            <div className="px-3 pb-2 pt-1 border-t border-white/5 bg-black/30 rounded-b-lg">
                              {loadingGroups[item.sourceName] ? (
                                <div className="py-1.5 pl-4 text-[11px] text-white/40">Loading items inside group...</div>
                              ) : !(groupItemsMap[item.sourceName] || []).length ? (
                                <div className="py-1.5 pl-4 text-[11px] text-white/35">Group contains no child sources</div>
                              ) : (
                                <div className="space-y-1 pl-3 border-l-2 border-[#9146FF]/40 my-1">
                                  {(groupItemsMap[item.sourceName] || []).map((child: any) => {
                                    const childEnabled = Boolean(child.sceneItemEnabled);
                                    const childHideKey = isVSources ? `vSource:${child.sourceName}` : `source:${child.sourceName}`;
                                    const isChildHidden = (settings.obsHiddenItems || []).includes(childHideKey);
                                    if (!editMode && isChildHidden) return null;

                                    return (
                                      <div
                                        key={child.sceneItemId}
                                        className={`flex items-center justify-between gap-2 px-2.5 py-1 rounded-md bg-white/[0.02] hover:bg-white/[0.06] text-xs transition ${
                                          isChildHidden ? "opacity-60 bg-red-500/5 border border-red-500/20" : ""
                                        }`}
                                      >
                                        <div className="min-w-0 flex-1 flex items-center gap-2">
                                          <span className="flex items-center justify-center shrink-0 w-4 h-4 rounded bg-white/5 border border-white/10 text-[10px]" title={`Type: ${child.inputKind || "Source"}`}>
                                            <SourceKindIcon inputKind={child.inputKind} sourceType={child.sourceType} />
                                          </span>
                                          <span className={`min-w-0 flex-1 truncate ${childEnabled ? "text-white font-medium" : "text-white/50 font-normal"}`}>
                                            ↳ {child.sourceName}
                                            {isChildHidden && <span className="ml-1.5 rounded bg-red-500/20 px-1 py-0.2 text-[8px] text-red-300 font-extrabold">HIDDEN</span>}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {editMode && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (isChildHidden) {
                                                  update({ obsHiddenItems: (settings.obsHiddenItems || []).filter(k => k !== childHideKey) });
                                                } else {
                                                  update({ obsHiddenItems: [...(settings.obsHiddenItems || []), childHideKey] });
                                                }
                                              }}
                                              className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 text-[9px] font-bold"
                                              title={isChildHidden ? "Unhide child source" : "Hide child source from dock"}
                                            >
                                              {isChildHidden ? "👁️ Unhide" : "🙈 Hide"}
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              const newChildEnabled = !childEnabled;
                                              if (isVSources && state.verticalCanvasUuid && actions.toggleVerticalSceneItem) {
                                                await actions.toggleVerticalSceneItem(child.sceneItemId, newChildEnabled, item.sourceName);
                                              } else {
                                                await actions.toggleSceneItem(child.sceneItemId, newChildEnabled, item.sourceName);
                                              }
                                              setGroupItemsMap((prev) => ({
                                                ...prev,
                                                [item.sourceName]: (prev[item.sourceName] || []).map((i: any) =>
                                                  i.sceneItemId === child.sceneItemId ? { ...i, sceneItemEnabled: newChildEnabled } : i
                                                ),
                                              }));
                                            }}
                                            className={`p-1 rounded transition cursor-pointer ${
                                              childEnabled
                                                ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
                                                : "text-red-400 hover:text-red-300 hover:bg-red-400/10 opacity-100"
                                            }`}
                                            title={childEnabled ? "Child source visible (click to hide)" : "Child source hidden (click to show)"}
                                          >
                                            {childEnabled ? "👁️" : "🚫"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                )}

                {/* In editMode, hidden sources drop to bottom right here */}
                {editMode && hiddenSourcesList.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-dashed border-white/15 space-y-1 shrink-0">
                    <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-red-400/80">
                      <span>Hidden from Dock ({hiddenSourcesList.length})</span>
                      <span>Click Unhide to restore</span>
                    </div>
                    {hiddenSourcesList.map((item: any) => {
                      const itemKey = activeTab === "vSources" ? `vSource:${item.sourceName}` : `source:${item.sourceName}`;
                      return (
                        <div
                          key={`hidden-src-${item.sceneItemId}-${item.sourceName}`}
                          className="w-full rounded-lg flex items-center justify-between px-3 py-1.5 text-xs bg-red-500/10 border border-red-500/20 text-white/50 opacity-80"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="flex items-center justify-center shrink-0 w-4 h-4 rounded bg-white/5 border border-white/10 text-[10px]">
                              <SourceKindIcon inputKind={item.inputKind} isGroup={item.isGroup} sourceType={item.sourceType} />
                            </span>
                            <span className="truncate font-semibold">{item.sourceName}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              update({ obsHiddenItems: (settings.obsHiddenItems || []).filter(k => k !== itemKey) });
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold shrink-0"
                          >
                            👁️ Unhide
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="py-12 text-center text-xs text-white/35 flex-1 flex items-center justify-center">
            Connect to OBS above to access the interactive Scenes &amp; Sources tile.
          </div>
        )}
      </div>
    </TileCard>
  );
}

function ObsDashboardModule() {
  const { settings, update } = useStore();
  const { status, statusMessage, state, connect, disconnect, actions, client } =
    useObs();
  const [host, setHost] = useState(settings.obsHost);
  const [port, setPort] = useState(String(settings.obsPort));
  const [password, setPassword] = useState(settings.obsPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatusPayload | null>(null);
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [obsStreamStartedAt, setObsStreamStartedAt] = useState<number | null>(null);

  // Auto-connect OBS when this panel mounts (if configured)
  useEffect(() => {
    if (settings.obsAutoConnect && (status === "idle" || status === "error")) {
      connect(settings.obsHost, settings.obsPort, settings.obsPassword);
    } else if (!settings.obsAutoConnect && status === "idle") {
      // still try a quiet connect so stats work when user opens the tab
      connect(settings.obsHost, settings.obsPort, settings.obsPassword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll Twitch/Kick live viewers (desktop server or same-origin).
  useEffect(() => {
    const twitch = settings.twitchChannel.trim();
    const kick = settings.kickChannel.trim();
    if (!twitch && !kick) {
      setLiveStatus(null);
      return;
    }

    let cancelled = false;
    let requestInFlight = false;
    const pull = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const q = new URLSearchParams();
        if (twitch) q.set("twitch", twitch);
        if (kick) q.set("kick", kick);
        q.set("_", String(Date.now()));
        const res = await fetch(`/api/live-status?${q.toString()}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as LiveStatusPayload;
        if (!cancelled && data?.ok) setLiveStatus(data);
      } catch {
        /* offline / browser-dev without electron API */
      } finally {
        requestInFlight = false;
      }
    };

    void pull();
    const timer = setInterval(pull, 2_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.twitchChannel, settings.kickChannel]);

  // Tick every second so uptime display stays fresh.
  useEffect(() => {
    const t = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleConnect = () => {
    update({
      obsHost: host,
      obsPort: Number(port) || 4455,
      obsPassword: password,
    });
    connect(host, Number(port) || 4455, password);
  };

  const obsConnected = status === "connected";
  const streaming = state.streaming.active;
  const recording = state.recording.active;

  // OBS status polls can arrive late or out of order. Capture its clock once
  // at the start of the current stream and advance from the local clock so
  // the dashboard uptime remains smooth and never jumps backwards.
  useEffect(() => {
    if (!streaming) {
      setObsStreamStartedAt(null);
      return;
    }
    if (state.streaming.startedAt !== null) {
      setObsStreamStartedAt(state.streaming.startedAt);
      return;
    }
    const elapsed = parseObsTimecode(state.streaming.timecode);
    if (elapsed === null) return;
    setObsStreamStartedAt((current) => current ?? Date.now() - elapsed);
  }, [streaming, state.streaming.timecode, state.streaming.startedAt]);

  const viewerSummary = useMemo(() => {
    const tw = liveStatus?.twitch;
    const kk = liveStatus?.kick;
    const parts: { label: string; viewers: number; live: boolean }[] = [];
    if (tw) parts.push({ label: "Twitch", viewers: tw.viewers, live: tw.live });
    if (kk) parts.push({ label: "Kick", viewers: kk.viewers, live: kk.live });
    const total = parts.reduce((sum, p) => sum + (p.live ? p.viewers : 0), 0);
    const anyLive = parts.some((p) => p.live);
    return { parts, total, anyLive };
  }, [liveStatus]);

  const uptimeMs = useMemo(() => {
    if (streaming && (state.streaming.startedAt !== null || obsStreamStartedAt !== null)) {
      const started = state.streaming.startedAt ?? obsStreamStartedAt ?? Date.now();
      return Math.max(0, liveNow - started);
    }
    // Fallback: earliest platform startedAt while live.
    const starts: number[] = [];
    for (const p of [liveStatus?.twitch, liveStatus?.kick]) {
      if (!p?.live || !p.startedAt) continue;
      const t = Date.parse(p.startedAt);
      if (Number.isFinite(t)) starts.push(t);
    }
    if (starts.length === 0) return -1;
    return liveNow - Math.min(...starts);
  }, [streaming, obsStreamStartedAt, liveStatus, liveNow]);

  const statusLabel = useMemo(() => {
    if (status === "connected") return "OBS connected";
    if (status === "connecting") return "Connecting to OBS…";
    if (status === "error") return "OBS error";
    return "OBS disconnected";
  }, [status]);

  const editMode = settings.editMode;
  const [chatPreviewOpen, setChatPreviewOpen] = useState(settings.obsChatPreviewOpen);
  const chatPreviewRef = useRef<HTMLDivElement>(null);
  const chatPreviewHeightRef = useRef(settings.obsChatPreviewHeight);

  useEffect(() => {
    setChatPreviewOpen(settings.obsChatPreviewOpen);
  }, [settings.obsChatPreviewOpen]);

  useEffect(() => {
    chatPreviewHeightRef.current = settings.obsChatPreviewHeight;
  }, [settings.obsChatPreviewHeight]);

  useEffect(() => {
    const preview = chatPreviewRef.current;
    if (!preview || !chatPreviewOpen) return;
    const observer = new ResizeObserver(() => {
      const height = Math.round(preview.getBoundingClientRect().height);
      if (height < 180 || height > 900 || height === chatPreviewHeightRef.current) return;
      chatPreviewHeightRef.current = height;
      update({ obsChatPreviewHeight: height });
    });
    observer.observe(preview);
    return () => observer.disconnect();
  }, [chatPreviewOpen, update]);

  const hasChatChannel = Boolean(
    settings.twitchChannel.trim() || settings.kickChannel.trim()
  );
  const chatConnected = hasChatChannel;
  const { messages: chatMessages, statuses: chatStatuses } = useChatSession();

  const highlightNamesCombined = useMemo(() => {
    const extra = settings.chatHighlightNames.trim();
    const channels = [settings.twitchChannel, settings.kickChannel]
      .map((c) => c.trim())
      .filter(Boolean)
      .join(",");
    return [channels, extra].filter(Boolean).join(",");
  }, [
    settings.chatHighlightNames,
    settings.twitchChannel,
    settings.kickChannel,
  ]);


  // ---- Small fixed-grid tiles (Audience / Performance) ----
  const audienceTiles: { id: string; node: ReactNode }[] = [
    {
      id: "total",
      node: (
        <StatCard
          editMode={editMode}
          label="Viewers (total)"
          value={
            settings.twitchChannel.trim() || settings.kickChannel.trim()
              ? viewerSummary.anyLive || streaming
                ? formatViewers(viewerSummary.total)
                : "0"
              : "—"
          }
          sub={
            !settings.twitchChannel.trim() && !settings.kickChannel.trim()
              ? "Set channels in Settings"
              : viewerSummary.parts
                  .map(
                    (p) =>
                      `${p.label}: ${p.live ? formatViewers(p.viewers) : "offline"}`
                  )
                  .join(" · ") || undefined
          }
        />
      ),
    },
    {
      id: "uptime",
      node: (
        <StatCard
          editMode={editMode}
          label="Uptime"
          value={
            streaming || viewerSummary.anyLive ? formatUptime(uptimeMs) : "—"
          }
          sub={
            streaming
              ? "From OBS stream clock"
              : viewerSummary.anyLive
                ? "From platform go-live time"
                : "Not live"
          }
        />
      ),
    },
  ];
  if (liveStatus?.twitch || settings.twitchChannel.trim()) {
    audienceTiles.push({
      id: "twitch",
      node: (
        <StatCard
          editMode={editMode}
          label="Twitch viewers"
          value={
            liveStatus?.twitch?.live
              ? formatViewers(liveStatus.twitch.viewers)
              : "Offline"
          }
          sub={
            liveStatus?.twitch?.displayName ||
            settings.twitchChannel ||
            "Twitch"
          }
        />
      ),
    });
  }
  if (liveStatus?.kick || settings.kickChannel.trim()) {
    audienceTiles.push({
      id: "kick",
      node: (
        <StatCard
          editMode={editMode}
          label="Kick viewers"
          value={
            liveStatus?.kick?.live
              ? formatViewers(liveStatus.kick.viewers)
              : "Offline"
          }
          sub={
            liveStatus?.kick?.displayName || settings.kickChannel || "Kick"
          }
        />
      ),
    });
  }

  const performanceTiles: { id: string; node: ReactNode }[] = state.stats
    ? [
        {
          id: "cpu",
          node: (
            <StatCard
              editMode={editMode}
              label="CPU"
              value={`${state.stats.cpu.toFixed(1)}%`}
              warn={state.stats.cpu > 40}
            />
          ),
        },
        {
          id: "fps",
          node: (
            <StatCard
              editMode={editMode}
              label="FPS"
              value={state.stats.fps.toFixed(0)}
            />
          ),
        },
        {
          id: "dropped",
          node: (
            <StatCard
              editMode={editMode}
              label="Dropped frames"
              value={String(state.stats.droppedFrames)}
              warn={state.stats.droppedFrames > 0}
            />
          ),
        },
        {
          id: "render",
          node: (
            <StatCard
              editMode={editMode}
              label="Render time"
              value={`${state.stats.renderLagMs.toFixed(1)} ms`}
            />
          ),
        },
      ]
    : [];

  const orderedAudience = applyOrder(
    audienceTiles,
    settings.obsAudienceOrder || [],
    (t) => t.id
  );
  const orderedPerformance = applyOrder(
    performanceTiles,
    settings.obsPerformanceOrder || [],
    (t) => t.id
  );

  const statusTiles = [
    {
      id: "stream",
      node: (
        <StatCard
          editMode={editMode}
          label="Stream"
          value={streaming ? `LIVE · ${state.streaming.timecode.split(".")[0] || state.streaming.timecode}` : "Offline"}
          sub={`Scene: ${state.currentScene || "—"}`}
          warn={!streaming}
        />
      ),
    },
    {
      id: "record",
      node: (
        <StatCard
          editMode={editMode}
          label="Recording"
          value={recording ? `REC · ${state.recording.timecode.split(".")[0] || state.recording.timecode}` : "Not recording"}
          sub={recording && state.recording.paused ? "Paused" : undefined}
          warn={!recording}
        />
      ),
    },
    {
      id: "vcam",
      node: (
        <StatCard
          editMode={editMode}
          label="Virtual cam"
          value={state.virtualCam ? "Active" : "Off"}
          warn={!state.virtualCam}
        />
      ),
    },
  ];

  const orderedStatus = applyOrder(
    statusTiles,
    settings.obsStatusOrder || [],
    (t) => t.id
  );

  // ---- Large freeform tiles ----
  const dashboardTiles: FreeformBoardItem[] = [
    {
      id: "connection",
      title: "Connection",
      defaultW: 720,
      defaultX: 0,
      defaultY: 0,
      node: (
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
          {obsConnected ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="font-semibold text-emerald-300">Connected</span>
                {state.obsVersion && (
                  <span className="text-white/40">OBS {state.obsVersion}</span>
                )}
              </span>
              <span className="text-xs text-white/35">
                {settings.obsHost}:{settings.obsPort}
              </span>
              <button
                onClick={disconnect}
                className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/20"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs text-white/50">Host</label>
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="127.0.0.1"
                    className="w-40 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-[#9146FF]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/50">Port</label>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    inputMode="numeric"
                    placeholder="4455"
                    className="w-24 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-[#9146FF]"
                  />
                </div>
                <div className="min-w-[180px] flex-1">
                  <label className="mb-1 block text-xs text-white/50">
                    Server password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="leave blank if none"
                      className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-[#9146FF]"
                    />
                    <button
                      onClick={() => setShowPassword((v) => !v)}
                      className="px-2 text-xs text-white/40 hover:text-white"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleConnect}
                  className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
                >
                  Connect
                </button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/50">{statusLabel}</span>
              </div>
              {statusMessage && (
                <p className="text-[11px] text-white/40">{statusMessage}</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/60 font-medium">
              <input
                type="checkbox"
                checked={settings.obsAutoConnect}
                onChange={(e) => update({ obsAutoConnect: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#9146FF]"
              />
              Connect automatically
            </label>
          </div>
        </section>
      ),
    },
    {
      id: "status",
      title: "Status",
      noBox: true,
      defaultW: 720,
      defaultX: 0,
      defaultY: 160,
      node: (
        <SortableList
          items={orderedStatus}
          getId={(t) => t.id}
          onReorder={(obsStatusOrder) => update({ obsStatusOrder })}
          editMode={Boolean(editMode)}
          className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(115px,1fr))] gap-2 w-full h-full items-stretch"
          renderItem={(t) => t.node}
        />
      ),
    },
    {
      id: "chatPreview",
      title: "Chat Preview",
      defaultW: 420,
      defaultX: 0,
      defaultY: 280,
      node: (
        <TileCard title="Chat Preview" editMode={editMode}>
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
            <span className="flex items-center gap-1.5">
              <TwitchIcon size={14} />
              <StatusDot status={chatStatuses.twitch?.status ?? "idle"} label={false} />
            </span>
            <span className="flex items-center gap-1.5">
              <KickIcon size={14} />
              <StatusDot status={chatStatuses.kick?.status ?? "idle"} label={false} />
            </span>
            <span className="text-white/35">
              {settings.twitchChannel.trim() || "—"}
              {settings.kickChannel.trim()
                ? ` · ${settings.kickChannel.trim()}`
                : ""}
            </span>
          </div>
          {hasChatChannel && (
            <button
              type="button"
              onClick={() => {
                const next = !chatPreviewOpen;
                setChatPreviewOpen(next);
                update({ obsChatPreviewOpen: next });
              }}
              className="w-full rounded-lg bg-white/8 py-2 text-xs font-semibold text-white/70 hover:bg-white/12"
            >
              {chatPreviewOpen ? "Collapse preview" : "Expand preview"}
            </button>
          )}
          {chatConnected && chatPreviewOpen && (
            <div
              ref={chatPreviewRef}
              className="flex flex-col resize-y overflow-hidden rounded-xl border border-white/10 bg-black/40"
              style={{ height: settings.obsChatPreviewHeight, minHeight: 180, maxHeight: 900 }}
            >
              <div className="shrink-0 flex items-center justify-between border-b border-white/10 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Live feed
                </span>
                <span className="text-[10px] text-white/30">
                  {chatMessages.length} msg
                  {chatMessages.length === 1 ? "" : "s"}
                </span>
              </div>
              <ChatFeed
                messages={chatMessages}
                fontSize={Math.max(13, settings.fontSize - 1)}
                showTimestamps={settings.showTimestamps}
                showPlatform={settings.showPlatform}
                highlightFirst={settings.chatHighlightFirst}
                highlightNames={highlightNamesCombined}
                highlightMentions={settings.chatHighlightMentions}
                highlightSelf={settings.chatHighlightSelf}
                useRoleColors={settings.chatRoleColors}
                platformFilter={settings.chatPlatformFilter}
                compact
                className="flex-1 min-h-0"
              />
            </div>
          )}
        </TileCard>
      ),
    },
    {
      id: "audience",
      title: "Audience",
      noBox: true,
      defaultW: 720,
      defaultX: 0,
      defaultY: 300,
      node: (
        <SortableList
          items={orderedAudience}
          getId={(t) => t.id}
          onReorder={(obsAudienceOrder) => update({ obsAudienceOrder })}
          editMode={Boolean(editMode)}
          className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 w-full h-full items-stretch"
          renderItem={(t) => t.node}
        />
      ),
    },
    {
      id: "performance",
      title: "Performance",
      noBox: true,
      defaultW: 720,
      defaultX: 0,
      defaultY: 460,
      node: (
        performanceTiles.length > 0 ? (
          <SortableList
            items={orderedPerformance}
            getId={(t) => t.id}
            onReorder={(obsPerformanceOrder) => update({ obsPerformanceOrder })}
            editMode={Boolean(editMode)}
            className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 w-full h-full items-stretch"
            renderItem={(t) => t.node}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/35 w-full">
            {obsConnected
              ? "Waiting for OBS stats…"
              : "Connect to OBS to see CPU, FPS, and dropped frames."}
          </div>
        )
      ),
    },
    {
      id: "preview",
      title: "Stream Preview",
      defaultW: 720,
      defaultX: 0,
      defaultY: 620,
      node: (
        <StreamPreviewCard
          editMode={editMode}
          client={client}
          status={status}
          state={state}
          fps={settings.obsPreviewFps || 30}
          onFpsChange={(f) => update({ obsPreviewFps: f })}
        />
      ),
    },
    {
      id: "verticalPreview",
      title: "Vertical Stream Preview",
      defaultW: 400,
      defaultX: 1460,
      defaultY: 440,
      node: (
        <VerticalStreamPreviewCard
          editMode={editMode}
          client={client}
          status={status}
          state={state}
          fps={settings.obsPreviewFps || 30}
          onFpsChange={(f) => update({ obsPreviewFps: f })}
        />
      ),
    },
    {
      id: "scenesSources",
      title: "Scenes & Sources",
      resizableH: true,
      defaultH: 460,
      defaultW: 380,
      defaultX: 0,
      defaultY: 1040,
      node: (
        <ScenesSourcesDockCard
          editMode={editMode}
          client={client}
          status={status}
          state={state}
          actions={actions}
        />
      ),
    },
  ];

  const orderedTiles = applyOrder(
    dashboardTiles,
    settings.obsTileOrder || settings.obsModuleOrder || [],
    (t) => t.id
  );

  const visibleDashboardTiles = orderedTiles.filter(
    (t) => !(settings.obsHiddenTiles || []).includes(t.id)
  );

  return (
    <div className="w-full min-w-0">
      <header
        className="mb-4 flex flex-wrap items-start justify-between gap-3 pr-[150px] sm:pr-[160px] pt-6"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <ObsIcon />
          <div>
            <h2 className="text-2xl font-bold">OBS Dashboard</h2>
            <p className="mt-1 text-sm text-white/50">
              Live stream preview, status, audience, and performance. Edit layout to move sections.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editMode && (
            <span className="rounded-full border border-[#9146FF]/30 bg-[#9146FF]/15 px-3 py-1.5 text-[11px] font-semibold text-[#c9a8ff]">
              Edit mode — drag cards · reorder small tiles · hide tiles
            </span>
          )}
          {streaming && (
            <div className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-4 py-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-bold text-red-300">LIVE</span>
              <span className="font-mono text-sm tabular-nums text-white/80">
                {state.streaming.timecode.split(".")[0] || state.streaming.timecode}
              </span>
            </div>
          )}
        </div>
      </header>

      {editMode && (
        <div className="mb-4 bg-[#17171d] border border-white/15 rounded-2xl p-3 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white/80 font-bold">
            <span>🙈</span>
            <span>Hidden Dashboard Tiles ({(settings.obsHiddenTiles || []).length})</span>
            <span className="text-[11px] font-normal text-white/45 hidden sm:inline">
              — Click Hide on any tile header below to tuck it away.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(settings.obsHiddenTiles || []).length === 0 ? (
              <span className="text-xs text-white/35 italic">No hidden tiles right now</span>
            ) : (
              <>
                {(settings.obsHiddenTiles || []).map((tileId: string) => {
                  const item = dashboardTiles.find((t) => t.id === tileId);
                  const title = item?.title || tileId;
                  return (
                    <button
                      key={`min-tile-${tileId}`}
                      type="button"
                      onClick={() => {
                        update({
                          obsHiddenTiles: (settings.obsHiddenTiles || []).filter((id) => id !== tileId),
                        });
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300 transition text-xs font-semibold shadow-sm group"
                      title={`Click to unhide "${title}" back to the dashboard`}
                    >
                      <span>🙈</span>
                      <span>{title}</span>
                      <span className="text-[10px] text-white/50 group-hover:text-emerald-300">👁️ Unhide</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => update({ obsHiddenTiles: [] })}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-bold text-xs shadow-sm ml-1"
                  title="Unhide all dashboard tiles"
                >
                  Unhide All ({(settings.obsHiddenTiles || []).length})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <FreeformBoard
        items={visibleDashboardTiles}
        layout={settings.obsBoardLayout || {}}
        onChange={(obsBoardLayout) => {
          update({ obsBoardLayout });
        }}
        onHide={(id) => {
          update({
            obsHiddenTiles: [...(settings.obsHiddenTiles || []), id],
          });
        }}
        onMinimize={(id) => {
          update({
            obsHiddenTiles: [...(settings.obsHiddenTiles || []), id],
          });
        }}
        editMode={editMode}
        minHeight={600}
      />

    </div>
  );
}

export const obsDashboardTab: Tab = {
  id: "obs",
  name: "OBS Dashboard",
  icon: <ObsIcon />,
  description: "OBS status, live preview, and performance dashboard.",
  Component: ObsDashboardModule,
};

export const goLiveModule = obsDashboardTab;
