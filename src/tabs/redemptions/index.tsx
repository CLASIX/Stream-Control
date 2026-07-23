// ============================================================
// Stream Control — Redemptions Tab (SC-test-42)
// Channel Point Redemptions Manager
// ============================================================

import { useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "../../utils/cn";
import { useStore } from "../../lib/store";
import { TileCard } from "../../components/TileCard";


// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface RedemptionItem {
  id: string;
  title: string;
  description: string;
  points: number;
  enabled: boolean;

  // Media sources
  visualUrl?: string;     // GIF / MP4 / WEBM / PNG / JPG URL or file
  audioUrl?: string;      // MP3 / WAV / OGG / AAC URL or file
  visualFileName?: string;
  audioFileName?: string;

  // Behavior
  mergeAudioVisual: boolean; // Play sound + visual together
  durationMs: number;        // How long visual/pop-up shows
  volume: number;            // 0-100 for audio

  // Customization
  bannerText: string;        // Optional text overlay (supports %vars%)
  bannerEnabled: boolean;
  animation: string;         // bounce | zoom | fade | slide | none
  position: string;          // top_left | top_center | center | bottom_right | etc.
  themeColor: string;        // Hex color for banner/background accents

  // Variables
  variables: Record<string, string>;

  // Format info
  visualFormat: string;
  audioFormat: string;

  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────

const TrophyIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3v7a6 6 0 0 0 12 0V3" /><line x1="6" y1="21" x2="18" y2="21" /><circle cx="12" cy="9" r="5" />
  </svg>
);

const PlayIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
);

const PlusIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);

const TrashIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);

const CopyIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);



// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function detectVisualFormat(url?: string, name?: string): string {
  if (!url && !name) return "none";
  const combined = (url + (name || "")).toLowerCase();
  if (combined.includes(".gif")) return "gif";
  if (combined.includes(".mp4") || combined.includes(".mov") || combined.includes(".mkv")) return "video/mp4";
  if (combined.includes(".webm")) return "video/webm";
  if (combined.includes(".png")) return "image/png";
  if (combined.includes(".jpg") || combined.includes(".jpeg")) return "image/jpeg";
  if (combined.includes(".mp3") || combined.includes(".wav") || combined.includes(".ogg") || combined.includes(".aac")) return "audio";
  return "unknown";
}

function detectAudioFormat(url?: string, name?: string): string {
  if (!url && !name) return "none";
  const combined = (url + (name || "")).toLowerCase();
  if (combined.includes(".mp3")) return "audio/mpeg";
  if (combined.includes(".wav")) return "audio/wav";
  if (combined.includes(".ogg")) return "audio/ogg";
  if (combined.includes(".aac")) return "audio/aac";
  if (combined.includes(".mp4") || combined.includes(".gif") || combined.includes(".png")) return "visual";
  return "unknown";
}

// ─────────────────────────────────────────────
// DEFAULT DATA
// ─────────────────────────────────────────────

