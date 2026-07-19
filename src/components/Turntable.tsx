import type { SpotifyTrack } from "../lib/spotify";

/**
 * A vinyl turntable that uses the album art as the record's label.
 *
 * The vinyl spins when `track.isPlaying` is true; the tonearm swings
 * into position when playing and lifts off when paused/stopped.
 *
 * Fully sized by the parent — this component fills its container and
 * maintains a 1:1 aspect ratio.
 */
export function Turntable({
  track,
  size,
}: {
  track: SpotifyTrack | null;
  size: number;
}) {
  const playing = track?.isPlaying ?? false;
  const albumArt = track?.albumArt ?? "";

  // Progress percentage (used for the progress ring around the platter).
  const progress =
    track && track.durationMs > 0
      ? Math.min(100, (track.progressMs / track.durationMs) * 100)
      : 0;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={track ? `Now playing: ${track.name}` : "No track playing"}
    >
      {/* Platter — dark base with subtle radial highlight */}
      <div
        className="absolute inset-0 rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #2a2a2a 0%, #121212 55%, #070707 100%)",
        }}
      />

      {/* Progress ring (thin Spotify-green arc around the platter) */}
      {track && (
        <svg
          className="absolute inset-0 -rotate-90 pointer-events-none"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            stroke="rgba(29,185,84,0.15)"
            strokeWidth="0.6"
          />
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            stroke="#1DB954"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 49}
            strokeDashoffset={2 * Math.PI * 49 * (1 - progress / 100)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
      )}

      {/* Vinyl record — the bit that spins */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "6%",
          background:
            "radial-gradient(circle at center," +
            " #0a0a0a 0%," +
            " #0a0a0a 20%," +
            " #151515 21%," +
            " #0a0a0a 22%," +
            " #0a0a0a 28%," +
            " #151515 29%," +
            " #0a0a0a 30%," +
            " #0a0a0a 36%," +
            " #151515 37%," +
            " #0a0a0a 38%," +
            " #0a0a0a 44%," +
            " #151515 45%," +
            " #0a0a0a 46%," +
            " #0a0a0a 52%," +
            " #151515 53%," +
            " #0a0a0a 54%," +
            " #0a0a0a 60%," +
            " #151515 61%," +
            " #0a0a0a 62%," +
            " #0a0a0a 68%," +
            " #151515 69%," +
            " #0a0a0a 70%," +
            " #0a0a0a 76%," +
            " #151515 77%," +
            " #0a0a0a 78%," +
            " #0a0a0a 84%," +
            " #151515 85%," +
            " #0a0a0a 86%," +
            " #0a0a0a 92%," +
            " #151515 93%," +
            " #0a0a0a 94%," +
            " #0a0a0a 100%)",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 0 40px rgba(0,0,0,0.8)",
          animation: "vinyl-spin 3s linear infinite",
          animationPlayState: playing ? "running" : "paused",
        }}
      >
        {/* Subtle light streak across the vinyl for realism */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.06) 30deg, transparent 60deg, transparent 180deg, rgba(255,255,255,0.04) 210deg, transparent 240deg)",
            mixBlendMode: "screen",
          }}
        />

        {/* Album art label — covers most of the vinyl for a bold look */}
        <div
          className="absolute rounded-full overflow-hidden"
          style={{
            inset: "12%",
            boxShadow:
              "inset 0 0 0 2px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          {albumArt ? (
            <img
              src={albumArt}
              alt={track?.album ?? ""}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_35%_30%,#1DB954,#0a4d23)] text-white/80 font-black text-[10px]">
              SC
            </div>
          )}
        </div>

        {/* Center spindle hole */}
        <div
          className="absolute rounded-full"
          style={{
            inset: "48.5%",
            background: "#050505",
            boxShadow: "inset 0 0 4px rgba(0,0,0,0.9)",
          }}
        />
      </div>
    </div>
  );
}
