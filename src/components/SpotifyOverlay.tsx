/**
 * OBS browser-source for Now Playing ONLY.
 *
 * Activated by `?overlay=now-playing`.
 *
 * The card measures the Browser Source dimensions and renders every
 * element at that resolution. No transforms, no post-raster scaling.
 * Set OBS to 800×120 → card renders at 800×120 pixels → crisp.
 *
 * URL params:
 *   overlay=now-playing
 *   client / refresh — only used in spotify-api mode
 *   mode             — local-player | spotify-api
 *   bg=transparent   — transparent page background (default)
 *   debug=1          — connection diagnostics
 */
import { useEffect, useState } from "react";
import { useSpotify } from "../hooks/useSpotify";
import { NowPlayingDisplay } from "./NowPlayingDisplay";

interface Props {
  params: URLSearchParams;
}

export function SpotifyOverlay({ params }: Props) {
  const clientId = params.get("client") ?? "";
  const refresh = params.get("refresh") ?? "";
  const transparent = params.get("bg") !== "opaque";
  const debug = params.get("debug") === "1";
  const mode = (params.get("mode") ?? "local-player") as
    | "spotify-api"
    | "local-player";

  const { auth, track, error } = useSpotify({
    clientId,
    seedRefreshToken: refresh || undefined,
    persist: false,
    handleCallback: false,
    mode,
  });

  // Smooth show/hide
  const FADE_MS = 700;
  const GRACE_MS = 600;
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const active = Boolean(track && track.isPlaying);

    if (active) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    const graceTimer = setTimeout(() => setShown(false), GRACE_MS);
    const unmountTimer = setTimeout(
      () => setMounted(false),
      GRACE_MS + FADE_MS
    );
    return () => {
      clearTimeout(graceTimer);
      clearTimeout(unmountTimer);
    };
  }, [track?.isPlaying, track?.id]);

  if (debug) {
    return (
      <div
        className="h-screen w-screen overflow-auto p-6 font-mono text-sm text-white"
        style={{ background: transparent ? "transparent" : "#0e0e12" }}
      >
        <h1 className="mb-4 text-lg font-bold text-[#1DB954]">
          Now Playing — Debug
        </h1>
        <div className="space-y-2">
          <Row label="Mode" value={mode} />
          {mode === "spotify-api" && (
            <>
              <Row label="Client ID" value={clientId || "missing"} bad={!clientId} />
              <Row label="Refresh token" value={refresh ? "set" : "missing"} bad={!refresh} />
            </>
          )}
          <Row label="Auth" value={auth} bad={auth === "error"} />
          <Row label="Track" value={track ? `${track.name} — ${track.artist}` : "none"} />
          <Row label="Playing" value={track ? String(track.isPlaying) : "—"} />
          <Row label="Error" value={error ?? "none"} bad={!!error} />
        </div>
      </div>
    );
  }

  if (mode === "spotify-api" && (!clientId || !refresh)) {
    return <div className="h-screen w-screen bg-transparent" />;
  }

  if (!mounted) {
    return (
      <div
        className="h-screen w-screen"
        style={{ background: transparent ? "transparent" : "#0e0e12" }}
      />
    );
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{
        background: transparent ? "transparent" : "#0e0e12",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          opacity: shown ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      >
        <NowPlayingDisplay track={track} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bad,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-48 shrink-0 text-white/50">{label}:</span>
      <span className={bad ? "text-red-400" : "text-emerald-400"}>{value}</span>
    </div>
  );
}