const DEFAULT_ITEMS: RedemptionItem[] = [
  {
    id: generateId(),
    title: "Hydration Check",
    description: "Remind everyone to drink water. Plays a splash sound with a bouncing water drop animation.",
    points: 500,
    enabled: true,
    visualUrl: "https://media.giphy.com/media/26FPy3QZQsMp1mbA6/giphy.gif",
    audioUrl: "https://www.myinstants.com/media/sounds/water-drop.mp3",
    visualFileName: "water-drop.gif",
    audioFileName: "water-drop.mp3",
    mergeAudioVisual: true,
    durationMs: 4500,
    volume: 80,
    bannerText: "💧 %user% redeemed %title% — Stay hydrated!",
    bannerEnabled: true,
    animation: "bounce",
    position: "center",
    themeColor: "#3b82f6",
    variables: { user: "Viewer", reward: "Hydration Check" },
    visualFormat: "gif",
    audioFormat: "audio/mpeg",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: generateId(),
    title: "Bomb Drop",
    description: "A loud explosion with a shaking blast visual for maximum stream chaos.",
    points: 1200,
    enabled: true,
    visualUrl: "https://media.giphy.com/media/oe33xf3B50fsc/giphy.gif",
    audioUrl: "https://www.myinstants.com/media/sounds/explosion.mp3",
    visualFileName: "explosion.gif",
    audioFileName: "explosion.mp3",
    mergeAudioVisual: true,
    durationMs: 5000,
    volume: 95,
    bannerText: "💣 %user% dropped the bomb! %title% activated!",
    bannerEnabled: true,
    animation: "shake",
    position: "top_center",
    themeColor: "#ef4444",
    variables: { user: "Viewer", reward: "Bomb Drop" },
    visualFormat: "gif",
    audioFormat: "audio/mpeg",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: generateId(),
    title: "Police Siren",
    description: "Triggers a siren sound and flashing alert visual. Use sparingly!",
    points: 800,
    enabled: true,
    visualUrl: "https://media.giphy.com/media/l41YmQjOz9qg2EsiQ/giphy.gif",
    audioUrl: "https://www.myinstants.com/media/sounds/police-siren.mp3",
    visualFileName: "siren.gif",
    audioFileName: "police-siren.mp3",
    mergeAudioVisual: true,
    durationMs: 4500,
    volume: 90,
    bannerText: "🚨 SIREN COMMAND TRIGGERED BY %user%!",
    bannerEnabled: true,
    animation: "zoom",
    position: "bottom_right",
    themeColor: "#f97316",
    variables: { user: "Viewer", reward: "Police Siren" },
    visualFormat: "gif",
    audioFormat: "audio/mpeg",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export function RedemptionsModule() {
  // Store hook available for future persistence if needed
  useStore();

  // Load from localStorage with version key, fallback to defaults
  const [items, setItems] = useState<RedemptionItem[]>(() => {
    try {
      const raw = localStorage.getItem("multichat:redemptions:v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_ITEMS;
  });

  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [playBackUrl, setPlayBackUrl] = useState<string | null>(null);
  const [playBackType, setPlayBackType] = useState<"visual" | "audio" | "merged" | null>(null);

  // Persist when items change (localStorage + server-side file for webhook access)
  useEffect(() => {
    try {
      localStorage.setItem("multichat:redemptions:v1", JSON.stringify(items));
      // Also sync to server file so webhook endpoint can read it
      fetch("/api/redemptions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch(() => {});
    } catch { /* ignore */ }
  }, [items]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.points.toString().includes(q)
    );
  }, [items, searchQuery]);

  // ── CRUD ──

  const createItem = useCallback(() => {
    const now = Date.now();
    const newItem: RedemptionItem = {
      id: generateId(),
      title: "New Redemption",
      description: "Describe what viewers get when they redeem this.",
      points: 300,
      enabled: true,
      visualUrl: "",
      audioUrl: "",
      visualFileName: "",
      audioFileName: "",
      mergeAudioVisual: false,
      durationMs: 4000,
      volume: 75,
      bannerText: "✨ %user% redeemed %title%!",
      bannerEnabled: true,
      animation: "bounce",
      position: "center",
      themeColor: "#a855f7",
      variables: {},
      visualFormat: "none",
      audioFormat: "none",
      createdAt: now,
      updatedAt: now,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
  }, []);

  const duplicateItem = useCallback((id: string) => {
    const src = items.find((i) => i.id === id);
    if (!src) return;
    const copy = { ...src, id: generateId(), title: `${src.title} (Copy)`, updatedAt: Date.now() };
    setItems((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  }, [items]);

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  const updateItem = useCallback((id: string, patch: Partial<RedemptionItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i))
    );
  }, []);

  // ── Test Playback ──

  const testItem = useCallback(
    (item: RedemptionItem) => {
      // Play audio
      if (item.audioUrl && item.audioUrl.trim()) {
        try {
          const audio = new Audio(item.audioUrl);
          audio.volume = Math.max(0, Math.min(1, item.volume / 100));
          audio.play().catch(() => {});
        } catch { /* ignore */ }
      }

      // Show visual in preview
      if (item.visualUrl && item.visualUrl.trim()) {
        setPlayBackUrl(item.visualUrl);
        setPlayBackType(item.mergeAudioVisual ? (item.audioUrl ? "merged" : "visual") : "visual");
        setTimeout(() => {
          setPlayBackUrl(null);
          setPlayBackType(null);
        }, item.durationMs);
      } else if (!item.visualUrl && item.audioUrl && item.audioUrl.trim()) {
        setPlayBackType("audio");
        setTimeout(() => setPlayBackType(null), item.durationMs);
      }
    },
    []
  );

  // Listen for Twitch webhook trigger events
  useEffect(() => {
    const api = (window as any)?.streamControl?.twitchWebhook;
    if (!api || !api.onTrigger) return;
    const unsubscribe = api.onTrigger((triggerItem: any) => {
      if (triggerItem && triggerItem.title) {
        const match = items.find(
          (i) => i.enabled && i.title.toLowerCase() === (triggerItem.title || "").toLowerCase()
        );
        if (match) {
          setSelectedId(match.id);
          testItem(match);
        }
      }
    });
    return () => unsubscribe?.();
  }, [items, testItem]);

  // ── Variables Substitution ──

  const resolveVariables = useCallback(
    (template: string, item: RedemptionItem, userName: string = "TestViewer") => {
      let result = template;
      result = result.replace(/%user%/g, userName);
      result = result.replace(/%title%/g, item.title);
      result = result.replace(/%points%/g, String(item.points));
      result = result.replace(/%description%/g, item.description);
      Object.entries(item.variables).forEach(([k, v]) => {
        result = result.replace(new RegExp(`%${k}%`, "g"), v);
      });
      return result;
    },
    []
  );

  // ── Render ──

  return (
    <div className="flex flex-col h-screen bg-[#0c0c10] text-white overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-white/8 bg-[#0c0c10] px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-amber-500/20 border border-violet-500/20 flex items-center justify-center shadow-lg shadow-violet-900/20">
              <TrophyIcon />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white">Redemptions</h1>
              <p className="text-xs text-white/30">Channel Point rewards · Highly customizable · Multi-format support</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTestPanel(!showTestPanel)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all",
                showTestPanel ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/8"
              )}
            >
              <PlayIcon /> Test Playback
            </button>
            <button
              onClick={createItem}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600/90 px-3.5 py-2 text-xs font-bold text-white hover:bg-violet-600 shadow-md shadow-violet-900/30 transition-all"
            >
              <PlusIcon /> New Redemption
            </button>
          </div>
        </div>
      </header>

      {/* Test Playback Preview */}
      {showTestPanel && selected && (
        <section className="flex-shrink-0 border-b border-white/8 bg-[#111118] px-5 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-wide">Live Preview</h3>
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] text-white/20">Plays exactly as configured for stream events</span>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-2xl shadow-black/50 h-[200px] flex items-center justify-center select-none">
              {/* Banner */}
              {selected.bannerEnabled && (
                <div
                  className={cn(
                    "absolute top-4 left-4 right-4 z-20 rounded-xl px-4 py-2.5 text-sm font-extrabold shadow-xl backdrop-blur-md",
                    "text-white border border-white/20",
                    "bg-gradient-to-r"
                  )}
                  style={{
                    backgroundColor: selected.themeColor + "40",
                    borderColor: selected.themeColor + "50",
                  }}
                >
                  <span className="drop-shadow-md">{resolveVariables(selected.bannerText, selected, "StreamFan99")}</span>
                </div>
              )}

              {/* Visual */}
              {playBackUrl && selected.visualUrl && (
                <img
                  src={playBackUrl}
                  alt="Redemption visual"
                  className={cn(
                    "w-full h-full object-contain transition-transform duration-300",
                    selected.animation === "bounce" ? "animate-bounce" : "",
                    selected.animation === "zoom" ? "scale-110" : "",
                    selected.animation === "fade" ? "opacity-90" : "",
                  )}
                  style={{
                    animation: selected.animation === "bounce" ? "bounce 1s infinite" : undefined,
                  }}
                />
              )}

              {/* Audio indicator */}
              {!playBackUrl && playBackType === "audio" && (
                <div className="flex flex-col items-center gap-2 text-white/20">
                  <div className="w-16 h-16 rounded-full border-2 border-white/10 flex items-center justify-center animate-pulse">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-3v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                  </div>
                  <span className="text-xs">Playing audio: {selected.audioFileName || "sound"}</span>
                </div>
              )}

              {/* Merged indicator */}
              {playBackType === "merged" && (
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur px-2 py-1 rounded-md text-[10px] text-white/40 border border-white/5">
                  Merged: Visual + Audio
                </div>
              )}

              {/* Empty / no media */}
              {!playBackUrl && !playBackType && (
                <div className="flex flex-col items-center gap-2 text-white/10">
                  <span className="text-4xl">🎬</span>
                  <span className="text-xs">Click "Test Playback" to preview</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => selected && testItem(selected)}
                className="rounded-lg bg-emerald-600/90 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 transition-all"
              >
                ▶ Play {selected.title}
              </button>
              <span className="text-[11px] text-white/30">
                Duration: {(selected.durationMs / 1000).toFixed(1)}s · Volume: {selected.volume}% · Points: {selected.points}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Redemption Cards List */}
        <aside className="w-full md:w-[340px] lg:w-[380px] flex-shrink-0 border-r border-white/8 bg-[#0c0c10] overflow-y-auto">
          <div className="p-4 border-b border-white/8 bg-gradient-to-b from-[#0c0c10] to-transparent">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-white/30 mb-2">Redemption Catalog</h2>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, description, points..."
                className="w-full rounded-xl border border-white/8 bg-[#16161d] px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
              />
            </div>
          </div>

          <div className="p-3 flex flex-col gap-2">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <span className="text-4xl opacity-20">🏆</span>
                <p className="text-sm text-white/40">No redemptions found</p>
                <button onClick={createItem} className="rounded-lg bg-violet-600/80 px-4 py-2 text-xs font-bold text-white hover:bg-violet-600">Create First</button>
              </div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "text-left rounded-2xl border p-3.5 transition-all shadow-sm",
                    selectedId === item.id
                      ? "border-violet-500/40 bg-violet-500/5 shadow-violet-900/10 ring-1 ring-violet-500/20"
                      : "border-white/8 bg-[#111118] hover:border-white/15 hover:bg-[#161620] hover:-translate-y-0.5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Visual thumbnail */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-white/5 flex-shrink-0 shadow-inner">
                      {item.visualUrl ? (
                        <img src={item.visualUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/10 text-[10px]">No Visual</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={cn("text-sm font-extrabold truncate", selectedId === item.id ? "text-violet-200" : "text-white")}>
                          {item.title}
                        </h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold", item.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300")}>
                          {item.enabled ? "ON" : "OFF"}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/30 truncate mt-0.5">{item.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25 font-medium">
                        <span className="text-amber-300/80">★ {item.points} pts</span>
                        <span>·</span>
                        <span>{item.animation} · {item.position}</span>
                        <span>·</span>
                        <span className="text-violet-300/60">{item.mergeAudioVisual ? "Merged" : item.audioUrl ? "Audio" : item.visualUrl ? "Visual" : "Text Only"}</span>
                      </div>
                      {/* Format tags */}
                      <div className="flex items-center gap-1 mt-1.5">
                        {item.visualFormat !== "none" && item.visualUrl && (
                          <span className="text-[9px] rounded bg-white/5 text-white/30 px-1 py-0.5 border border-white/5">{item.visualFormat}</span>
                        )}
                        {item.audioFormat !== "none" && item.audioUrl && (
                          <span className="text-[9px] rounded bg-white/5 text-white/30 px-1 py-0.5 border border-white/5">{item.audioFormat}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right: Editor */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-[#0f0f14] to-[#0c0c10]">
          {/* Copy session + broadcaster info section */}
          <div className="max-w-3xl mx-auto px-6 pt-6">
            <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-900/20 to-violet-950/30 px-5 py-4 shadow-lg shadow-violet-900/10">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-extrabold text-violet-300 uppercase tracking-wide">Subscription Setup</span>
                <div className="flex-1 h-px bg-violet-500/10" />
                <span className="text-[10px] text-white/30">WebSocket mode — no tunnel needed</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={async () => {
                    try {
                      const res = await (window as any).streamControl?.twitchWebhook?.getSessionId?.();
                      const sid = res?.sessionId || "(no session yet)";
                      await navigator.clipboard.writeText(String(sid));
                    } catch { /* ignore */ }
                  }}
                  className="flex items-center gap-2 rounded-xl bg-[#16161d] border border-white/10 px-3 py-2.5 text-xs text-white/70 hover:text-white hover:border-violet-500/30 transition-all text-left"
                >
                  <CopyIcon />
                  <span className="font-extrabold text-violet-300">Session ID</span>
                  <span className="text-[10px] text-white/20 truncate ml-auto">Copy for subscribe_websocket.sh</span>
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="YOUR_NUMERIC_TWITCH_ID"
                    defaultValue={localStorage.getItem("multichat:broadcaster_user_id") || ""}
                    onBlur={(e) => localStorage.setItem("multichat:broadcaster_user_id", e.target.value)}
                    className="flex-1 rounded-xl border border-white/10 bg-[#16161d] px-3 py-2.5 text-xs text-white/70 placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
                  />
                  <button
                    onClick={async () => {
                      const id = localStorage.getItem("multichat:broadcaster_user_id") || "";
                      if (id) await navigator.clipboard.writeText(id);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-violet-600/20 border border-violet-500/30 px-3 py-2.5 text-xs font-extrabold text-violet-300 hover:bg-violet-600/30 transition-all"
                    title="Copy broadcaster user ID"
                  >
                    <CopyIcon /> Copy
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-white/20 leading-relaxed">Paste the session ID and broadcaster ID into subscribe_websocket.sh → run it → done. No tunnel. Zero cost.</p>
            </div>
          </div>

          {selected ? (
            <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
              {/* Title Bar */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-white tracking-tight">{selected.title}</h2>
                  <p className="text-xs text-white/30 mt-1">Redemption ID: {selected.id.slice(-8)} · Points: {selected.points}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => duplicateItem(selected.id)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                    title="Duplicate"
                  >
                    <CopyIcon />
                  </button>
                  <button
                    onClick={() => deleteItem(selected.id)}
                    className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-colors hover:text-red-200"
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {/* Main Editor Card */}
              <TileCard title="Redemption Settings" editMode={false}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-white/30">Title</label>
                    <input
                      type="text"
                      value={selected.title}
                      onChange={(e) => updateItem(selected.id, { title: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#16161d] px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
                      placeholder="Redemption name"
                    />

                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-white/30 mt-1">Description</label>
                    <textarea
                      value={selected.description}
                      onChange={(e) => updateItem(selected.id, { description: e.target.value })}
                      rows={3}
                      className="w-full rounded-xl border border-white/10 bg-[#16161d] px-4 py-3 text-sm text-white/80 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 resize-none transition-all"
                      placeholder="What viewers get..."
                    />

                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-white/30 mt-1">Points Cost</label>
                    <input
                      type="number"
                      min={50}
                      max={50000}
                      step={50}
                      value={selected.points}
                      onChange={(e) => updateItem(selected.id, { points: Number(e.target.value) })}
                      className="w-full rounded-xl border border-white/10 bg-[#16161d] px-4 py-3 text-sm font-mono text-amber-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
                    />

                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-white/30 mt-1">Enabled</label>
                    <button
                      onClick={() => updateItem(selected.id, { enabled: !selected.enabled })}
                      className={cn(
                        "w-full rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all shadow-inner",
                        selected.enabled ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : "bg-red-500/15 text-red-300 border border-red-500/20"
                      )}
                    >
                      {selected.enabled ? "✓ Active — Viewers can redeem" : "✗ Disabled — Hidden from viewers"}
                    </button>
                  </div>

                  {/* Upload / Sources */}
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-white/30">Visual Source</label>
                    <input
                      type="text"
                      value={selected.visualUrl || ""}
                      onChange={(e) => {
                        const url = e.target.value;
                        updateItem(selected.id, {
                          visualUrl: url,
                          visualFileName: url ? url.split("/").pop() || "visual" : "",
                          visualFormat: detectVisualFormat(url),
                        });
                      }}
                      placeholder="https://example.com/gif.gif or file path"
                      className="w-full rounded-xl border border-white/10 bg-[#16161d] px-4 py-3 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/20">Supports: GIF, MP4, WEBM, PNG, JPG</span>
                      <span className="text-[10px] rounded bg-white/5 text-white/20 px-1.5 py-0.5 font-mono">{selected.visualFormat}</span>
                    </div>

                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-white/30 mt-1">Audio Source</label>
                    <input
                      type="text"
                      value={selected.audioUrl || ""}
                      onChange={(e) => {
                        const url = e.target.value;
                        updateItem(selected.id, {
                          audioUrl: url,
                          audioFileName: url ? url.split("/").pop() || "audio" : "",
                          audioFormat: detectAudioFormat(url),
                        });
                      }}
                      placeholder="https://example.com/sound.mp3 or file path"
                      className="w-full rounded-xl border border-white/10 bg-[#16161d] px-4 py-3 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/20">Supports: MP3, WAV, OGG, AAC</span>
                      <span className="text-[10px] rounded bg-white/5 text-white/20 px-1.5 py-0.5 font-mono">{selected.audioFormat}</span>
                    </div>
                  </div>
                </div>
              </TileCard>

              {/* Merge & Playback Settings */}
              <TileCard title="Merge & Playback" editMode={false}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => updateItem(selected.id, { mergeAudioVisual: true })}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-left transition-all shadow-lg",
                      selected.mergeAudioVisual
                        ? "border-violet-500/40 bg-violet-500/10 text-violet-200 shadow-violet-900/20"
                        : "border-white/5 bg-[#16161d] text-white/40 hover:text-white hover:border-white/15"
                    )}
                  >
                    <div className="text-xl mb-1">🎬 + 🔊</div>
                    <h4 className="text-sm font-extrabold">Merged</h4>
                    <p className="text-[11px] text-white/30 mt-1">Play sound and visual simultaneously for full impact.</p>
                  </button>

                  <button
                    onClick={() => updateItem(selected.id, { mergeAudioVisual: false, audioUrl: "", visualUrl: selected.visualUrl })}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-left transition-all shadow-lg",
                      !selected.mergeAudioVisual && selected.visualUrl && !selected.audioUrl
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-200 shadow-amber-900/20"
                        : "border-white/5 bg-[#16161d] text-white/40 hover:text-white hover:border-white/15"
                    )}
                  >
                    <div className="text-xl mb-1">🎬</div>
                    <h4 className="text-sm font-extrabold">Visual Only</h4>
                    <p className="text-[11px] text-white/30 mt-1">Just the GIF/video/image without any sound.</p>
                  </button>

                  <button
                    onClick={() => updateItem(selected.id, { mergeAudioVisual: false, visualUrl: "", audioUrl: selected.audioUrl })}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-left transition-all shadow-lg",
                      !selected.mergeAudioVisual && selected.audioUrl && !selected.visualUrl
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-emerald-900/20"
                        : "border-white/5 bg-[#16161d] text-white/40 hover:text-white hover:border-white/15"
                    )}
                  >
                    <div className="text-xl mb-1">🔊</div>
                    <h4 className="text-sm font-extrabold">Audio Only</h4>
                    <p className="text-[11px] text-white/30 mt-1">Just the sound clip — great for soundboard-style effects.</p>
                  </button>
                </div>
              </TileCard>

              {/* Customization Variables */}
              <TileCard title="Customization Variables" editMode={false}>
                <div className="flex flex-col gap-4">
                  {/* Duration */}
                  <div className="flex items-center gap-4">
                    <label className="text-xs font-extrabold text-white/40 w-24 shrink-0">Duration (ms)</label>
                    <input
                      type="range"
                      min={500}
                      max={20000}
                      step={500}
                      value={selected.durationMs}
                      onChange={(e) => updateItem(selected.id, { durationMs: Number(e.target.value) })}
                      className="flex-1 accent-violet-500 h-2"
                    />
                    <span className="text-xs font-mono text-violet-300 w-16 text-right">{(selected.durationMs / 1000).toFixed(1)}s</span>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-4">
                    <label className="text-xs font-extrabold text-white/40 w-24 shrink-0">Volume %</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={selected.volume}
                      onChange={(e) => updateItem(selected.id, { volume: Number(e.target.value) })}
                      className="flex-1 accent-violet-500 h-2"
                    />
                    <span className="text-xs font-mono text-violet-300 w-16 text-right">{selected.volume}%</span>
                  </div>

                  {/* Banner Text */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-white/30">Banner Text (supports %variables%)</label>
                    <textarea
                      value={selected.bannerText}
                      onChange={(e) => updateItem(selected.id, { bannerText: e.target.value })}
                      rows={2}
                      className="w-full rounded-xl border border-white/10 bg-[#16161d] px-4 py-3 text-sm text-white/80 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none transition-all"
                      placeholder="✨ %user% redeemed %title%!"
                    />
                    <div className="flex items-center gap-3 text-[10px] text-white/20">
                      <span>Available variables:</span>
                      <code>%user%</code>
                      <code>%title%</code>
                      <code>%points%</code>
                      <code>%description%</code>
                      <span>+ any custom variables below</span>
                    </div>
                  </div>

                  {/* Banner Toggle */}
                  <button
                    onClick={() => updateItem(selected.id, { bannerEnabled: !selected.bannerEnabled })}
                    className={cn(
                      "w-fit rounded-xl px-4 py-2 text-xs font-extrabold transition-all",
                      selected.bannerEnabled ? "bg-violet-500/15 text-violet-300 border border-violet-500/20" : "bg-white/5 text-white/30 border border-white/10 hover:text-white/50"
                    )}
                  >
                    {selected.bannerEnabled ? "✓ Banner Enabled" : "✗ Banner Disabled"}
                  </button>

                  {/* Animation */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-extrabold text-white/40 w-24 shrink-0">Animation</label>
                    <select
                      value={selected.animation}
                      onChange={(e) => updateItem(selected.id, { animation: e.target.value })}
                      className="flex-1 rounded-xl border border-white/10 bg-[#16161d] px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    >
                      <option value="none">None</option>
                      <option value="bounce">Bounce</option>
                      <option value="zoom">Zoom</option>
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="shake">Shake</option>
                    </select>
                  </div>

                  {/* Position */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-extrabold text-white/40 w-24 shrink-0">Position</label>
                    <select
                      value={selected.position}
                      onChange={(e) => updateItem(selected.id, { position: e.target.value })}
                      className="flex-1 rounded-xl border border-white/10 bg-[#16161d] px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    >
                      <option value="top_left">Top Left</option>
                      <option value="top_center">Top Center</option>
                      <option value="top_right">Top Right</option>
                      <option value="center_left">Center Left</option>
                      <option value="center">Center</option>
                      <option value="center_right">Center Right</option>
                      <option value="bottom_left">Bottom Left</option>
                      <option value="bottom_center">Bottom Center</option>
                      <option value="bottom_right">Bottom Right</option>
                    </select>
                  </div>

                  {/* Theme Color */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-extrabold text-white/40 w-24 shrink-0">Theme Color</label>
                    <input
                      type="color"
                      value={selected.themeColor}
                      onChange={(e) => updateItem(selected.id, { themeColor: e.target.value })}
                      className="w-10 h-10 rounded-lg border-0 bg-transparent p-0 cursor-pointer shadow-none"
                    />
                    <input
                      type="text"
                      value={selected.themeColor}
                      onChange={(e) => updateItem(selected.id, { themeColor: e.target.value })}
                      className="flex-1 rounded-xl border border-white/10 bg-[#16161d] px-3 py-2 text-xs font-mono text-white/80 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                  </div>
                </div>
              </TileCard>

              {/* Custom Variables Editor */}
              <TileCard title="Custom Variables" editMode={false}>
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-white/30">Add variables that will be substituted in banner text. Example: <code className="text-violet-300">%user%</code> → viewer name.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(selected.variables).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 rounded-xl bg-[#16161d] border border-white/5 px-3 py-2">
                        <span className="text-xs font-mono text-violet-300">%{k}%</span>
                        <span className="text-white/20">=</span>
                        <input
                          type="text"
                          value={v}
                          onChange={(e) => {
                            const next = { ...selected.variables, [k]: e.target.value };
                            updateItem(selected.id, { variables: next });
                          }}
                          className="flex-1 bg-transparent text-xs text-white/70 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            const next = { ...selected.variables };
                            delete next[k];
                            updateItem(selected.id, { variables: next });
                          }}
                          className="text-red-400/50 hover:text-red-400 text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="variable_name"
                      className="flex-1 rounded-xl border border-white/10 bg-[#16161d] px-3 py-2 text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const target = e.currentTarget;
                          const valInput = target.nextElementSibling as HTMLInputElement;
                          const name = target.value.trim();
                          const value = valInput?.value?.trim() || "";
                          if (name) {
                            const next = { ...selected.variables, [name]: value };
                            updateItem(selected.id, { variables: next });
                            target.value = "";
                            valInput.value = "";
                          }
                        }
                      }}
                    />
                    <input
                      type="text"
                      placeholder="value"
                      className="flex-1 rounded-xl border border-white/10 bg-[#16161d] px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                    <button
                      onClick={() => {
                        const nameInput = document.querySelector('input[placeholder="variable_name"]') as HTMLInputElement;
                        const valInput = document.querySelector('input[placeholder="value"]') as HTMLInputElement;
                        const name = nameInput?.value?.trim();
                        const value = valInput?.value?.trim() || "";
                        if (name) {
                          const next = { ...selected.variables, [name]: value };
                          updateItem(selected.id, { variables: next });
                          nameInput.value = "";
                          valInput.value = "";
                        }
                      }}
                      className="rounded-xl bg-violet-600/90 px-4 py-2 text-xs font-extrabold text-white hover:bg-violet-600 shadow-md shadow-violet-900/20"
                    >
                      + Add Variable
                    </button>
                  </div>
                </div>
              </TileCard>

              {/* Preview Card */}
              <TileCard title="Live Preview (Merge Simulation)" editMode={false}>
                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl overflow-hidden bg-black/50 border border-white/10 shadow-2xl shadow-black/40 h-[240px] relative flex items-center justify-center">
                    {/* Banner */}
                    {selected.bannerEnabled && (
                      <div
                        className="absolute top-4 left-4 right-4 z-20 rounded-xl px-4 py-2.5 text-sm font-extrabold shadow-xl backdrop-blur-md text-white border"
                        style={{ backgroundColor: selected.themeColor + "30", borderColor: selected.themeColor + "40" }}
                      >
                        {resolveVariables(selected.bannerText, selected, "TestViewer99")}
                      </div>
                    )}
                    {/* Visual */}
                    {selected.visualUrl ? (
                      <img
                        src={selected.visualUrl}
                        alt="Preview"
                        className="w-full h-full object-contain"
                        style={{
                          animation: selected.animation === "bounce" ? "bounce 2s infinite" : undefined,
                          transform: selected.animation === "zoom" ? "scale(1.15)" : "scale(1)",
                          opacity: selected.animation === "fade" ? 0.85 : 1,
                        }}
                      />
                    ) : (
                      <div className="text-white/10 text-sm">No visual configured</div>
                    )}
                    {/* Audio indicator */}
                    {selected.audioUrl && (
                      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] text-white/40 flex items-center gap-1.5 border border-white/5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Audio: {selected.audioFileName || selected.audioUrl.split("/").pop() || "sound"}
                      </div>
                    )}
                    {/* Merge badge */}
                    {selected.mergeAudioVisual && selected.audioUrl && selected.visualUrl && (
                      <div className="absolute bottom-3 left-3 bg-violet-600/90 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-white shadow-lg shadow-violet-900/30">
                        MERGED: Audio + Visual
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => selected && testItem(selected)}
                    className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-4 text-base font-extrabold text-white shadow-xl shadow-violet-900/30 hover:shadow-2xl hover:shadow-violet-900/40 hover:-translate-y-0.5 transition-all"
                  >
                    ▶ Play Redemption: {selected.title}
                  </button>
                  <p className="text-[10px] text-white/20 text-center">Click to trigger exactly as it would play during a live stream event.</p>
                </div>
              </TileCard>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-white/10 gap-4">
              <div className="h-16 w-16 rounded-3xl bg-violet-500/10 border border-violet-500/10 flex items-center justify-center text-3xl shadow-inner">🏆</div>
              <div className="text-center">
                <h3 className="text-lg font-extrabold text-white/50">Select a Redemption</h3>
                <p className="text-xs text-white/20 mt-1">Or click "New Redemption" to create your first reward.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Export tab object for registry
export const redemptionsTab = {
  id: "redemptions",
  name: "Redemptions",
  icon: <TrophyIcon />,
  description: "Channel point rewards with multi-format media, merge, customization, and live preview.",
  Component: RedemptionsModule,
};
