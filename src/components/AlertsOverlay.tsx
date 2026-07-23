/**
 * Standalone Alerts Browser Source Overlay (?overlay=alerts).
 *
 * Add as a Browser Source in OBS Studio (1920×1080 recommended, check "Control audio via OBS").
 *
 * Listens for incoming visual/audio alerts via BroadcastChannel ("sc:alerts-overlay-channel")
 * and local window custom events ("sc:alerts-overlay-event"), queuing items and animating them onto the screen.
 */
import { useEffect, useRef, useState } from "react";

interface QueuedAlert {
  id: string;
  type: "visual" | "audio";
  url?: string;
  bannerText?: string;
  durationMs?: number;
  animation?: "fade" | "bounce" | "zoom" | "slide-top" | "slide-bottom";
  volume?: number;
}

export function AlertsOverlay({}: { params?: URLSearchParams }) {
  const [queue, setQueue] = useState<QueuedAlert[]>([]);
  const [activeAlert, setActiveAlert] = useState<QueuedAlert | null>(null);
  const [animState, setAnimState] = useState<"enter" | "showing" | "exit">("enter");
  const [imageError, setImageError] = useState(false);
  const seenIdsRef = useRef<Set<number | string>>(new Set());
  const lastSeenPollRef = useRef<number>(0);

  // Subscribe to BroadcastChannel, Window events, Storage events & HTTP Polling
  useEffect(() => {
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("sc:alerts-overlay-channel") : null;

    const pushEvent = (data: any) => {
      if (!data) return;
      const t = data.type === "audio" || data.type === "play_audio" ? "audio" : data.type === "visual" || data.type === "display_visual" ? "visual" : null;
      if (!t) return;
      const dedupeKey = data._id || data.id || `${data.url || data.src}-${data.bannerText}-${Math.floor(Date.now() / 1000)}`;
      if (seenIdsRef.current.has(dedupeKey)) return;
      seenIdsRef.current.add(dedupeKey);
      if (seenIdsRef.current.size > 200) seenIdsRef.current.clear();

      const url = data.url || data.src || "";
      const isPureAudio = t === "audio" || (/\.(mp3|wav|ogg|aac|flac)$/i.test(url) && !data.bannerText);

      // Play audio instantly without blocking or occupying visual queue if it's pure sound
      if (isPureAudio && url) {
        try {
          const a = new Audio(url);
          a.volume = Math.max(0, Math.min(1, (typeof data.volume === "number" ? data.volume : 80) / 100));
          a.play().catch(() => {});
        } catch {
          /* ignore */
        }
        return;
      }

      const item: QueuedAlert = {
        id: `alt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "visual",
        url,
        bannerText: data.bannerText || data.text,
        durationMs: typeof data.durationMs === "number" && data.durationMs > 0 ? data.durationMs : 4500,
        animation: data.animation || "bounce",
        volume: typeof data.volume === "number" ? data.volume : 80,
      };
      setQueue((prev) => [...prev, item]);
    };

    const onChannelMsg = (e: MessageEvent) => pushEvent(e.data);
    const onWindowMsg = (e: CustomEvent) => pushEvent(e.detail);
    const onStorageMsg = (e: StorageEvent) => {
      if (e.key === "sc:alerts-overlay-event" && e.newValue) {
        try {
          pushEvent(JSON.parse(e.newValue));
        } catch {
          /* ignore */
        }
      }
    };

    channel?.addEventListener("message", onChannelMsg);
    window.addEventListener("sc:alerts-overlay-event" as any, onWindowMsg);
    window.addEventListener("storage", onStorageMsg);

    // Also poll desktop HTTP server every 600ms for browser sources running on different origins
    const pollTimer = setInterval(async () => {
      const endpoints = [
        `/api/alerts/poll?since=${lastSeenPollRef.current}`,
        `http://localhost:8080/api/alerts/poll?since=${lastSeenPollRef.current}`,
        `http://127.0.0.1:8080/api/alerts/poll?since=${lastSeenPollRef.current}`,
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data?.items)) {
            // If this is the very first successful check when overlay starts (lastSeenPollRef is 0),
            // initialize to max ID without replaying historical test alerts
            if (lastSeenPollRef.current === 0) {
              let maxId = typeof data.now === "number" ? data.now : 0;
              for (const it of data.items) {
                if (typeof it._id === "number" && it._id > maxId) maxId = it._id;
              }
              lastSeenPollRef.current = maxId > 0 ? maxId : Date.now();
            } else {
              for (const it of data.items) {
                if (typeof it._id === "number" && it._id > lastSeenPollRef.current) {
                  lastSeenPollRef.current = it._id;
                }
                pushEvent(it);
              }
            }
          } else if (lastSeenPollRef.current === 0 && typeof data?.now === "number") {
            lastSeenPollRef.current = data.now;
          }
          break; // Stop checking fallback origins once one succeeds
        } catch {
          /* try next endpoint */
        }
      }
    }, 600);

    return () => {
      channel?.removeEventListener("message", onChannelMsg);
      channel?.close();
      window.removeEventListener("sc:alerts-overlay-event" as any, onWindowMsg);
      window.removeEventListener("storage", onStorageMsg);
      clearInterval(pollTimer);
    };
  }, []);

  // Process FIFO queue
  useEffect(() => {
    if (activeAlert || queue.length === 0) return;
    const next = queue[0];
    setQueue((prev) => prev.slice(1));
    setActiveAlert(next);
    setAnimState("enter");
    setImageError(false);

    if (next.url && /\.(mp3|wav|ogg|aac|flac)$/i.test(next.url)) {
      try {
        const a = new Audio(next.url);
        a.volume = Math.max(0, Math.min(1, (next.volume ?? 80) / 100));
        a.play().catch(() => {});
      } catch {
        /* ignore */
      }
    }

    setTimeout(() => setAnimState("showing"), 50);
    const dur = next.durationMs || 4500;
    const exitTimer = setTimeout(() => {
      setAnimState("exit");
      setTimeout(() => {
        setActiveAlert(null);
      }, 500);
    }, dur);

    return () => {
      clearTimeout(exitTimer);
    };
  }, [queue, activeAlert]);

  // If no active visual alert, render transparent screen
  if (!activeAlert) {
    return <div className="h-screen w-screen bg-transparent overflow-hidden select-none pointer-events-none" />;
  }

  const animClasses = {
    enter: "opacity-0 scale-90 translate-y-8",
    showing: "opacity-100 scale-100 translate-y-0",
    exit: "opacity-0 scale-110 -translate-y-8",
  }[animState];

  return (
    <div className="h-screen w-screen bg-transparent overflow-hidden select-none pointer-events-none flex items-center justify-center p-12 font-sans text-white">
      <div
        className={`flex flex-col items-center justify-center max-w-3xl transition-all duration-500 ease-out transform ${animClasses}`}
      >
        {activeAlert.url && !imageError && !/\.(mp3|wav|ogg|aac|flac)$/i.test(activeAlert.url) && (
          <div className="max-h-[500px] max-w-[650px] overflow-hidden rounded-3xl drop-shadow-[0_24px_60px_rgba(0,0,0,0.8)] relative">
            <img
              src={activeAlert.url}
              alt="Alert graphic"
              onError={() => setImageError(true)}
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {activeAlert.bannerText && (
          <div className="mt-6 bg-gradient-to-r from-[#9146FF] via-[#7b2cbf] to-[#ec4899] px-8 py-4 rounded-2xl shadow-[0_16px_40px_rgba(145,70,255,0.45)] border border-white/30 text-center">
            <p className="text-3xl font-extrabold tracking-tight drop-shadow-md whitespace-pre-wrap leading-tight">
              {activeAlert.bannerText}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
